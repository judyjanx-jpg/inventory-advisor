/**
 * Sync Worker
 * 
 * Processes all sync jobs from the queues.
 */

import {
  ordersQueue,
  financesQueue,
  inventoryQueue,
  productsQueue,
  reportsQueue,
  aggregationQueue,
  allQueues,
} from './index'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

/**
 * Log sync result to database
 */
async function logSyncResult(syncType: string, status: string, result: any, error: string | null) {
  try {
    await prisma.syncLog.create({
      data: {
        syncType: `scheduled-${syncType}`,
        status,
        completedAt: new Date(),
        metadata: result || undefined,
        errorMessage: error || undefined,
      },
    })
  } catch (e) {
    // Ignore logging errors
  }
}

/**
 * Helper: sleep for rate limiting
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Orders sync processor
 */
async function processOrdersSync(job: any) {
  const startTime = Date.now()
  console.log(`\n[orders-sync] Starting job ${job.id}...`)

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('Amazon credentials not configured')

    const client = await createSpApiClient()
    if (!client) throw new Error('Failed to create SP-API client')

    const daysBack = job.data.daysBack || 2
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    let ordersProcessed = 0
    let nextToken: string | null = null

    do {
      const response: any = await client.callAPI({
        operation: 'getOrders',
        endpoint: 'orders',
        query: {
          MarketplaceIds: [credentials.marketplaceId],
          CreatedAfter: startDate.toISOString(),
          MaxResultsPerPage: 100,
          ...(nextToken ? { NextToken: nextToken } : {}),
        },
      })

      const orders = response?.Orders || response?.payload?.Orders || []
      nextToken = response?.NextToken || response?.payload?.NextToken || null

      for (const order of orders) {
        const orderId = order.AmazonOrderId
        if (!orderId) continue

        await prisma.order.upsert({
          where: { id: orderId },
          update: {
            status: order.OrderStatus || 'Unknown',
            fulfillmentChannel: order.FulfillmentChannel,
            orderTotal: parseFloat(order.OrderTotal?.Amount || '0'),
          },
          create: {
            id: orderId,
            purchaseDate: new Date(order.PurchaseDate),
            status: order.OrderStatus || 'Unknown',
            fulfillmentChannel: order.FulfillmentChannel,
            salesChannel: order.SalesChannel,
            orderTotal: parseFloat(order.OrderTotal?.Amount || '0'),
            currency: order.OrderTotal?.CurrencyCode || 'USD',
          },
        })
        ordersProcessed++
      }

      if (nextToken) await sleep(500)
    } while (nextToken)

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[orders-sync] Completed in ${duration}s - ${ordersProcessed} orders`)
    
    await logSyncResult('orders', 'success', { ordersProcessed }, null)
    return { ordersProcessed }
  } catch (error: any) {
    console.error(`[orders-sync] Failed:`, error.message)
    await logSyncResult('orders', 'failed', null, error.message)
    throw error
  }
}

/**
 * Financial events sync processor
 * Processes both ShipmentEventList (for fees) and RefundEventList (for refund amounts)
 */
async function processFinancesSync(job: any) {
  const startTime = Date.now()
  console.log(`\n[finances-sync] Starting job ${job.id}...`)

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('Amazon credentials not configured')

    const client = await createSpApiClient()
    if (!client) throw new Error('Failed to create SP-API client')

    const daysBack = job.data.daysBack || 7
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    let eventsProcessed = 0
    let feesUpdated = 0
    let refundsProcessed = 0
    let refundsUpdated = 0
    let nextToken: string | null = null

    do {
      const response: any = await client.callAPI({
        operation: 'listFinancialEvents',
        endpoint: 'finances',
        query: {
          PostedAfter: startDate.toISOString(),
          MaxResultsPerPage: 100,
          ...(nextToken ? { NextToken: nextToken } : {}),
        },
      })

      const events = response?.payload?.FinancialEvents || response?.FinancialEvents || {}
      nextToken = response?.payload?.NextToken || response?.NextToken || null

      // Process ShipmentEventList for order fees
      for (const event of events.ShipmentEventList || []) {
        const orderId = event.AmazonOrderId
        if (!orderId) continue

        for (const item of event.ShipmentItemList || []) {
          const sku = item.SellerSKU
          if (!sku) continue

          let referralFee = 0, fbaFee = 0, otherFees = 0

          for (const fee of (item.ItemFeeList || [])) {
            const feeType = fee.FeeType || ''
            const amount = Math.abs(parseFloat(fee.FeeAmount?.CurrencyAmount || 0))

            if (feeType.includes('Commission') || feeType.includes('Referral')) {
              referralFee += amount
            } else if (feeType.includes('FBA')) {
              fbaFee += amount
            } else if (feeType.includes('Fee')) {
              otherFees += amount
            }
          }

          const totalFees = referralFee + fbaFee + otherFees
          if (totalFees > 0) {
            const result = await prisma.orderItem.updateMany({
              where: { orderId, masterSku: sku },
              data: { referralFee, fbaFee, otherFees, amazonFees: totalFees },
            })
            if (result.count > 0) feesUpdated++
          }
          eventsProcessed++
        }
      }

      // Process RefundEventList to get refund amounts for returns
      for (const event of events.RefundEventList || []) {
        const orderId = event.AmazonOrderId
        if (!orderId) continue

        for (const item of event.ShipmentItemAdjustmentList || []) {
          const sku = item.SellerSKU
          if (!sku) continue

          // Calculate total refund from charge adjustments
          let refundAmount = 0
          for (const charge of (item.ItemChargeAdjustmentList || [])) {
            const amount = Math.abs(parseFloat(charge.ChargeAmount?.CurrencyAmount || 0))
            refundAmount += amount
          }

          if (refundAmount > 0) {
            // Update existing return records that don't have refund amount set
            const result = await prisma.return.updateMany({
              where: {
                orderId,
                masterSku: sku,
                refundAmount: 0,
              },
              data: {
                refundAmount: refundAmount,
              },
            })
            if (result.count > 0) refundsUpdated++
            refundsProcessed++
          }
        }
      }

      if (nextToken) await sleep(500)
    } while (nextToken)

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[finances-sync] Completed in ${duration}s - ${feesUpdated} fees, ${refundsUpdated} refunds updated`)

    await logSyncResult('finances', 'success', { eventsProcessed, feesUpdated, refundsProcessed, refundsUpdated }, null)
    return { eventsProcessed, feesUpdated, refundsProcessed, refundsUpdated }
  } catch (error: any) {
    console.error(`[finances-sync] Failed:`, error.message)
    await logSyncResult('finances', 'failed', null, error.message)
    throw error
  }
}

