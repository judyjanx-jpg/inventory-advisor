/**
 * Sync Worker
 * 
 * Processes all sync jobs from the queues.
 * Can run as part of main app or as separate service.
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

// Concurrency settings (how many jobs can run at once per queue)
const CONCURRENCY = {
  orders: 1,
  finances: 1,
  inventory: 1,
  products: 1,
  reports: 1,
  aggregation: 1,
}

/**
 * Create a job processor with logging and error handling
 */
function createProcessor(name: string, syncFunction: (job: any) => Promise<any>) {
  return async (job: any) => {
    const startTime = Date.now()
    console.log(`\n[${name}] Starting job ${job.id}...`)

    try {
      await job.progress(0)
      const result = await syncFunction(job)
      await job.progress(100)

      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[${name}] Job ${job.id} completed in ${duration}s`)

      // Log to database
      await logSyncResult(name, 'success', result, null)

      return result
    } catch (error: any) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.error(`[${name}] Job ${job.id} failed after ${duration}s:`, error.message)

      // Log to database
      await logSyncResult(name, 'failed', null, error.message)

      throw error
    }
  }
}

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
 * Orders sync processor
 */
async function processOrdersSync(job: any) {
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

    await job.progress((ordersProcessed / 100) * 50)
    if (nextToken) await sleep(500)
  } while (nextToken)

  return { ordersProcessed }
}

/**
 * Financial events sync processor
 */
async function processFinancesSync(job: any) {
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

    // Process shipment events (fees)
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

  return { eventsProcessed, feesUpdated }
}

/**
 * Inventory sync processor
 */
async function processInventorySync(job: any) {
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

      // Update FNSKU
      if (item.fnSku) {
        await prisma.product.updateMany({
          where: { sku: item.sellerSku },
          data: { fnsku: item.fnSku },
        })
      }

      // Update inventory
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

  return { updated }
}

/**
 * Products sync processor
 */
async function processProductsSync(job: any) {
  // Delegate to existing products sync logic
  const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/amazon/sync/products`, {
    method: 'POST',
  })
  return await response.json()
}

/**
 * Reports sync processor (storage fees, returns, reimbursements)
 */
async function processReportsSync(job: any) {
  // This could trigger multiple report types
  const results: any = {}

  // Call existing sync endpoints
  try {
    const storageFees = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/amazon/sync/initial`, {
      method: 'POST',
    })
    results.storageFees = await storageFees.json()
  } catch (e: any) {
    results.storageFees = { error: e.message }
  }

  return results
}

/**
 * Aggregation processor (calculate profit summaries)
 */
async function processAggregation(job: any) {
  const daysBack = job.data.daysBack || 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  // Get order items for the period
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: { purchaseDate: { gte: startDate } },
    },
    include: {
      order: { select: { purchaseDate: true } },
      product: { select: { cost: true } },
    },
  })

  // Group by date + SKU
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

  return { dailyRecordsUpdated: updated }
}

/**
 * Start processing jobs
 */
export function startWorker() {
  console.log('\n🔧 Starting sync worker...\n')

  // Register processors
  ordersQueue.process(CONCURRENCY.orders, createProcessor('orders', processOrdersSync))
  financesQueue.process(CONCURRENCY.finances, createProcessor('finances', processFinancesSync))
  inventoryQueue.process(CONCURRENCY.inventory, createProcessor('inventory', processInventorySync))
  productsQueue.process(CONCURRENCY.products, createProcessor('products', processProductsSync))
  reportsQueue.process(CONCURRENCY.reports, createProcessor('reports', processReportsSync))
  aggregationQueue.process(CONCURRENCY.aggregation, createProcessor('aggregation', processAggregation))

  // Global event handlers
  allQueues.forEach(queue => {
    queue.on('failed', (job, err) => {
      console.error(`❌ Job ${job.id} in ${queue.name} failed:`, err.message)
    })

    queue.on('stalled', (job) => {
      console.warn(`⚠️ Job ${job.id} in ${queue.name} stalled`)
    })

    queue.on('completed', (job) => {
      console.log(`✅ Job ${job.id} in ${queue.name} completed`)
    })
  })

  console.log('Worker started and listening for jobs!\n')
}

/**
 * Helper: sleep for rate limiting
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

