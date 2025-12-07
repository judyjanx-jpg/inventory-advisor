// app/api/amazon/sync/historical-batched/route.ts
// Batched Historical Order Sync with proper rate limit handling

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAmazonCredentials } from '@/lib/amazon-sp-api'

const syncState = {
  isRunning: false,
  currentBatch: 0,
  totalBatches: 0,
  currentPhase: '',
  ordersProcessed: 0,
  ordersCreated: 0,
  ordersUpdated: 0,
  itemsProcessed: 0,
  skipped: 0,
  errors: 0,
  startTime: 0,
  batchResults: [] as any[],
  rateLimitResets: 0,
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function resetSyncState() {
  syncState.isRunning = false
  syncState.currentBatch = 0
  syncState.totalBatches = 0
  syncState.currentPhase = ''
  syncState.ordersProcessed = 0
  syncState.ordersCreated = 0
  syncState.ordersUpdated = 0
  syncState.itemsProcessed = 0
  syncState.skipped = 0
  syncState.errors = 0
  syncState.startTime = 0
  syncState.batchResults = []
  syncState.rateLimitResets = 0
}

// Direct API call with proper error handling
async function callAmazonApi(
  accessToken: string,
  method: string,
  path: string,
  body?: any
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `https://sellingpartnerapi-na.amazon.com${path}`
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': accessToken,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  })

  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }

  return { ok: response.ok, status: response.status, data }
}