/**
 * Inventory sync processor
 */
async function processInventorySync(job: any) {
  const startTime = Date.now()
  console.log(`\n[inventory-sync] Starting job ${job.id}...`)

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('Amazon credentials not configured')

    const client = await createSpApiClient()
    if (!client) throw new Error('Failed to create SP-API client')

    let updated = 0
    let skipped = 0
    let nextToken: string | null = null

    do {
      const response: any = await client.callAPI({
        operation: 'getInventorySummaries',
        endpoint: 'fbaInventory',
        query: {
          granularityType: 'Marketplace',
          granularityId: credentials.marketplaceId,
          marketplaceIds: [credentials.marketplaceId],
          details: true,
          ...(nextToken ? { nextToken } : {}),
        },
      })

      const payload: any = response?.payload || response
      const items = payload?.inventorySummaries || []
      nextToken = payload?.pagination?.nextToken || null

      for (const item of items) {
        if (!item.sellerSku) continue

        const details = item.inventoryDetails || {}
        const fbaAvailable = details.fulfillableQuantity ?? item.fulfillableQuantity ?? 0

        if (item.fnSku) {
          await prisma.product.updateMany({
            where: { sku: item.sellerSku },
            data: { fnsku: item.fnSku },
          })
        }

        const product = await prisma.product.findUnique({
        where: { sku: item.sellerSku },
      })
      
      if (!product) {
        skipped++
        continue
      }

      await prisma.inventoryLevel.upsert({
        where: { masterSku: item.sellerSku },
        update: { fbaAvailable },
        create: {
          masterSku: item.sellerSku,
          fbaAvailable,
          warehouseAvailable: 0,
        },
      })
      updated++
    }

      if (nextToken) await sleep(500)
    } while (nextToken)

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[inventory-sync] Completed in ${duration}s - ${updated} items`)
    
    await logSyncResult('inventory', 'success', { updated }, null)
    return { updated }
  } catch (error: any) {
    console.error(`[inventory-sync] Failed:`, error.message)
    await logSyncResult('inventory', 'failed', null, error.message)
    throw error
  }
}

/**
 * Products sync processor
 */
async function processProductsSync(job: any) {
  const startTime = Date.now()
  console.log(`\n[products-sync] Starting job ${job.id}...`)

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('Amazon credentials not configured')

    const client = await createSpApiClient()
    if (!client) throw new Error('Failed to create SP-API client')

    let created = 0
    let updated = 0
    let skipped = 0
    let nextToken: string | null = null

    // Get all FBA inventory items (includes SKU, FNSKU, ASIN)
    do {
      const response: any = await client.callAPI({
        operation: 'getInventorySummaries',
        endpoint: 'fbaInventory',
        query: {
          granularityType: 'Marketplace',
          granularityId: credentials.marketplaceId,
          marketplaceIds: [credentials.marketplaceId],
          details: true,
          ...(nextToken ? { nextToken } : {}),
        },
      })

      const payload: any = response?.payload || response
      const items = payload?.inventorySummaries || []
      nextToken = payload?.pagination?.nextToken || null

      for (const item of items) {
        const sku = item.sellerSku
        if (!sku) continue

        const asin = item.asin || null
        const fnsku = item.fnSku || null
        const productName = item.productName || sku

        // Check if product exists
        const existingProduct = await prisma.product.findUnique({
          where: { sku },
        })

        if (existingProduct) {
          // Update existing product with FNSKU and ASIN if missing
          const updateData: any = {}
          if (fnsku && !existingProduct.fnsku) updateData.fnsku = fnsku
          if (asin && !existingProduct.asin) updateData.asin = asin
          
          if (Object.keys(updateData).length > 0) {
            await prisma.product.update({
              where: { sku },
              data: updateData,
            })
            updated++
          } else {
            skipped++
          }
        } else {
          // Create new product
          try {
            await prisma.product.create({
              data: {
                sku,
                title: productName,
                asin,
                fnsku,
                cost: 0,
                price: 0,
                status: 'active',
                brand: 'KISPER',
              },
            })
            
            // Also create inventory level record
            await prisma.inventoryLevel.create({
              data: {
                masterSku: sku,
                fbaAvailable: 0,
                warehouseAvailable: 0,
              },
            })
            
            created++
          } catch (err: any) {
            // Skip if duplicate or other error
            if (err.code !== 'P2002') {
              console.log(`  ⚠️ Failed to create ${sku}: ${err.message}`)
            }
            skipped++
          }
        }
      }

      if (nextToken) await sleep(500)
    } while (nextToken)

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[products-sync] Completed in ${duration}s - ${created} created, ${updated} updated, ${skipped} skipped`)
    
    await logSyncResult('products', 'success', { created, updated, skipped }, null)
    return { created, updated, skipped }
  } catch (error: any) {
    console.error(`[products-sync] Failed:`, error.message)
    await logSyncResult('products', 'failed', null, error.message)
    throw error
  }
}

