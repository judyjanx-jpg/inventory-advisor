/**
 * Historical Sync Queue
 * 
 * Handles long-running historical order imports via Bull queue.
 * This allows the sync to run in the background without blocking the API.
 */

import Bull from 'bull'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials, marketplaceToChannel } from '@/lib/amazon-sp-api'

// Queue configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export const historicalSyncQueue = new Bull('historical-sync', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000, // Start with 1 minute backoff
    },
    removeOnComplete: 50, // Keep last 50 completed jobs
    removeOnFail: 100, // Keep last 100 failed jobs
    timeout: 4 * 60 * 60 * 1000, // 4 hour timeout for large syncs
  },
})

// Job data interface
interface HistoricalSyncJobData {
  daysBack: number
  forceRefresh?: boolean
  syncLogId?: number
}

// Helper functions (same as route.ts)
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

function getField(row: Record<string, string>, ...fieldNames: string[]): string {
  for (const name of fieldNames) {
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
    if (row[normalizedName] !== undefined && row[normalizedName] !== '') {
      return row[normalizedName]
    }
  }
  return ''
}

function normalizeStatus(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized.includes('ship')) return 'Shipped'
  if (normalized.includes('cancel')) return 'Cancelled'
  if (normalized.includes('pend')) return 'Pending'
  if (normalized.includes('deliver')) return 'Delivered'
  if (normalized.includes('return')) return 'Returned'
  return 'Shipped'
}

