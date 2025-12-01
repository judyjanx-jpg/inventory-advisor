import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials, marketplaceToChannel } from '@/lib/amazon-sp-api'

/**
 * Historical Order Sync
 * 
 * Uses Amazon's Reports API to bulk import order history.
 * Much faster than the Orders API for large volumes.
 * 
 * Report types used:
 * - GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE (primary - all order data)
 * - GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL (fallback - FBA shipments only)
 * 
 * This is designed for one-time backfill or periodic full sync.
 */

// Helper to parse tab-separated values
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

// Safe number parsing
function safeFloat(value: string | undefined | null): number {
  if (!value) return 0
  const cleaned = value.replace(/[,$"]/g, '').trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

function safeInt(value: string | undefined | null): number {
  if (!value) return 0
  const cleaned = value.replace(/[,$"]/g, '').trim()
  const parsed = parseInt(cleaned, 10)
  return isNaN(parsed) ? 0 : parsed
}

// Get field value with multiple possible column names
function getField(row: Record<string, string>, ...fieldNames: string[]): string {
  for (const name of fieldNames) {
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
    if (row[normalizedName] !== undefined && row[normalizedName] !== '') {
      return row[normalizedName]
    }
  }
  return ''
}

// Wait for report to complete
async function waitForReport(
  client: any,
  reportId: string,
  maxAttempts: number = 120,
  intervalMs: number = 30000
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.callAPI({
        operation: 'getReport',
        endpoint: 'reports',
        path: { reportId },
      })
      
      const status = response?.processingStatus || response?.reportProcessingStatus
      console.log(`  [Attempt ${attempt}/${maxAttempts}] Report status: ${status}`)
      
      if (status === 'DONE') {
        return response?.reportDocumentId || null
      }
      
      if (status === 'CANCELLED' || status === 'FATAL') {
        console.error(`  Report failed with status: ${status}`)
        return null
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    } catch (error: any) {
      console.error(`  Error checking report status: ${error.message}`)
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }
  
  console.error(`  Report did not complete within ${maxAttempts} attempts`)
  return null
}

// Download and decompress report
async function downloadReport(client: any, documentId: string): Promise<string> {
  const docResponse = await client.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId: documentId },
  })
  
  const url = docResponse?.url
  if (!url) {
    throw new Error('No download URL in report document')
  }
  
  console.log(`  Downloading report from: ${url.substring(0, 80)}...`)
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.status}`)
  }
  
  // Check if compressed
  const compressionAlgorithm = docResponse?.compressionAlgorithm
  
  if (compressionAlgorithm === 'GZIP') {
    const arrayBuffer = await response.arrayBuffer()
    const { gunzipSync } = await import('zlib')
    const decompressed = gunzipSync(Buffer.from(arrayBuffer))
    return decompressed.toString('utf-8')
  }
  
  return await response.text()
}

// Create a sync log entry
async function createSyncLog(syncType: string, status: string, metadata?: any) {
  return await prisma.syncLog.create({
    data: {
      syncType,
      status,
      startedAt: new Date(),
      metadata,
    },
  })
}

// Update sync log
async function updateSyncLog(
  logId: number,
  status: string,
  stats: {
    recordsProcessed?: number
    recordsCreated?: number
    recordsUpdated?: number
    recordsSkipped?: number
    errorMessage?: string
  }
) {
  await prisma.syncLog.update({
    where: { id: logId },
    data: {
      status,
      completedAt: new Date(),
      ...stats,
    },
  })
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let syncLog: any = null
  
  try {
    const { searchParams } = new URL(request.url)
    const daysBack = parseInt(searchParams.get('days') || '730') // Default 2 years
    const forceRefresh = searchParams.get('force') === 'true'
    
    // Validate days (max 2 years = 730 days)
    const actualDaysBack = Math.min(daysBack, 730)
    
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'Amazon credentials not configured' },
        { status: 400 }
      )
    }
    
    const client = await createSpApiClient()
    if (!client) {
      throw new Error('Failed to create SP-API client')
    }
    
    const channel = marketplaceToChannel(credentials.marketplaceId)
    
    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - actualDaysBack)
    
    console.log('\n' + '='.repeat(70))
    console.log('📦 HISTORICAL ORDER SYNC')
    console.log('='.repeat(70))
    console.log(`Marketplace: ${credentials.marketplaceId} (${channel})`)
    console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
    console.log(`Days: ${actualDaysBack}`)
    console.log(`Force refresh: ${forceRefresh}`)
    console.log('='.repeat(70))
    
    // Create sync log
    syncLog = await createSyncLog('historical-orders', 'running', {
      daysBack: actualDaysBack,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      forceRefresh,
    })
    
    // Try different report types in order of preference
    const reportTypes = [
      {
        type: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE',
        description: 'All Orders Report',
      },
      {
        type: 'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
        description: 'FBA Shipments Report',
      },
    ]
    
    let reportContent: string | null = null
    let usedReportType: string | null = null
    
    for (const reportConfig of reportTypes) {
      console.log(`\n📋 Requesting ${reportConfig.description}...`)
      console.log(`   Report type: ${reportConfig.type}`)
      
      try {
        // Step 1: Create the report request
        const createResponse = await client.callAPI({
          operation: 'createReport',
          endpoint: 'reports',
          body: {
            reportType: reportConfig.type,
            marketplaceIds: [credentials.marketplaceId],
            dataStartTime: startDate.toISOString(),
            dataEndTime: endDate.toISOString(),
          },
        })
        
        const reportId = createResponse?.reportId
        if (!reportId) {
          console.log(`   ⚠️ No report ID returned, trying next type...`)
          continue
        }
        
        console.log(`   Report ID: ${reportId}`)
        console.log(`   ⏳ Waiting for report to generate (this can take 5-60+ minutes for large date ranges)...`)
        
        // Step 2: Wait for report to complete
        // For 2 years of data, this can take 30-60+ minutes
        const documentId = await waitForReport(client, reportId, 120, 30000) // 120 attempts * 30 seconds = 1 hour max
        
        if (!documentId) {
          console.log(`   ⚠️ Report failed or timed out, trying next type...`)
          continue
        }
        
        console.log(`   ✓ Report ready! Document ID: ${documentId}`)
        
        // Step 3: Download the report
        reportContent = await downloadReport(client, documentId)
        usedReportType = reportConfig.type
        
        console.log(`   ✓ Downloaded ${(reportContent.length / 1024 / 1024).toFixed(2)} MB of data`)
        break
        
      } catch (error: any) {
        console.error(`   ❌ Error with ${reportConfig.type}: ${error.message}`)
        continue
      }
    }
    
    if (!reportContent) {
      throw new Error('Failed to generate any order report from Amazon')
    }
    
    // Step 4: Parse the report
    console.log('\n📊 Parsing report data...')
    const rows = parseTSV(reportContent)
    console.log(`   Found ${rows.length} rows in report`)
    
    if (rows.length === 0) {
      await updateSyncLog(syncLog.id, 'success', {
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsSkipped: 0,
      })
      
      return NextResponse.json({
        success: true,
        message: 'Report was empty - no orders in date range',
        stats: { orders: 0, items: 0, created: 0, updated: 0 },
        duration: `${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`,
      })
    }
    
    // Log sample row for debugging
    console.log('\n   Sample row columns:', Object.keys(rows[0]).slice(0, 15).join(', '))
    
    // Step 5: Process orders
    console.log('\n💾 Processing orders...')
    
    const stats = {
      ordersProcessed: 0,
      ordersCreated: 0,
      ordersUpdated: 0,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      skipped: 0,
      errors: 0,
    }
    
    // Group rows by order ID for efficient processing
    const orderGroups = new Map<string, Record<string, string>[]>()
    
    for (const row of rows) {
      const orderId = getField(row, 'amazon-order-id', 'order-id', 'amazonorderid')
      if (!orderId) {
        stats.skipped++
        continue
      }
      
      if (!orderGroups.has(orderId)) {
        orderGroups.set(orderId, [])
      }
      orderGroups.get(orderId)!.push(row)
    }
    
    console.log(`   Found ${orderGroups.size} unique orders`)
    
    // Process in batches
    const BATCH_SIZE = 100
    const orderIds = Array.from(orderGroups.keys())
    
    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      const batchIds = orderIds.slice(i, i + BATCH_SIZE)
      
      // Check which orders already exist
      const existingOrders = await prisma.order.findMany({
        where: { id: { in: batchIds } },
        select: { id: true },
      })
      const existingOrderIds = new Set(existingOrders.map(o => o.id))
      
      // Process each order in the batch
      for (const orderId of batchIds) {
        const orderRows = orderGroups.get(orderId)!
        const firstRow = orderRows[0]
        
        try {
          // Parse order data from first row
          const purchaseDateStr = getField(firstRow, 'purchase-date', 'purchasedate', 'order-date')
          const purchaseDate = purchaseDateStr ? new Date(purchaseDateStr) : new Date()
          
          const shipDateStr = getField(firstRow, 'ship-date', 'shipdate', 'last-updated-date')
          const shipDate = shipDateStr ? new Date(shipDateStr) : null
          
          const orderTotal = safeFloat(getField(firstRow, 'item-price', 'price', 'order-total'))
          const currency = getField(firstRow, 'currency', 'currency-code') || 'USD'
          const status = getField(firstRow, 'order-status', 'orderstatus', 'status') || 'Shipped'
          const fulfillmentChannel = getField(firstRow, 'fulfillment-channel', 'fulfillment', 'ship-service-level')
          const salesChannel = getField(firstRow, 'sales-channel', 'saleschannel') || 'Amazon.com'
          
          // Shipping address
          const shipCity = getField(firstRow, 'ship-city', 'shipcity', 'city')
          const shipState = getField(firstRow, 'ship-state', 'shipstate', 'state')
          const shipPostalCode = getField(firstRow, 'ship-postal-code', 'shippostalcode', 'postal-code', 'zip')
          const shipCountry = getField(firstRow, 'ship-country', 'shipcountry', 'country')
          
          // Upsert order
          const isNewOrder = !existingOrderIds.has(orderId)
          
          await prisma.order.upsert({
            where: { id: orderId },
            create: {
              id: orderId,
              purchaseDate,
              shipDate,
              orderTotal,
              currency,
              status: normalizeStatus(status),
              fulfillmentChannel: fulfillmentChannel?.includes('FBA') || fulfillmentChannel?.includes('AFN') ? 'FBA' : 'MFN',
              salesChannel,
              shipCity,
              shipState,
              shipPostalCode,
              shipCountry,
            },
            update: {
              shipDate,
              status: normalizeStatus(status),
              // Don't update other fields on existing orders to preserve data
            },
          })
          
          if (isNewOrder) {
            stats.ordersCreated++
          } else {
            stats.ordersUpdated++
          }
          stats.ordersProcessed++
          
          // Process order items
          for (const itemRow of orderRows) {
            const sku = getField(itemRow, 'sku', 'seller-sku', 'sellersku', 'merchant-sku')
            if (!sku) {
              stats.skipped++
              continue
            }
            
            // Check if product exists
            const product = await prisma.product.findUnique({
              where: { sku },
              select: { sku: true },
            })
            
            if (!product) {
              // Skip items for products not in our catalog
              stats.skipped++
              continue
            }
            
            const asin = getField(itemRow, 'asin', 'asin1')
            const quantity = safeInt(getField(itemRow, 'quantity', 'qty', 'quantity-shipped'))
            const itemPrice = safeFloat(getField(itemRow, 'item-price', 'price'))
            const itemTax = safeFloat(getField(itemRow, 'item-tax', 'tax'))
            const shippingPrice = safeFloat(getField(itemRow, 'shipping-price', 'ship-price'))
            const shippingTax = safeFloat(getField(itemRow, 'shipping-tax', 'ship-tax'))
            const giftWrapPrice = safeFloat(getField(itemRow, 'gift-wrap-price', 'giftwrap-price'))
            const giftWrapTax = safeFloat(getField(itemRow, 'gift-wrap-tax', 'giftwrap-tax'))
            const promoDiscount = Math.abs(safeFloat(getField(itemRow, 'item-promotion-discount', 'promo-discount', 'promotion-discount')))
            const shipPromoDiscount = Math.abs(safeFloat(getField(itemRow, 'ship-promotion-discount', 'ship-promo-discount')))
            
            // Calculate gross revenue
            const grossRevenue = itemPrice + shippingPrice + giftWrapPrice - promoDiscount - shipPromoDiscount
            
            // Upsert order item
            const existingItem = await prisma.orderItem.findUnique({
              where: { orderId_masterSku: { orderId, masterSku: sku } },
            })
            
            if (existingItem) {
              await prisma.orderItem.update({
                where: { id: existingItem.id },
                data: {
                  asin,
                  quantity,
                  itemPrice,
                  itemTax,
                  shippingPrice,
                  shippingTax,
                  giftWrapPrice,
                  giftWrapTax,
                  promoDiscount,
                  shipPromoDiscount,
                  grossRevenue,
                },
              })
              stats.itemsUpdated++
            } else {
              await prisma.orderItem.create({
                data: {
                  orderId,
                  masterSku: sku,
                  asin,
                  quantity,
                  itemPrice,
                  itemTax,
                  shippingPrice,
                  shippingTax,
                  giftWrapPrice,
                  giftWrapTax,
                  promoDiscount,
                  shipPromoDiscount,
                  grossRevenue,
                },
              })
              stats.itemsCreated++
            }
            stats.itemsProcessed++
          }
          
        } catch (error: any) {
          console.error(`   Error processing order ${orderId}: ${error.message}`)
          stats.errors++
        }
      }
      
      // Log progress
      const progress = Math.round(((i + batchIds.length) / orderIds.length) * 100)
      console.log(`   Progress: ${progress}% (${i + batchIds.length}/${orderIds.length} orders)`)
    }
    
    // Update sync log
    await updateSyncLog(syncLog.id, 'success', {
      recordsProcessed: stats.ordersProcessed + stats.itemsProcessed,
      recordsCreated: stats.ordersCreated + stats.itemsCreated,
      recordsUpdated: stats.ordersUpdated + stats.itemsUpdated,
      recordsSkipped: stats.skipped,
    })
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
    
    console.log('\n' + '='.repeat(70))
    console.log('✅ HISTORICAL SYNC COMPLETE')
    console.log('='.repeat(70))
    console.log(`Duration: ${duration} minutes`)
    console.log(`Orders: ${stats.ordersCreated} created, ${stats.ordersUpdated} updated`)
    console.log(`Items: ${stats.itemsCreated} created, ${stats.itemsUpdated} updated`)
    console.log(`Skipped: ${stats.skipped}`)
    console.log(`Errors: ${stats.errors}`)
    console.log('='.repeat(70))
    
    return NextResponse.json({
      success: true,
      reportType: usedReportType,
      dateRange: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        days: actualDaysBack,
      },
      stats,
      duration: `${duration} minutes`,
    })
    
  } catch (error: any) {
    console.error('\n❌ Historical sync failed:', error)
    
    if (syncLog) {
      await updateSyncLog(syncLog.id, 'failed', {
        errorMessage: error.message,
      })
    }
    
    return NextResponse.json(
      {
        error: error.message,
        duration: `${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`,
      },
      { status: 500 }
    )
  }
}

// GET endpoint to check sync status
export async function GET() {
  try {
    // Get latest historical sync logs
    const recentSyncs = await prisma.syncLog.findMany({
      where: { syncType: 'historical-orders' },
      orderBy: { startedAt: 'desc' },
      take: 10,
    })
    
    // Get order count by date range
    const orderStats = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('month', purchase_date) as month,
        COUNT(*) as count
      FROM orders
      WHERE purchase_date >= NOW() - INTERVAL '2 years'
      GROUP BY DATE_TRUNC('month', purchase_date)
      ORDER BY month DESC
    `
    
    // Get date range of existing orders
    const dateRange = await prisma.order.aggregate({
      _min: { purchaseDate: true },
      _max: { purchaseDate: true },
      _count: true,
    })
    
    return NextResponse.json({
      recentSyncs: recentSyncs.map(s => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        recordsProcessed: s.recordsProcessed,
        recordsCreated: s.recordsCreated,
        recordsUpdated: s.recordsUpdated,
        errorMessage: s.errorMessage,
      })),
      orderStats,
      dateRange: {
        earliest: dateRange._min.purchaseDate,
        latest: dateRange._max.purchaseDate,
        totalOrders: dateRange._count,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper to normalize order status
function normalizeStatus(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized.includes('ship')) return 'Shipped'
  if (normalized.includes('cancel')) return 'Cancelled'
  if (normalized.includes('pend')) return 'Pending'
  if (normalized.includes('deliver')) return 'Delivered'
  if (normalized.includes('return')) return 'Returned'
  return 'Shipped'
}