/**
 * Helper: wait for Amazon report to complete
 */
async function waitForReport(client: any, reportId: string, maxWaitMinutes = 60): Promise<string | null> {
  const maxAttempts = maxWaitMinutes * 2 // Check every 30 seconds
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts++

    const reportResponse = await client.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId },
    })

    const status = reportResponse?.processingStatus

    if (status === 'DONE') {
      return reportResponse?.reportDocumentId || null
    }

    if (status === 'CANCELLED' || status === 'FATAL') {
      throw new Error(`Report failed with status: ${status}`)
    }

    // Wait 30 seconds before next check
    await sleep(30000)
  }

  throw new Error(`Report timed out after ${maxWaitMinutes} minutes`)
}

/**
 * Helper: download report content
 */
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

  return await response.text()
}

/**
 * Parse returns report from Amazon
 */
interface ReturnItem {
  returnId: string
  orderId: string
  sku: string
  returnDate: string
  quantity: number
  reason: string
  disposition: string
  asin: string
  fnsku: string
}

function parseReturnsReport(reportContent: string): ReturnItem[] {
  const lines = reportContent.split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split('\t').map(h => h.toLowerCase().trim())

  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const idx = header.findIndex(h => h === p || h.includes(p))
      if (idx >= 0) return idx
    }
    return -1
  }

  const returnIdIdx = findCol(['return-id', 'returnid', 'license-plate-number'])
  const orderIdIdx = findCol(['order-id', 'amazon-order-id'])
  const skuIdx = findCol(['sku', 'seller-sku', 'merchant-sku'])
  const asinIdx = findCol(['asin'])
  const fnskuIdx = findCol(['fnsku'])
  const dateIdx = findCol(['return-date', 'return-request-date'])
  const qtyIdx = findCol(['quantity', 'returned-quantity'])
  const reasonIdx = findCol(['reason', 'return-reason', 'detailed-disposition'])
  const dispositionIdx = findCol(['disposition', 'status'])

  const items: ReturnItem[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split('\t')

    const returnId = returnIdIdx >= 0 ? cols[returnIdIdx]?.trim() : `RET-${i}`
    const orderId = orderIdIdx >= 0 ? cols[orderIdIdx]?.trim() : ''
    const sku = skuIdx >= 0 ? cols[skuIdx]?.trim() : ''
    const asin = asinIdx >= 0 ? cols[asinIdx]?.trim() : ''
    const fnsku = fnskuIdx >= 0 ? cols[fnskuIdx]?.trim() : ''
    const returnDate = dateIdx >= 0 ? cols[dateIdx]?.trim() : ''
    const quantity = qtyIdx >= 0 ? parseInt(cols[qtyIdx]) || 1 : 1
    const reason = reasonIdx >= 0 ? cols[reasonIdx]?.trim() : ''
    const disposition = dispositionIdx >= 0 ? cols[dispositionIdx]?.trim() : 'unknown'

    if (!sku && !asin) continue

    items.push({
      returnId,
      orderId,
      sku,
      returnDate,
      quantity,
      reason,
      disposition,
      asin,
      fnsku
    })
  }

  return items
}