async function waitForReport(
  client: any,
  reportId: string,
  maxAttempts: number = 120,
  intervalMs: number = 30000,
  job?: Bull.Job
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.callAPI({
        operation: 'getReport',
        endpoint: 'reports',
        path: { reportId },
      })
      
      const status = response?.processingStatus || response?.reportProcessingStatus
      
      // Update job progress
      if (job) {
        const progress = Math.min(20 + (attempt / maxAttempts) * 30, 50) // 20-50% during wait
        await job.progress(progress)
        await job.log(`Report status: ${status} (attempt ${attempt}/${maxAttempts})`)
      }
      
      if (status === 'DONE') {
        return response?.reportDocumentId || null
      }
      
      if (status === 'CANCELLED' || status === 'FATAL') {
        throw new Error(`Report failed with status: ${status}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    } catch (error: any) {
      if (job) {
        await job.log(`Error checking report status: ${error.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }
  
  throw new Error(`Report did not complete within ${maxAttempts} attempts`)
}

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
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.status}`)
  }
  
  const compressionAlgorithm = docResponse?.compressionAlgorithm
  
  if (compressionAlgorithm === 'GZIP') {
    const arrayBuffer = await response.arrayBuffer()
    const { gunzipSync } = await import('zlib')
    const decompressed = gunzipSync(Buffer.from(arrayBuffer))
    return decompressed.toString('utf-8')
  }
  
  return await response.text()
}

// Process historical sync job
historicalSyncQueue.process(async (job: Bull.Job<HistoricalSyncJobData>) => {
  const { daysBack, forceRefresh, syncLogId } = job.data
  const startTime = Date.now()
  
  await job.log(`Starting historical sync for ${daysBack} days`)
  await job.progress(5)
  
  // Create or update sync log
  let logId = syncLogId
  if (!logId) {
    const log = await prisma.syncLog.create({
      data: {
        syncType: 'historical-orders-queue',
        status: 'running',
        startedAt: new Date(),
        metadata: { daysBack, forceRefresh, jobId: job.id },
      },
    })
    logId = log.id
  }
  
  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      throw new Error('Amazon credentials not configured')
    }
    
    const client = await createSpApiClient()
    if (!client) {
      throw new Error('Failed to create SP-API client')
    }
    
    const channel = marketplaceToChannel(credentials.marketplaceId)
    
    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Math.min(daysBack, 730))
    
    await job.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
    await job.progress(10)
    
    // Request report
    const reportTypes = [
      'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE',
      'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
    ]
    
    let reportContent: string | null = null
    let usedReportType: string | null = null
    
    for (const reportType of reportTypes) {
      await job.log(`Trying report type: ${reportType}`)
      
      try {
        const createResponse = await client.callAPI({
          operation: 'createReport',
          endpoint: 'reports',
          body: {
            reportType,
            marketplaceIds: [credentials.marketplaceId],
            dataStartTime: startDate.toISOString(),
            dataEndTime: endDate.toISOString(),
          },
        })
        
        const reportId = createResponse?.reportId
        if (!reportId) continue
        
        await job.log(`Report ID: ${reportId}`)
        await job.progress(15)
        
        const documentId = await waitForReport(client, reportId, 120, 30000, job)
        if (!documentId) continue
        
        await job.log(`Downloading report...`)
        await job.progress(55)
        
        reportContent = await downloadReport(client, documentId)
        usedReportType = reportType
        
        await job.log(`Downloaded ${(reportContent.length / 1024 / 1024).toFixed(2)} MB`)
        break
        
      } catch (error: any) {
        await job.log(`Error with ${reportType}: ${error.message}`)
        continue
      }
    }
    
    if (!reportContent) {
      throw new Error('Failed to generate any order report from Amazon')
    }
    
    // Parse report
    await job.progress(60)
    const rows = parseTSV(reportContent)
    await job.log(`Found ${rows.length} rows in report`)
    
    if (rows.length === 0) {
      await prisma.syncLog.update({
        where: { id: logId },
        data: {
          status: 'success',
          completedAt: new Date(),
          recordsProcessed: 0,
        },
      })
      return { success: true, orders: 0, items: 0 }
    }
    
    // Group by order
    const orderGroups = new Map<string, Record<string, string>[]>()
    for (const row of rows) {
      const orderId = getField(row, 'amazon-order-id', 'order-id', 'amazonorderid')
      if (!orderId) continue
      if (!orderGroups.has(orderId)) orderGroups.set(orderId, [])
      orderGroups.get(orderId)!.push(row)
    }
    
    await job.log(`Processing ${orderGroups.size} unique orders`)
    await job.progress(65)
    
    // Process orders
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
    
    const BATCH_SIZE = 100
    const orderIds = Array.from(orderGroups.keys())
    
    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      const batchIds = orderIds.slice(i, i + BATCH_SIZE)
      
      // Update progress
      const progress = 65 + ((i / orderIds.length) * 30)
      await job.progress(progress)
      
      const existingOrders = await prisma.order.findMany({
        where: { id: { in: batchIds } },
        select: { id: true },
      })
      const existingOrderIds = new Set(existingOrders.map(o => o.id))
      
      for (const orderId of batchIds) {
        const orderRows = orderGroups.get(orderId)!
        const firstRow = orderRows[0]
        
        try {
          const purchaseDateStr = getField(firstRow, 'purchase-date', 'purchasedate', 'order-date')
          const purchaseDate = purchaseDateStr ? new Date(purchaseDateStr) : new Date()
          
          const shipDateStr = getField(firstRow, 'ship-date', 'shipdate', 'last-updated-date')
          const shipDate = shipDateStr ? new Date(shipDateStr) : null
          
          const orderTotal = safeFloat(getField(firstRow, 'item-price', 'price', 'order-total'))
          const currency = getField(firstRow, 'currency', 'currency-code') || 'USD'
          const status = getField(firstRow, 'order-status', 'orderstatus', 'status') || 'Shipped'
          const fulfillmentChannel = getField(firstRow, 'fulfillment-channel', 'fulfillment', 'ship-service-level')
          const salesChannel = getField(firstRow, 'sales-channel', 'saleschannel') || 'Amazon.com'
          
          const shipCity = getField(firstRow, 'ship-city', 'shipcity', 'city')
          const shipState = getField(firstRow, 'ship-state', 'shipstate', 'state')
          const shipPostalCode = getField(firstRow, 'ship-postal-code', 'shippostalcode', 'postal-code', 'zip')
          const shipCountry = getField(firstRow, 'ship-country', 'shipcountry', 'country')
          
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
            },
          })
          
          if (isNewOrder) stats.ordersCreated++
          else stats.ordersUpdated++
          stats.ordersProcessed++
          
          // Process items
          for (const itemRow of orderRows) {
            const sku = getField(itemRow, 'sku', 'seller-sku', 'sellersku', 'merchant-sku')
            if (!sku) {
              stats.skipped++
              continue
            }
            
            const product = await prisma.product.findUnique({
              where: { sku },
              select: { sku: true },
            })
            
            if (!product) {
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
            
            const grossRevenue = itemPrice + shippingPrice + giftWrapPrice - promoDiscount - shipPromoDiscount
            
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
          stats.errors++
        }
      }
      
      // Log progress periodically
      if (i % 500 === 0) {
        await job.log(`Processed ${i + batchIds.length}/${orderIds.length} orders`)
      }
    }
    
    // Update sync log
    await prisma.syncLog.update({
      where: { id: logId },
      data: {
        status: 'success',
        completedAt: new Date(),
        recordsProcessed: stats.ordersProcessed + stats.itemsProcessed,
        recordsCreated: stats.ordersCreated + stats.itemsCreated,
        recordsUpdated: stats.ordersUpdated + stats.itemsUpdated,
        recordsSkipped: stats.skipped,
      },
    })
    
    await job.progress(100)
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
    await job.log(`Completed in ${duration} minutes`)
    
    return {
      success: true,
      reportType: usedReportType,
      stats,
      duration: `${duration} minutes`,
    }
    
  } catch (error: any) {
    await job.log(`Error: ${error.message}`)
    
    await prisma.syncLog.update({
      where: { id: logId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error.message,
      },
    })
    
    throw error
  }
})

// Event handlers
historicalSyncQueue.on('completed', (job, result) => {
  console.log(`[Historical Sync] Job ${job.id} completed:`, result)
})

historicalSyncQueue.on('failed', (job, err) => {
  console.error(`[Historical Sync] Job ${job.id} failed:`, err.message)
})

historicalSyncQueue.on('progress', (job, progress) => {
  console.log(`[Historical Sync] Job ${job.id} progress: ${progress}%`)
})

// Helper to add a job
export async function queueHistoricalSync(daysBack: number = 730, forceRefresh: boolean = false) {
  const job = await historicalSyncQueue.add(
    { daysBack, forceRefresh },
    {
      jobId: `historical-sync-${Date.now()}`,
    }
  )
  return job
}

// Helper to get queue status
export async function getHistoricalSyncQueueStatus() {
  const [waiting, active, completed, failed] = await Promise.all([
    historicalSyncQueue.getWaitingCount(),
    historicalSyncQueue.getActiveCount(),
    historicalSyncQueue.getCompletedCount(),
    historicalSyncQueue.getFailedCount(),
  ])
  
  return { waiting, active, completed, failed }
}
