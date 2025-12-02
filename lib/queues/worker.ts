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
      const response = await client.callAPI({
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
    let nextToken: string | null = null

    do {
      const response = await client.callAPI({
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

      if (nextToken) await sleep(500)
    } while (nextToken)

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[finances-sync] Completed in ${duration}s - ${feesUpdated} fees updated`)
    
    await logSyncResult('finances', 'success', { eventsProcessed, feesUpdated }, null)
    return { eventsProcessed, feesUpdated }
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
    let nextToken: string | null = null

    do {
      const response = await client.callAPI({
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

      const payload = response?.payload || response
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
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/amazon/sync/products`, { method: 'POST' })
    const result = await response.json()
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[products-sync] Completed in ${duration}s`)
    
    await logSyncResult('products', 'success', result, null)
    return result
  } catch (error: any) {
    console.error(`[products-sync] Failed:`, error.message)
    await logSyncResult('products', 'failed', null, error.message)
    throw error
  }
}

/**
 * Reports sync processor
 */
async function processReportsSync(job: any) {
  const startTime = Date.now()
  console.log(`\n[daily-reports] Starting job ${job.id}...`)

  try {
    // Placeholder - add report sync logic here
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[daily-reports] Completed in ${duration}s`)
    
    await logSyncResult('reports', 'success', {}, null)
    return { success: true }
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
 * IMPORTANT: Process handlers must be registered WITHOUT a job name
 * to process ALL jobs in the queue, or WITH the exact job name used when adding.
 */
export function startWorker() {
  console.log('\n🔧 Starting sync worker...\n')

  // Register processors - process ALL jobs in each queue
  ordersQueue.process(processOrdersSync)
  financesQueue.process(processFinancesSync)
  inventoryQueue.process(processInventorySync)
  productsQueue.process(processProductsSync)
  reportsQueue.process(processReportsSync)
  aggregationQueue.process(processAggregation)

  // Global event handlers
  allQueues.forEach(queue => {
    queue.on('failed', (job: any, err: Error) => {
      console.error(`❌ Job ${job?.id} in ${queue.name} failed:`, err.message)
    })

    queue.on('completed', (job: any) => {
      console.log(`✅ Job ${job?.id} in ${queue.name} completed`)
    })
  })

  console.log('Worker started and listening for jobs!\n')
}
