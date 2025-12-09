/**
 * Simple Orders Sync - Based on the working 30-day pattern
 *
 * GET /api/amazon/sync/simple-orders - Check status
 * POST /api/amazon/sync/simple-orders?days=30 - Start sync
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

export const dynamic = 'force-dynamic'

// Simple state
let syncStatus = {
  running: false,
  phase: '',
  orders: 0,
  items: 0,
  errors: 0,
}

export async function GET() {
  return NextResponse.json(syncStatus)
}

export async function POST(request: NextRequest) {
  if (syncStatus.running) {
    return NextResponse.json({ error: 'Already running' }, { status: 409 })
  }

  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '30')

  // Reset state
  syncStatus = { running: true, phase: 'Starting...', orders: 0, items: 0, errors: 0 }

  // Run in background
  runSimpleSync(days).catch(err => {
    console.error('Sync error:', err)
    syncStatus.phase = `Error: ${err.message}`
    syncStatus.running = false
  })

  return NextResponse.json({ 
    success: true, 
    message: `Started ${days}-day sync`,
    statusUrl: '/api/amazon/sync/simple-orders'
  })
}

async function runSimpleSync(days: number) {
  console.log(`\n🚀 Starting simple ${days}-day sync...\n`)

  try {
    // Setup
    syncStatus.phase = 'Getting credentials...'
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('No Amazon credentials')
    
    syncStatus.phase = 'Creating API client...'
    const client = await createSpApiClient()
    if (!client) throw new Error('Failed to create client')

    // Date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)

    // Step 1: Request report
    syncStatus.phase = 'Requesting report from Amazon...'
    console.log('📄 Requesting GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL...')

    const createResponse = await client.callAPI({
      operation: 'createReport',
      endpoint: 'reports',
      body: {
        reportType: 'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
        marketplaceIds: [credentials.marketplaceId],
        dataStartTime: startDate.toISOString(),
        dataEndTime: endDate.toISOString(),
      },
    })

    const reportId = createResponse?.reportId
    if (!reportId) {
      throw new Error('No report ID returned: ' + JSON.stringify(createResponse))
    }
    console.log(`✓ Report ID: ${reportId}`)

    // Step 2: Wait for report
    syncStatus.phase = 'Waiting for Amazon to generate report...'
    console.log('⏳ Waiting for report...')

    let documentId: string | null = null
    for (let i = 0; i < 60; i++) { // Max 10 minutes
      await new Promise(r => setTimeout(r, 10000)) // Wait 10 seconds

      try {
        const status = await client.callAPI({
          operation: 'getReport',
          endpoint: 'reports',
          path: { reportId },
        })

        const processingStatus = status?.processingStatus
        console.log(`   Status: ${processingStatus} (${i + 1}/60)`)
        syncStatus.phase = `Waiting for Amazon... ${processingStatus} (${i + 1}/60)`

        if (processingStatus === 'DONE') {
          documentId = status?.reportDocumentId
          break
        }
        if (processingStatus === 'CANCELLED' || processingStatus === 'FATAL') {
          throw new Error(`Report failed: ${processingStatus}`)
        }
      } catch (err: any) {
        console.log(`   Status check error: ${err.message}`)
      }
    }

    if (!documentId) {
      throw new Error('Report timed out after 10 minutes')
    }
    console.log(`✓ Report ready: ${documentId}`)

    // Step 3: Download report
    syncStatus.phase = 'Downloading report...'
    console.log('📥 Downloading...')

    const docResponse = await client.callAPI({
      operation: 'getReportDocument',
      endpoint: 'reports',
      path: { reportDocumentId: documentId },
    })

    const url = docResponse?.url
    if (!url) throw new Error('No download URL')

    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)

    let content: string
    if (docResponse?.compressionAlgorithm === 'GZIP') {
      const buffer = await response.arrayBuffer()
      const { gunzipSync } = await import('zlib')
      content = gunzipSync(Buffer.from(buffer)).toString('utf-8')
    } else {
      content = await response.text()
    }

    console.log(`✓ Downloaded ${(content.length / 1024).toFixed(0)} KB`)

    // Step 4: Parse TSV
    syncStatus.phase = 'Parsing data...'
    const lines = content.split('\n').filter(l => l.trim())
    if (lines.length < 2) {
      syncStatus.phase = 'No orders in this period'
      syncStatus.running = false
      return
    }

    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
    console.log(`✓ Headers: ${headers.slice(0, 5).join(', ')}...`)

    const rows: Record<string, string>[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t')
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = values[idx]?.trim() || '' })
      rows.push(row)
    }
    console.log(`✓ Parsed ${rows.length} rows`)

    // Step 5: Group by order
    syncStatus.phase = 'Processing orders...'
    const orderGroups = new Map<string, Record<string, string>[]>()
    for (const row of rows) {
      const orderId = row['amazonorderid'] || row['orderid'] || row['amazonorder_id']
      if (!orderId) continue
      if (!orderGroups.has(orderId)) orderGroups.set(orderId, [])
      orderGroups.get(orderId)!.push(row)
    }

    console.log(`✓ Found ${orderGroups.size} unique orders`)

    // Step 6: Save to database
    let created = 0, updated = 0, itemsSaved = 0

    for (const [orderId, orderRows] of orderGroups) {
      const first = orderRows[0]
      
      try {
        // Parse order data
        const purchaseDateStr = first['purchasedate'] || first['shipmentdate'] || first['orderdate']
        const purchaseDate = purchaseDateStr ? new Date(purchaseDateStr) : new Date()
        
        // Check if exists
        const existing = await prisma.order.findUnique({ where: { id: orderId } })
        
        // Upsert order
        await prisma.order.upsert({
          where: { id: orderId },
          create: {
            id: orderId,
            purchaseDate,
            status: 'Shipped',
            fulfillmentChannel: 'FBA',
            salesChannel: 'Amazon.com',
            currency: 'USD',
          },
          update: {},
        })

        if (existing) updated++
        else created++
        syncStatus.orders = created + updated

        // Save items
        for (const itemRow of orderRows) {
          const sku = itemRow['sku'] || itemRow['sellersku'] || itemRow['merchantsku']
          if (!sku) continue

          // Check product exists
          const product = await prisma.product.findUnique({ where: { sku } })
          if (!product) continue

          const quantity = parseInt(itemRow['quantityshipped'] || itemRow['quantity'] || '1') || 1
          const price = parseFloat(itemRow['itemprice'] || itemRow['price'] || '0') || 0

          try {
            await prisma.orderItem.upsert({
              where: { orderId_masterSku: { orderId, masterSku: sku } },
              create: {
                orderId,
                masterSku: sku,
                quantity,
                itemPrice: price,
                grossRevenue: price,
              },
              update: {
                quantity,
                itemPrice: price,
                grossRevenue: price,
              },
            })
            itemsSaved++
            syncStatus.items = itemsSaved
          } catch {
            syncStatus.errors++
          }
        }

        // Progress update every 100 orders
        if ((created + updated) % 100 === 0) {
          console.log(`   Processed ${created + updated} orders...`)
          syncStatus.phase = `Processing... ${created + updated} orders`
        }

      } catch (err: any) {
        syncStatus.errors++
      }
    }

    // Done!
    console.log(`\n✅ Complete!`)
    console.log(`   Created: ${created}`)
    console.log(`   Updated: ${updated}`)
    console.log(`   Items: ${itemsSaved}`)
    console.log(`   Errors: ${syncStatus.errors}`)

    syncStatus.phase = `✅ Done! ${created} created, ${updated} updated, ${itemsSaved} items`
    syncStatus.running = false

  } catch (error: any) {
    console.error('Sync failed:', error)
    syncStatus.phase = `❌ ${error.message}`
    syncStatus.running = false
  }
}