/**
 * Reports sync processor - syncs returns data from Amazon
 */
async function processReportsSync(job: any) {
  const startTime = Date.now()
  console.log(`\n[daily-reports] Starting job ${job.id}...`)

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('Amazon credentials not configured')

    const client = await createSpApiClient()
    if (!client) throw new Error('Failed to create SP-API client')

    const daysBack = job.data.daysBack || 90 // Sync last 90 days of returns
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)
    const endDate = new Date()

    let returnsCreated = 0
    let returnsUpdated = 0

    // Build SKU lookup maps for matching by ASIN/FNSKU
    const existingProducts = await prisma.product.findMany({
      select: { sku: true, asin: true, fnsku: true }
    })
    const existingSkuSet = new Set(existingProducts.map(p => p.sku))
    const productsByAsin = new Map<string, string>()
    const productsByFnsku = new Map<string, string>()
    for (const p of existingProducts) {
      if (p.asin) productsByAsin.set(p.asin, p.sku)
      if (p.fnsku) productsByFnsku.set(p.fnsku, p.sku)
    }

    // Helper to find SKU from various identifiers
    const findSku = (sku: string, asin: string, fnsku: string): string | null => {
      if (sku && existingSkuSet.has(sku)) return sku
      if (asin && productsByAsin.has(asin)) return productsByAsin.get(asin)!
      if (fnsku && productsByFnsku.has(fnsku)) return productsByFnsku.get(fnsku)!
      return null
    }

    // Request returns report
    console.log(`  Requesting returns report for last ${daysBack} days...`)

    const reportTypes = [
      'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
      'GET_FBA_CUSTOMER_RETURNS_DATA',
    ]

    for (const reportType of reportTypes) {
      console.log(`  Trying: ${reportType}`)
      try {
        const reportResponse = await client.callAPI({
          operation: 'createReport',
          endpoint: 'reports',
          body: {
            reportType,
            marketplaceIds: [credentials.marketplaceId],
            dataStartTime: startDate.toISOString(),
            dataEndTime: endDate.toISOString(),
          },
        })

        const reportId = reportResponse?.reportId
        if (!reportId) {
          console.log(`    No report ID returned`)
          continue
        }

        console.log(`    Report ID: ${reportId}`)
        console.log(`    Waiting for report to complete...`)

        const docId = await waitForReport(client, reportId, 60) // 60 minute timeout
        if (!docId) {
          console.log(`    Report completed but no document ID`)
          continue
        }

        console.log(`    Downloading report...`)
        const content = await downloadReport(client, docId)
        const returns = parseReturnsReport(content)
        console.log(`    Parsed ${returns.length} returns`)

        // Save returns to database
        for (const ret of returns) {
          const masterSku = findSku(ret.sku, ret.asin, ret.fnsku)
          if (!masterSku) continue

          try {
            const existingReturn = await prisma.return.findUnique({
              where: { returnId: ret.returnId },
            })

            if (existingReturn) {
              // Update if we have more info
              if (!existingReturn.reason && ret.reason) {
                await prisma.return.update({
                  where: { returnId: ret.returnId },
                  data: { reason: ret.reason, disposition: ret.disposition },
                })
                returnsUpdated++
              }
            } else {
              await prisma.return.create({
                data: {
                  returnId: ret.returnId,
                  orderId: ret.orderId || 'UNKNOWN',
                  masterSku,
                  returnDate: new Date(ret.returnDate || new Date()),
                  quantity: ret.quantity,
                  reason: ret.reason || null,
                  disposition: ret.disposition || 'unknown',
                  refundAmount: 0, // Will be populated by finances sync
                },
              })
              returnsCreated++
            }
          } catch (e) {
            // Skip duplicates or FK errors
          }
        }

        if (returns.length > 0) break // Got data, stop trying other report types
      } catch (e: any) {
        console.log(`    Failed: ${e.message?.substring(0, 80)}`)
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[daily-reports] Completed in ${duration}s - ${returnsCreated} created, ${returnsUpdated} updated`)

    await logSyncResult('reports', 'success', { returnsCreated, returnsUpdated }, null)
    return { returnsCreated, returnsUpdated }
  } catch (error: any) {
    console.error(`[daily-reports] Failed:`, error.message)
    await logSyncResult('reports', 'failed', null, error.message)
    throw error
  }
}

/**
 * Aggregation processor
 */
async function processAggregation(job: any) {
  const startTime = Date.now()
  console.log(`\n[daily-aggregation] Starting job ${job.id}...`)

  try {
    const daysBack = job.data.daysBack || 30
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: { purchaseDate: { gte: startDate } },
      },
      include: {
        order: { select: { purchaseDate: true } },
        product: { select: { cost: true } },
      },
    })

    const dailyMap = new Map<string, any>()

    for (const item of orderItems) {
      const date = new Date(item.order.purchaseDate)
      date.setHours(0, 0, 0, 0)
      const key = `${date.toISOString().split('T')[0]}|${item.masterSku}`

      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          date,
          masterSku: item.masterSku,
          unitsSold: 0,
          revenue: 0,
          amazonFees: 0,
          cogs: 0,
        })
      }

      const daily = dailyMap.get(key)!
      daily.unitsSold += item.quantity
      daily.revenue += Number(item.grossRevenue || 0)
      daily.amazonFees += Number(item.amazonFees || 0)
      daily.cogs += item.quantity * Number(item.product?.cost || 0)
    }

    let updated = 0
    let skipped = 0
    for (const [_, daily] of dailyMap) {
      const grossProfit = daily.revenue - daily.amazonFees
      const netProfit = grossProfit - daily.cogs

      await prisma.dailyProfit.upsert({
        where: {
          date_masterSku: { date: daily.date, masterSku: daily.masterSku },
        },
        update: {
          unitsSold: daily.unitsSold,
          revenue: daily.revenue,
          amazonFees: daily.amazonFees,
          cogs: daily.cogs,
          grossProfit,
          netProfit,
          profitMargin: daily.revenue > 0 ? (netProfit / daily.revenue) * 100 : 0,
        },
        create: {
          date: daily.date,
          masterSku: daily.masterSku,
          unitsSold: daily.unitsSold,
          revenue: daily.revenue,
          amazonFees: daily.amazonFees,
          cogs: daily.cogs,
          grossProfit,
          netProfit,
          profitMargin: daily.revenue > 0 ? (netProfit / daily.revenue) * 100 : 0,
        },
      })
      updated++
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[daily-aggregation] Completed in ${duration}s - ${updated} records`)
    
    await logSyncResult('aggregation', 'success', { dailyRecordsUpdated: updated }, null)
    return { dailyRecordsUpdated: updated }
  } catch (error: any) {
    console.error(`[daily-aggregation] Failed:`, error.message)
    await logSyncResult('aggregation', 'failed', null, error.message)
    throw error
  }
}