// Get fresh access token
async function getAccessToken(credentials: any): Promise<string> {
  const response = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status}`)
  }

  const data = await response.json()
  return data.access_token
}

// Helper functions
function parseTSV(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []
  
  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-'))
  const rows: Record<string, string>[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t')
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || ''
    })
    rows.push(row)
  }
  return rows
}

function safeFloat(value: string | undefined | null): number {
  if (!value) return 0
  const parsed = parseFloat(value.replace(/[,$"]/g, '').trim())
  return isNaN(parsed) ? 0 : parsed
}

function safeInt(value: string | undefined | null): number {
  if (!value) return 0
  const parsed = parseInt(value.replace(/[,$"]/g, '').trim(), 10)
  return isNaN(parsed) ? 0 : parsed
}

function getField(row: Record<string, string>, ...fieldNames: string[]): string {
  for (const name of fieldNames) {
    const key = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
    if (row[key] !== undefined && row[key] !== '') return row[key]
  }
  return ''
}

function normalizeStatus(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('ship')) return 'Shipped'
  if (s.includes('cancel')) return 'Cancelled'
  if (s.includes('pend')) return 'Pending'
  if (s.includes('deliver')) return 'Delivered'
  return 'Shipped'
}

// GET - SSE stream or JSON state
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  if (searchParams.get('stream') === 'true') {
    const encoder = new TextEncoder()
    let isClosed = false
    
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          if (isClosed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch (e) {
            // Controller already closed, ignore
            isClosed = true
          }
        }
        
        const cleanup = () => {
          isClosed = true
          clearInterval(interval)
          try {
            controller.close()
          } catch (e) {
            // Already closed, ignore
          }
        }
        
        send(syncState)
        
        const interval = setInterval(() => {
          if (isClosed) {
            clearInterval(interval)
            return
          }
          send(syncState)
          if (!syncState.isRunning && syncState.currentBatch > 0) {
            cleanup()
          }
        }, 500)
        
        // Max 3 hour timeout
        setTimeout(cleanup, 3 * 60 * 60 * 1000)
      },
      cancel() {
        isClosed = true
      },
    })
    
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  }
  
  return NextResponse.json(syncState)
}

// POST - Start sync
export async function POST(request: NextRequest) {
  if (syncState.isRunning) {
    return NextResponse.json({ error: 'Sync already running', state: syncState }, { status: 409 })
  }
  
  const { searchParams } = new URL(request.url)
  const batchSize = parseInt(searchParams.get('size') || '90')
  const totalDays = parseInt(searchParams.get('total') || '720')
  const totalBatches = Math.ceil(totalDays / batchSize)
  
  resetSyncState()
  syncState.isRunning = true
  syncState.totalBatches = totalBatches
  syncState.startTime = Date.now()
  syncState.currentPhase = 'Starting...'
  
  runBatchedSync(batchSize, totalDays, totalBatches).catch(err => {
    console.error('Sync error:', err)
    syncState.currentPhase = `Error: ${err.message}`
    syncState.isRunning = false
  })
  
  return NextResponse.json({ success: true, totalBatches, batchSize, totalDays })
}

// DELETE - Stop sync
export async function DELETE() {
  syncState.isRunning = false
  syncState.currentPhase = 'Stopped by user'
  resetSyncState()
  return NextResponse.json({ success: true })
}

// Main sync function
async function runBatchedSync(batchSize: number, totalDays: number, totalBatches: number) {
  console.log(`\n🚀 Starting batched sync: ${totalBatches} batches of ${batchSize} days`)
  
  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('No Amazon credentials')
    
    let accessToken = await getAccessToken(credentials)
    let tokenRefreshedAt = Date.now()
    console.log('✓ Got access token')
    
    for (let batch = 1; batch <= totalBatches; batch++) {
      if (!syncState.isRunning) break
      
      syncState.currentBatch = batch
      
      // Refresh token every 30 minutes
      if (Date.now() - tokenRefreshedAt > 30 * 60 * 1000) {
        console.log('   Refreshing access token...')
        accessToken = await getAccessToken(credentials)
        tokenRefreshedAt = Date.now()
      }
      
      // Calculate date range
      const endDaysAgo = (batch - 1) * batchSize
      const startDaysAgo = Math.min(batch * batchSize, totalDays)
      
      const endDate = new Date()
      endDate.setDate(endDate.getDate() - endDaysAgo)
      
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - startDaysAgo)
      
      const dateRange = `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`
      console.log(`\n📦 Batch ${batch}/${totalBatches}: ${dateRange}`)
      
      try {
        // === CREATE REPORT ===
        syncState.currentPhase = `Batch ${batch}/${totalBatches}: Creating report...`
        
        let reportId: string | null = null
        let createAttempts = 0
        const maxCreateAttempts = 5
        
        while (!reportId && createAttempts < maxCreateAttempts && syncState.isRunning) {
          createAttempts++
          
          const createResult = await callAmazonApi(accessToken, 'POST', '/reports/2021-06-30/reports', {
            reportType: 'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
            marketplaceIds: [credentials.marketplaceId],
            dataStartTime: startDate.toISOString(),
            dataEndTime: endDate.toISOString(),
          })
          
          if (createResult.ok && createResult.data?.reportId) {
            reportId = createResult.data.reportId
            console.log(`   ✓ Report ID: ${reportId}`)
          } else if (createResult.status === 429) {
            // Rate limited - wait and retry
            syncState.rateLimitResets++
            const waitMinutes = Math.min(2 * createAttempts, 10) // 2, 4, 6, 8, 10 minutes
            console.log(`   ⚠️ Rate limited (429). Waiting ${waitMinutes} minutes...`)
            syncState.currentPhase = `Batch ${batch}/${totalBatches}: Rate limited, waiting ${waitMinutes} min...`
            
            for (let i = waitMinutes * 60; i > 0 && syncState.isRunning; i--) {
              syncState.currentPhase = `Batch ${batch}/${totalBatches}: Rate limited, resuming in ${Math.ceil(i / 60)} min...`
              await delay(1000)
            }
          } else {
            console.log(`   ❌ Create failed: ${createResult.status}`, createResult.data)
            throw new Error(`Create report failed: ${createResult.status}`)
          }
        }
        
        if (!reportId) {
          throw new Error('Failed to create report after retries')
        }
        
        // === WAIT FOR REPORT ===
        syncState.currentPhase = `Batch ${batch}/${totalBatches}: Waiting for Amazon...`
        
        let documentId: string | null = null
        const maxWaitMinutes = 15
        const checkIntervalMs = 15000 // Check every 15 seconds
        const maxChecks = (maxWaitMinutes * 60 * 1000) / checkIntervalMs
        
        for (let check = 1; check <= maxChecks && syncState.isRunning; check++) {
          const statusResult = await callAmazonApi(accessToken, 'GET', `/reports/2021-06-30/reports/${reportId}`)
          
          if (statusResult.status === 429) {
            console.log(`   ⚠️ Rate limited on status check, waiting 60s...`)
            await delay(60000)
            continue
          }
          
          const status = statusResult.data?.processingStatus
          
          if (check === 1 || check % 4 === 0) {
            console.log(`   Status: ${status} (check ${check})`)
          }
          
          syncState.currentPhase = `Batch ${batch}/${totalBatches}: ${status || 'Checking'}... (${Math.ceil(check * checkIntervalMs / 60000)} min)`
          
          if (status === 'DONE') {
            documentId = statusResult.data?.reportDocumentId
            console.log(`   ✓ Report ready!`)
            break
          }
          
          if (status === 'CANCELLED' || status === 'FATAL') {
            throw new Error(`Report ${status}`)
          }
          
          await delay(checkIntervalMs)
        }
        
        if (!documentId) {
          throw new Error('Report timed out')
        }
        
        // === DOWNLOAD REPORT ===
        syncState.currentPhase = `Batch ${batch}/${totalBatches}: Downloading...`
        
        const docResult = await callAmazonApi(accessToken, 'GET', `/reports/2021-06-30/documents/${documentId}`)
        
        if (!docResult.ok || !docResult.data?.url) {
          throw new Error('Failed to get document URL')
        }
        
        const downloadResponse = await fetch(docResult.data.url, { signal: AbortSignal.timeout(120000) })
        if (!downloadResponse.ok) {
          throw new Error(`Download failed: ${downloadResponse.status}`)
        }
        
        let reportContent: string
        if (docResult.data.compressionAlgorithm === 'GZIP') {
          const buffer = await downloadResponse.arrayBuffer()
          const { gunzipSync } = await import('zlib')
          reportContent = gunzipSync(Buffer.from(buffer)).toString('utf-8')
        } else {
          reportContent = await downloadResponse.text()
        }
        
        console.log(`   ✓ Downloaded ${(reportContent.length / 1024).toFixed(0)} KB`)
        
        // === PARSE & PROCESS ===
        syncState.currentPhase = `Batch ${batch}/${totalBatches}: Processing...`
        
        const rows = parseTSV(reportContent)
        console.log(`   ✓ Parsed ${rows.length} rows`)
        
        if (rows.length === 0) {
          syncState.batchResults.push({ batch, dateRange, orders: 0, ordersCreated: 0, ordersUpdated: 0, items: 0 })
          console.log(`   No orders in this period`)
          await delay(5000)
          continue
        }
        
        // Group by order
        const orderGroups = new Map<string, Record<string, string>[]>()
        for (const row of rows) {
          const orderId = getField(row, 'amazon-order-id', 'order-id')
          if (orderId) {
            if (!orderGroups.has(orderId)) orderGroups.set(orderId, [])
            orderGroups.get(orderId)!.push(row)
          }
        }
        
        const orderIds = Array.from(orderGroups.keys())
        let batchCreated = 0, batchUpdated = 0, batchItems = 0
        
        console.log(`   Processing ${orderIds.length} orders...`)
        
        // Process in chunks of 50
        for (let i = 0; i < orderIds.length && syncState.isRunning; i += 50) {
          const chunk = orderIds.slice(i, i + 50)
          syncState.currentPhase = `Batch ${batch}/${totalBatches}: Orders ${i + 1}-${Math.min(i + 50, orderIds.length)} of ${orderIds.length}`
          
          const existing = await prisma.order.findMany({
            where: { id: { in: chunk } },
            select: { id: true },
          })
          const existingIds = new Set(existing.map((o: any) => o.id))
          
          for (const orderId of chunk) {
            const orderRows = orderGroups.get(orderId)!
            const first = orderRows[0]
            
            try {
              const purchaseDate = new Date(getField(first, 'purchase-date', 'shipment-date') || Date.now())
              const shipDate = getField(first, 'ship-date', 'shipment-date')
              
              await prisma.order.upsert({
                where: { id: orderId },
                create: {
                  id: orderId,
                  purchaseDate,
                  shipDate: shipDate ? new Date(shipDate) : null,
                  orderTotal: safeFloat(getField(first, 'item-price')),
                  currency: getField(first, 'currency') || 'USD',
                  status: normalizeStatus(getField(first, 'order-status') || 'Shipped'),
                  fulfillmentChannel: 'FBA',
                  salesChannel: getField(first, 'sales-channel') || 'Amazon.com',
                  shipCity: getField(first, 'ship-city'),
                  shipState: getField(first, 'ship-state'),
                  shipPostalCode: getField(first, 'ship-postal-code'),
                  shipCountry: getField(first, 'ship-country'),
                },
                update: {
                  shipDate: shipDate ? new Date(shipDate) : undefined,
                  status: normalizeStatus(getField(first, 'order-status') || 'Shipped'),
                },
              })
              
              if (existingIds.has(orderId)) {
                batchUpdated++
                syncState.ordersUpdated++
              } else {
                batchCreated++
                syncState.ordersCreated++
              }
              syncState.ordersProcessed++
              
              // Process items
              for (const itemRow of orderRows) {
                const sku = getField(itemRow, 'sku', 'seller-sku')
                if (!sku) { syncState.skipped++; continue }
                
                const product = await prisma.product.findUnique({ where: { sku }, select: { sku: true } })
                if (!product) { syncState.skipped++; continue }
                
                const itemPrice = safeFloat(getField(itemRow, 'item-price'))
                const shippingPrice = safeFloat(getField(itemRow, 'shipping-price'))
                const giftWrapPrice = safeFloat(getField(itemRow, 'gift-wrap-price'))
                const promoDiscount = Math.abs(safeFloat(getField(itemRow, 'item-promotion-discount')))

                await prisma.orderItem.upsert({
                  where: { orderId_masterSku: { orderId, masterSku: sku } },
                  create: {
                    orderId,
                    masterSku: sku,
                    asin: getField(itemRow, 'asin'),
                    quantity: safeInt(getField(itemRow, 'quantity', 'quantity-shipped')) || 1,
                    itemPrice,
                    itemTax: safeFloat(getField(itemRow, 'item-tax')),
                    shippingPrice,
                    shippingTax: safeFloat(getField(itemRow, 'shipping-tax')),
                    giftWrapPrice,
                    giftWrapTax: safeFloat(getField(itemRow, 'gift-wrap-tax')),
                    promoDiscount,
                    shipPromoDiscount: Math.abs(safeFloat(getField(itemRow, 'ship-promotion-discount'))),
                    // grossRevenue should be GROSS (before promos) to match Amazon Seller Central's "Sales" number
                    grossRevenue: itemPrice + shippingPrice + giftWrapPrice,
                  },
                  update: {
                    quantity: safeInt(getField(itemRow, 'quantity', 'quantity-shipped')) || 1,
                    itemPrice,
                    // grossRevenue should be GROSS (before promos) to match Amazon Seller Central
                    grossRevenue: itemPrice + shippingPrice + giftWrapPrice,
                  },
                })
                
                syncState.itemsProcessed++
                batchItems++
              }
            } catch (err: any) {
              syncState.errors++
            }
          }
        }
        
        // Save batch result
        syncState.batchResults.push({
          batch,
          dateRange,
          orders: batchCreated + batchUpdated,
          ordersCreated: batchCreated,
          ordersUpdated: batchUpdated,
          items: batchItems,
        })
        
        console.log(`   ✅ Batch ${batch}: ${batchCreated} created, ${batchUpdated} updated, ${batchItems} items`)
        
        await prisma.syncLog.create({
          data: {
            syncType: `historical-batch-${batch}`,
            status: 'success',
            startedAt: new Date(),
            completedAt: new Date(),
            recordsProcessed: batchCreated + batchUpdated,
            recordsCreated: batchCreated,
            recordsUpdated: batchUpdated,
          },
        })
        
        // IMPORTANT: Wait between batches to avoid rate limits
        // Reports API allows ~15 requests per hour, so wait 4+ minutes between batches
        if (batch < totalBatches && syncState.isRunning) {
          const waitMinutes = 4
          console.log(`   Waiting ${waitMinutes} minutes before next batch...`)
          for (let i = waitMinutes * 60; i > 0 && syncState.isRunning; i--) {
            syncState.currentPhase = `Batch ${batch}/${totalBatches}: ✓ Done. Next batch in ${Math.ceil(i / 60)} min...`
            await delay(1000)
          }
        }
        
      } catch (err: any) {
        console.error(`   ❌ Batch ${batch} error:`, err.message)
        syncState.errors++
        syncState.batchResults.push({ batch, dateRange, error: err.message })
        
        // Wait longer after errors
        if (syncState.isRunning) {
          const waitMinutes = 5
          for (let i = waitMinutes * 60; i > 0 && syncState.isRunning; i--) {
            syncState.currentPhase = `Batch ${batch}/${totalBatches}: Error. Retry in ${Math.ceil(i / 60)} min...`
            await delay(1000)
          }
        }
      }
    }
    
    const duration = ((Date.now() - syncState.startTime) / 1000 / 60).toFixed(1)
    syncState.currentPhase = `✅ Done! ${syncState.ordersCreated} created, ${syncState.ordersUpdated} updated (${duration} min)`
    syncState.isRunning = false
    
    console.log(`\n✅ Sync complete in ${duration} minutes`)
    console.log(`   Orders: ${syncState.ordersCreated} created, ${syncState.ordersUpdated} updated`)
    console.log(`   Items: ${syncState.itemsProcessed}`)
    console.log(`   Rate limit waits: ${syncState.rateLimitResets}`)
    
  } catch (error: any) {
    console.error('Sync failed:', error)
    syncState.currentPhase = `❌ ${error.message}`
    syncState.isRunning = false
  }
}