/**
 * Start processing jobs
 * 
 * IMPORTANT: Process handlers must be registered WITH the exact job name
 * that matches what's used in the scheduler and manual triggers.
 */
export function startWorker() {
  console.log('\n🔧 Starting sync worker...\n')

  // Register catch-all processors (no job name) to handle ALL jobs
  // This works for both scheduled (repeatable) jobs and manual jobs
  // Repeatable jobs use internal keys that don't match job names, so catch-all is required
ordersQueue.process('orders-sync', processOrdersSync)
financesQueue.process('finances-sync', processFinancesSync)
inventoryQueue.process('inventory-sync', processInventorySync)
productsQueue.process('products-sync', processProductsSync)
reportsQueue.process('daily-reports', processReportsSync)
aggregationQueue.process('daily-aggregation', processAggregation)

  console.log('  ✓ Registered catch-all handler for orders-sync queue')
  console.log('  ✓ Registered catch-all handler for finances-sync queue')
  console.log('  ✓ Registered catch-all handler for inventory-sync queue')
  console.log('  ✓ Registered catch-all handler for products-sync queue')
  console.log('  ✓ Registered catch-all handler for reports-sync queue')
  console.log('  ✓ Registered catch-all handler for aggregation queue')
  console.log('  ℹ️  Catch-all handlers process ALL jobs regardless of job name')

  // Global event handlers
  allQueues.forEach(queue => {
    // Log when queue is ready
    queue.on('ready', () => {
      console.log(`   ✓ Queue "${queue.name}" is ready and listening`)
    })

    // Log when waiting for jobs
    queue.on('waiting', (jobId: string) => {
      console.log(`   📥 Job ${jobId} is waiting in queue "${queue.name}"`)
    })

    queue.on('active', (job: any) => {
      console.log(`\n🔄 Job ${job?.id} (${job?.name}) in ${queue.name} is now active`)
      console.log(`   Data:`, JSON.stringify(job?.data || {}, null, 2))
    })

    queue.on('stalled', (job: any) => {
      console.warn(`\n⚠️  Job ${job?.id} (${job?.name}) in ${queue.name} stalled`)
    })

    queue.on('failed', (job: any, err: Error) => {
      console.error(`\n❌ Job ${job?.id} (${job?.name}) in ${queue.name} failed:`, err.message)
      if (err.stack) {
        console.error('Stack:', err.stack)
      }
    })

    queue.on('completed', (job: any) => {
      console.log(`\n✅ Job ${job?.id} (${job?.name}) in ${queue.name} completed`)
      if (job?.returnvalue) {
        console.log('   Result:', JSON.stringify(job.returnvalue, null, 2))
      }
    })

    queue.on('error', (error: Error) => {
      console.error(`\n❌ Queue "${queue.name}" error:`, error.message)
    })
  })

  console.log('\n✅ Worker started and listening for jobs!')
  console.log('   Waiting for jobs to process...\n')
}
