/**
 * Sync Worker
 * 
 * Processes all sync jobs from the queues.
 */

import {
  ordersQueue,
  ordersReportQueue,
  financesQueue,
  inventoryQueue,
  productsQueue,
  reportsQueue,
  aggregationQueue,
  adsReportsQueue,
  alertsQueue,
  fbaShipmentsQueue,
  allQueues,
} from './index'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, callApiWithTimeout, getAmazonCredentials } from '@/lib/amazon-sp-api'
import { getAdsCredentials, getValidAccessToken } from '@/lib/amazon-ads-api'
import { gunzipSync } from 'zlib'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { startOfDay, subDays } from 'date-fns'

/**
 * Amazon uses PST/PDT (America/Los_Angeles) for day boundaries
 * All date grouping and calculations should use this timezone
 */
const AMAZON_TIMEZONE = 'America/Los_Angeles'

/**
 * Get a date range in UTC that corresponds to PST day boundaries
 * This ensures consistent day grouping between Railway (UTC) and local dev
 */
function getPSTDateRange(daysBack: number): { startDate: Date; endDate: Date } {
  const nowUTC = new Date()
  const nowInPST = toZonedTime(nowUTC, AMAZON_TIMEZONE)
  const startInPST = startOfDay(subDays(nowInPST, daysBack))
  const endInPST = nowInPST

  return {
    startDate: fromZonedTime(startInPST, AMAZON_TIMEZONE),
    endDate: fromZonedTime(endInPST, AMAZON_TIMEZONE),
  }
}

/**
 * Convert a UTC date to the start of that day in PST, returned as UTC
 * Used for grouping orders/items by PST day
 */
function toPSTDayStart(utcDate: Date): Date {
  const dateInPST = toZonedTime(utcDate, AMAZON_TIMEZONE)
  const dayStartInPST = startOfDay(dateInPST)
  return fromZonedTime(dayStartInPST, AMAZON_TIMEZONE)
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
    const { startDate } = getPSTDateRange(daysBack)

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
 * Orders Report sync processor
 * Uses GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL report
 * This gets item details for pending orders (same-day data like Sellerboard)
 */
async function processOrdersReportSync(job: any) {
  const startTime = Date.now()
  console.log(`\n[orders-report-sync] Starting job ${job.id}...`)

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('Amazon credentials not configured')

    const client = await createSpApiClient()
    if (!client) throw new Error('Failed to create SP-API client')

    const daysBack = job.data.daysBack || 3
    const { startDate, endDate } = getPSTDateRange(daysBack)

    const REPORT_TYPE = 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL'
    console.log(`  Requesting ${REPORT_TYPE} for last ${daysBack} days...`)

    // Step 1: Create report request
    const createResponse = await callApiWithTimeout<{ reportId: string }>(client, {
      endpoint: 'reports',
      operation: 'createReport',
      body: {
        reportType: REPORT_TYPE,
        dataStartTime: startDate.toISOString(),
        dataEndTime: endDate.toISOString(),
        marketplaceIds: [credentials.marketplaceId],
      },
    }, 30000)

    const reportId = createResponse.reportId
    console.log(`  Created report: ${reportId}`)

    // Step 2: Poll for report completion
    let reportDocumentId: string | null = null
    let attempts = 0
    const maxAttempts = 60 // 5 minutes max

    while (!reportDocumentId && attempts < maxAttempts) {
      await sleep(5000) // Wait 5 seconds
      attempts++

      const statusResponse = await callApiWithTimeout<{ processingStatus: string; reportDocumentId?: string }>(client, {
        endpoint: 'reports',
        operation: 'getReport',
        path: { reportId },
      }, 30000)

      if (statusResponse.processingStatus === 'DONE') {
        reportDocumentId = statusResponse.reportDocumentId || null
        console.log(`  Report completed after ${attempts} attempts`)
      } else if (statusResponse.processingStatus === 'FATAL' || statusResponse.processingStatus === 'CANCELLED') {
        throw new Error(`Report failed: ${statusResponse.processingStatus}`)
      } else if (attempts % 6 === 0) {
        console.log(`  Status: ${statusResponse.processingStatus} (attempt ${attempts})`)
      }
    }

    if (!reportDocumentId) {
      console.log(`  Report timed out after ${maxAttempts} attempts`)
      await logSyncResult('orders-report', 'timeout', { reportId }, 'Report generation timed out')
      return { reportId, status: 'timeout' }
    }

    // Step 3: Get report document URL
    const documentResponse = await callApiWithTimeout<{ url: string; compressionAlgorithm?: string }>(client, {
      endpoint: 'reports',
      operation: 'getReportDocument',
      path: { reportDocumentId },
    }, 30000)

    // Step 4: Download and parse report
    console.log(`  Downloading report...`)
    const response = await fetch(documentResponse.url)
    if (!response.ok) throw new Error(`Failed to download report: ${response.status}`)

    let text: string
    if (documentResponse.compressionAlgorithm === 'GZIP') {
      const buffer = await response.arrayBuffer()
      const decompressed = gunzipSync(Buffer.from(buffer))
      text = decompressed.toString('utf-8')
    } else {
      text = await response.text()
    }

    // Parse TSV
    const lines = text.trim().split('\n')
    if (lines.length < 2) {
      console.log(`  Report is empty`)
      await logSyncResult('orders-report', 'success', { ordersProcessed: 0, itemsCreated: 0 }, null)
      return { ordersProcessed: 0, itemsCreated: 0 }
    }

    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().replace(/-/g, '_'))
    const rows: any[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t')
      const row: any = {}
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() || null
      })
      rows.push(row)
    }

    console.log(`  Parsed ${rows.length} rows`)

    // Step 5: Process and save to database
    const stats = await processOrdersReportData(rows)

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[orders-report-sync] Completed in ${duration}s - ${stats.ordersProcessed} orders, ${stats.itemsCreated} items`)

    await logSyncResult('orders-report', 'success', stats, null)
    return stats
  } catch (error: any) {
    console.error(`[orders-report-sync] Failed:`, error.message)
    await logSyncResult('orders-report', 'failed', null, error.message)
    throw error
  }
}

/**
 * Process orders report data and save to database
 */
async function processOrdersReportData(rows: any[]): Promise<{
  ordersProcessed: number
  itemsCreated: number
  itemsUpdated: number
  errors: number
}> {
  let ordersProcessed = 0
  let itemsCreated = 0
  let itemsUpdated = 0
  let errors = 0

  // Group by order ID
  const orderMap = new Map<string, any[]>()
  for (const row of rows) {
    const orderId = row['amazon_order_id'] || row['order_id']
    if (!orderId) continue

    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, [])
    }
    orderMap.get(orderId)!.push(row)
  }

  console.log(`  Processing ${orderMap.size} unique orders`)

  // Get existing products for foreign key validation
  const allSkus = new Set<string>()
  for (const [, items] of orderMap) {
    for (const item of items) {
      const sku = item['sku'] || item['seller_sku']
      if (sku) allSkus.add(sku)
    }
  }

  const existingProducts = await prisma.product.findMany({
    where: { sku: { in: Array.from(allSkus) } },
    select: { sku: true },
  })
  const existingSkuSet = new Set(existingProducts.map((p: any) => p.sku))

  // Process orders in batches
  const orderIds = Array.from(orderMap.keys())
  const batchSize = 100

  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize)

    try {
      await prisma.$transaction(async (tx: any) => {
        for (const orderId of batch) {
          const items = orderMap.get(orderId)!
          const firstItem = items[0]

          try {
            const purchaseDateStr = firstItem['purchase_date']
            const purchaseDate = purchaseDateStr ? new Date(purchaseDateStr) : new Date()
            const status = firstItem['order_status'] || 'Unknown'

            let orderTotal = 0
            for (const item of items) {
              orderTotal += parseFloat(item['item_price'] || '0')
            }

            // Upsert order
            await tx.order.upsert({
              where: { id: orderId },
              update: {
                status,
                orderTotal,
                shipCity: firstItem['ship_city'] || null,
                shipState: firstItem['ship_state'] || null,
                shipCountry: firstItem['ship_country'] || null,
                shipPostalCode: firstItem['ship_postal_code'] || null,
                fulfillmentChannel: firstItem['fulfillment_channel'] || null,
                salesChannel: firstItem['sales_channel'] || null,
              },
              create: {
                id: orderId,
                purchaseDate: isNaN(purchaseDate.getTime()) ? new Date() : purchaseDate,
                status,
                orderTotal,
                currency: firstItem['currency'] || 'USD',
                shipCity: firstItem['ship_city'] || null,
                shipState: firstItem['ship_state'] || null,
                shipCountry: firstItem['ship_country'] || null,
                shipPostalCode: firstItem['ship_postal_code'] || null,
                fulfillmentChannel: firstItem['fulfillment_channel'] || null,
                salesChannel: firstItem['sales_channel'] || null,
              },
            })

            // Delete existing order items for this order
            await tx.orderItem.deleteMany({
              where: { orderId },
            })

            // Aggregate items by SKU
            const itemsBySku = new Map<string, any>()
            for (const item of items) {
              const sku = item['sku'] || item['seller_sku']
              if (!sku || !existingSkuSet.has(sku)) continue

              const itemPrice = parseFloat(item['item_price'] || '0')
              const shippingPrice = parseFloat(item['shipping_price'] || '0')
              const giftWrapPrice = parseFloat(item['gift_wrap_price'] || '0')
              const promoDiscount = Math.abs(parseFloat(item['item_promotion_discount'] || '0'))
              const shipPromoDiscount = Math.abs(parseFloat(item['ship_promotion_discount'] || '0'))

              if (itemsBySku.has(sku)) {
                const existing = itemsBySku.get(sku)
                existing.quantity += parseInt(item['quantity'] || item['quantity_purchased'] || '1')
                existing.itemPrice += itemPrice
                existing.itemTax += parseFloat(item['item_tax'] || '0')
                existing.shippingPrice += shippingPrice
                existing.shippingTax += parseFloat(item['shipping_tax'] || '0')
                existing.promoDiscount += promoDiscount + shipPromoDiscount
                existing.shipPromoDiscount += shipPromoDiscount
                existing.giftWrapPrice += giftWrapPrice
                existing.giftWrapTax += parseFloat(item['gift_wrap_tax'] || '0')
                existing.grossRevenue += itemPrice + shippingPrice + giftWrapPrice
              } else {
                itemsBySku.set(sku, {
                  orderId,
                  masterSku: sku,
                  asin: item['asin'] || null,
                  quantity: parseInt(item['quantity'] || item['quantity_purchased'] || '1'),
                  itemPrice,
                  itemTax: parseFloat(item['item_tax'] || '0'),
                  shippingPrice,
                  shippingTax: parseFloat(item['shipping_tax'] || '0'),
                  promoDiscount: promoDiscount + shipPromoDiscount,
                  shipPromoDiscount,
                  giftWrapPrice,
                  giftWrapTax: parseFloat(item['gift_wrap_tax'] || '0'),
                  grossRevenue: itemPrice + shippingPrice + giftWrapPrice,
                })
              }
            }

            // Create order items
            const itemsToCreate = Array.from(itemsBySku.values())
            if (itemsToCreate.length > 0) {
              await tx.orderItem.createMany({
                data: itemsToCreate,
              })
              itemsCreated += itemsToCreate.length
            }

            ordersProcessed++
          } catch (err: any) {
            console.error(`  Error processing order ${orderId}:`, err.message)
            errors++
          }
        }
      }, { timeout: 30000 }) // 30 second timeout for batch processing
    } catch (txError: any) {
      console.error(`  Transaction error for batch starting at ${i}:`, txError.message)
      errors += batch.length
    }

    // Log progress every 500 orders
    if ((i + batchSize) % 500 === 0 || i + batchSize >= orderIds.length) {
      const progress = Math.min(100, Math.round(((i + batchSize) / orderIds.length) * 100))
      console.log(`  Progress: ${progress}% (${ordersProcessed} orders, ${itemsCreated} items)`)
    }
  }

  return { ordersProcessed, itemsCreated, itemsUpdated, errors }
}

/**
 * Financial events sync processor
 * Processes both ShipmentEventList (for fees AND actual revenue) and RefundEventList (for refund amounts)
 * Captures actual revenue from ItemChargeList for Sellerboard-level accuracy
 * Includes rate limit handling with exponential backoff
 */
async function processFinancesSync(job: any) {
  const startTime = Date.now()
  console.log(`\n[finances-sync] Starting job ${job.id}...`)

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('Amazon credentials not configured')

    const client = await createSpApiClient()
    if (!client) throw new Error('Failed to create SP-API client')

    const daysBack = job.data.daysBack || 14
    const { startDate, endDate: rangeEnd } = getPSTDateRange(daysBack)
    // Amazon requires end date in past
    const endDate = new Date(rangeEnd.getTime() - 5 * 60 * 1000)

    let eventsProcessed = 0
    let feesUpdated = 0
    let actualRevenueUpdated = 0
    let refundsProcessed = 0
    let refundsUpdated = 0
    let nextToken: string | null = null
    let retryCount = 0
    const maxRetries = 3

    console.log(`  Syncing ${daysBack} days of financial events (fees + actual revenue)...`)

    do {
      try {
        const response: any = await client.callAPI({
          operation: 'listFinancialEvents',
          endpoint: 'finances',
          query: {
            PostedAfter: startDate.toISOString(),
            PostedBefore: endDate.toISOString(),
            MaxResultsPerPage: 100,
            ...(nextToken ? { NextToken: nextToken } : {}),
          },
        })

        // Reset retry count on success
        retryCount = 0

        const events = response?.payload?.FinancialEvents || response?.FinancialEvents || {}
        nextToken = response?.payload?.NextToken || response?.NextToken || null

        // Process ShipmentEventList for order fees AND actual revenue
        for (const event of events.ShipmentEventList || []) {
          const orderId = event.AmazonOrderId
          if (!orderId) continue

          // Get the posted date for this financial event
          const postedDate = event.PostedDate ? new Date(event.PostedDate) : null

          for (const item of event.ShipmentItemList || []) {
            const sku = item.SellerSKU
            if (!sku) continue

            let referralFee = 0, fbaFee = 0, otherFees = 0
            let actualRevenue = 0  // From ItemChargeList - source of truth for Sellerboard-level accuracy

            // Process ItemFeeList for fees
            for (const fee of (item.ItemFeeList || [])) {
              const feeType = fee.FeeType || ''
              const amount = Math.abs(parseFloat(fee.FeeAmount?.CurrencyAmount || 0))

              if (feeType.includes('Commission') || feeType.includes('Referral')) {
                referralFee += amount
              } else if (feeType.includes('FBA') || feeType.includes('Fulfillment')) {
                fbaFee += amount
              } else if (feeType.includes('Fee')) {
                otherFees += amount
              }
            }

            // Process ItemChargeList for actual revenue (Sellerboard-level accuracy key!)
            // These are the actual charges collected: Principal, Shipping, Tax, etc.
            for (const charge of (item.ItemChargeList || [])) {
              const amount = parseFloat(charge.ChargeAmount?.CurrencyAmount || 0)
              // Positive values are money collected from customer
              if (amount > 0) {
                actualRevenue += amount
              }
            }

            // Also check for promotion adjustments which reduce revenue
            for (const promo of (item.PromotionList || [])) {
              const promoAmount = Math.abs(parseFloat(promo.PromotionAmount?.CurrencyAmount || 0))
              actualRevenue -= promoAmount
            }

            const totalFees = referralFee + fbaFee + otherFees
            if (totalFees > 0 || actualRevenue > 0) {
              const updateData: any = {
                referralFee,
                fbaFee,
                otherFees,
                amazonFees: totalFees,
              }

              // Add actual revenue if available (Sellerboard-level accuracy)
              if (actualRevenue > 0) {
                updateData.actualRevenue = actualRevenue
                updateData.actualRevenuePostedAt = postedDate
              }

              const result = await prisma.orderItem.updateMany({
                where: { orderId, masterSku: sku },
                data: updateData,
              })
              if (result.count > 0) {
                feesUpdated++
                if (actualRevenue > 0) actualRevenueUpdated++
              }
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

            let refundAmount = 0
            for (const charge of (item.ItemChargeAdjustmentList || [])) {
              const amount = Math.abs(parseFloat(charge.ChargeAmount?.CurrencyAmount || 0))
              refundAmount += amount
            }

            if (refundAmount > 0) {
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

        // Longer delay between requests to avoid rate limiting
        if (nextToken) await sleep(1000)

      } catch (apiError: any) {
        // Handle rate limiting with exponential backoff
        if (apiError.message?.includes('429') || apiError.message?.includes('rate') || apiError.message?.includes('QuotaExceeded')) {
          retryCount++
          if (retryCount <= maxRetries) {
            const backoffMs = Math.pow(2, retryCount) * 2000 // 4s, 8s, 16s
            console.log(`  ⚠️ Rate limited, waiting ${backoffMs/1000}s before retry ${retryCount}/${maxRetries}...`)
            await sleep(backoffMs)
            continue // Retry the same request
          } else {
            console.log(`  ⚠️ Max retries exceeded, moving on...`)
            break // Stop pagination
          }
        }
        throw apiError // Re-throw non-rate-limit errors
      }
    } while (nextToken)

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[finances-sync] Completed in ${duration}s - ${feesUpdated} fees, ${actualRevenueUpdated} actual revenue, ${refundsUpdated} refunds updated`)

    await logSyncResult('finances', 'success', { eventsProcessed, feesUpdated, actualRevenueUpdated, refundsProcessed, refundsUpdated }, null)
    return { eventsProcessed, feesUpdated, actualRevenueUpdated, refundsProcessed, refundsUpdated }
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
 * Helper: download report content (with gzip decompression)
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

  const compressionAlgorithm = docResponse?.compressionAlgorithm

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.status}`)
  }

  // Handle gzip compression
  if (compressionAlgorithm === 'GZIP') {
    const arrayBuffer = await response.arrayBuffer()
    const { gunzipSync } = await import('zlib')
    const decompressed = gunzipSync(Buffer.from(arrayBuffer))
    return decompressed.toString('utf-8')
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
    const { startDate, endDate } = getPSTDateRange(daysBack)

    let returnsCreated = 0
    let returnsUpdated = 0

    // Build SKU lookup maps for matching by ASIN/FNSKU
    const existingProducts = await prisma.product.findMany({
      select: { sku: true, asin: true, fnsku: true }
    })
    type ProductInfo = { sku: string; asin: string | null; fnsku: string | null }
    const existingSkuSet = new Set(existingProducts.map((p: ProductInfo) => p.sku))
    const productsByAsin = new Map<string, string>()
    const productsByFnsku = new Map<string, string>()
    for (const p of existingProducts as ProductInfo[]) {
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
    const { startDate } = getPSTDateRange(daysBack)

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
      // Use PST day boundaries for grouping - critical for Railway vs local consistency
      const pstDayStart = toPSTDayStart(new Date(item.order.purchaseDate))
      const dateStr = toZonedTime(pstDayStart, AMAZON_TIMEZONE).toISOString().split('T')[0]
      const key = `${dateStr}|${item.masterSku}`

      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          date: pstDayStart,
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

// ============================================================
// Amazon Ads Reports Sync
// ============================================================

const ADS_API_BASE = 'https://advertising-api.amazon.com'

/**
 * Aggregate ad spend data from adProductSpend into advertising_daily
 * This is needed because profit periods query advertising_daily table
 */
async function aggregateAdsToDaily(startDateStr: string, endDateStr: string) {
  try {
    console.log(`    Aggregating ads data to advertising_daily for ${startDateStr} to ${endDateStr}...`)

    const { query } = await import('@/lib/db')

    // Query aggregated data from adProductSpend for the date range
    // For single-day reports (start_date = end_date), we need to match exactly
    // For multi-day reports, we aggregate by the date that overlaps
    const aggregated = await query<{
      date: string
      campaign_type: string
      total_impressions: string
      total_clicks: string
      total_spend: string
      total_sales14d: string
      total_orders14d: string
      total_units14d: string
    }>(`
      SELECT
        DATE(aps.start_date)::text as date,
        'SP' as campaign_type,
        SUM(aps.impressions)::text as total_impressions,
        SUM(aps.clicks)::text as total_clicks,
        SUM(aps.spend)::text as total_spend,
        SUM(aps.sales)::text as total_sales14d,
        SUM(aps.orders)::text as total_orders14d,
        SUM(aps.units)::text as total_units14d
      FROM ad_product_spend aps
      WHERE aps.start_date >= $1::date
        AND aps.start_date <= $2::date
      GROUP BY DATE(aps.start_date)
    `, [startDateStr, endDateStr])

    let dailyRecordsUpdated = 0
    for (const row of aggregated) {
      const spend = parseFloat(row.total_spend || '0')
      const sales14d = parseFloat(row.total_sales14d || '0')
      const impressions = parseInt(row.total_impressions || '0', 10)
      const clicks = parseInt(row.total_clicks || '0', 10)
      const orders14d = parseInt(row.total_orders14d || '0', 10)
      const units14d = parseInt(row.total_units14d || '0', 10)

      // Calculate derived metrics
      const acos = sales14d > 0 ? (spend / sales14d) * 100 : null
      const roas = spend > 0 ? sales14d / spend : null
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : null
      const cpc = clicks > 0 ? spend / clicks : null

      await prisma.advertisingDaily.upsert({
        where: {
          date_campaignType: {
            date: new Date(row.date),
            campaignType: row.campaign_type,
          },
        },
        update: {
          impressions: impressions,
          clicks: clicks,
          spend: spend,
          sales14d: sales14d > 0 ? sales14d : null,
          orders14d: orders14d > 0 ? orders14d : null,
          unitsSold14d: units14d > 0 ? units14d : null,
          acos: acos,
          roas: roas,
          ctr: ctr,
          cpc: cpc,
          updatedAt: new Date(),
        },
        create: {
          date: new Date(row.date),
          campaignType: row.campaign_type,
          impressions: impressions,
          clicks: clicks,
          spend: spend,
          sales14d: sales14d > 0 ? sales14d : null,
          orders14d: orders14d > 0 ? orders14d : null,
          unitsSold14d: units14d > 0 ? units14d : null,
          acos: acos,
          roas: roas,
          ctr: ctr,
          cpc: cpc,
        },
      })
      dailyRecordsUpdated++
    }

    console.log(`    Updated ${dailyRecordsUpdated} advertising_daily records`)
  } catch (error: any) {
    console.log(`    ⚠️ Failed to aggregate to advertising_daily: ${error.message}`)
    // Don't throw - this is a secondary operation
  }
}

interface PendingAdsReport {
  reportId: string
  profileId: string
  createdAt: Date
  reportType: string
}

/**
 * Amazon Ads Reports sync processor
 * 
 * 1. Check any pending reports and download completed ones
 * 2. Request new reports for recent data
 * 3. Store campaign data in database
 */
async function processAdsReportsSync(job: any) {
  const startTime = Date.now()
  console.log(`\n[ads-reports-sync] Starting job ${job.id}...`)

  try {
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.accessToken) {
      console.log('  ⚠️ Amazon Ads not connected, skipping')
      return { skipped: true, reason: 'Not connected' }
    }

    const profileId = credentials.profileId
    let reportsChecked = 0
    let reportsCompleted = 0
    let campaignsUpdated = 0
    let newReportRequested = false

    // Step 1: Check pending reports from database
    console.log('  Checking pending reports...')
    const pendingReports = await prisma.adsPendingReport.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    })

    for (const report of pendingReports) {
      reportsChecked++
      try {
        // Get a fresh access token (auto-refreshes if expired)
        let accessToken: string
        try {
          accessToken = await getValidAccessToken()
        } catch (tokenError: any) {
          console.log(`    ⚠️ Failed to get valid token: ${tokenError.message}`)
          continue
        }

        const statusResponse = await fetch(`${ADS_API_BASE}/reporting/reports/${report.reportId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
            'Amazon-Advertising-API-Scope': profileId,
            'Accept': 'application/json',
          },
        })

        if (!statusResponse.ok) {
          console.log(`    Report ${report.reportId.substring(0, 8)}... check failed: ${statusResponse.status}`)
          continue
        }

        const status = await statusResponse.json()

        if (status.status === 'COMPLETED' && status.url) {
          console.log(`    Report ${report.reportId.substring(0, 8)}... COMPLETED - downloading`)

          // Download and process the report
          const downloadResponse = await fetch(status.url)
          const gzipBuffer = await downloadResponse.arrayBuffer()
          const jsonBuffer = gunzipSync(Buffer.from(gzipBuffer))
          const data = JSON.parse(jsonBuffer.toString('utf-8'))

          // Parse date range from report - handle both "date" and "date to date" formats
          let startDateStr: string
          let endDateStr: string
          if (report.dateRange?.includes(' to ')) {
            const dateRangeParts = report.dateRange.split(' to ')
            startDateStr = dateRangeParts[0]
            endDateStr = dateRangeParts[1]
          } else {
            // Single date format (legacy) - use same date for start and end
            startDateStr = report.dateRange || new Date().toISOString().split('T')[0]
            endDateStr = startDateStr
          }
          console.log(`    Date range: ${startDateStr} to ${endDateStr}`)

          if (Array.isArray(data)) {
            // Handle based on report type
            if (report.reportType === 'SP_PRODUCTS') {
              // Product-level report - store in AdProductSpend
              let productsUpdated = 0
              for (const item of data) {
                const asin = item.advertisedAsin
                if (!asin) continue

                // Handle both 'spend' and 'cost' field names (Amazon API may use either)
                const spend = parseFloat(item.spend) || parseFloat(item.cost) || 0
                const sales = parseFloat(item.sales14d) || 0

                await prisma.adProductSpend.upsert({
                  where: {
                    asin_startDate_endDate: {
                      asin,
                      startDate: new Date(startDateStr),
                      endDate: new Date(endDateStr),
                    },
                  },
                  update: {
                    sku: item.advertisedSku || null,
                    impressions: item.impressions || 0,
                    clicks: item.clicks || 0,
                    spend,
                    sales,
                    orders: item.purchases14d || 0,
                    units: item.unitsSoldClicks14d || 0,
                    acos: sales > 0 ? (spend / sales) * 100 : null,
                    updatedAt: new Date(),
                  },
                  create: {
                    asin,
                    sku: item.advertisedSku || null,
                    startDate: new Date(startDateStr),
                    endDate: new Date(endDateStr),
                    impressions: item.impressions || 0,
                    clicks: item.clicks || 0,
                    spend,
                    sales,
                    orders: item.purchases14d || 0,
                    units: item.unitsSoldClicks14d || 0,
                    acos: sales > 0 ? (spend / sales) * 100 : null,
                  },
                })
                productsUpdated++
              }
              console.log(`    Processed ${productsUpdated} product records`)
            } else if (report.reportType === 'SP_CAMPAIGNS' || report.reportType === 'SB_CAMPAIGNS' || report.reportType === 'SD_CAMPAIGNS') {
              // Campaign-level report - store in AdCampaign AND aggregate totals to advertising_daily
              // This captures the FULL ad spend (not just product-attributed spend)
              
              // Determine campaign type from report type
              const campaignType = report.reportType === 'SB_CAMPAIGNS' ? 'SB' : 
                                   report.reportType === 'SD_CAMPAIGNS' ? 'SD' : 'SP'
              
              let totalSpend = 0
              let totalImpressions = 0
              let totalClicks = 0
              let totalSales14d = 0
              let totalOrders14d = 0
              let totalUnits14d = 0

              for (const campaign of data) {
                const campaignId = campaign.campaignId?.toString()
                if (!campaignId) continue

                const spend = parseFloat(campaign.cost) || 0
                totalSpend += spend
                totalImpressions += campaign.impressions || 0
                totalClicks += campaign.clicks || 0
                
                // Handle different column names: SP uses "14d" suffix, SB/SD don't
                const salesValue = parseFloat(campaign.sales14d || campaign.sales) || 0
                const ordersValue = campaign.purchases14d || campaign.purchases || 0
                const unitsValue = campaign.unitsSoldClicks14d || campaign.unitsSoldClicks || 0
                
                totalSales14d += salesValue
                totalOrders14d += ordersValue
                totalUnits14d += unitsValue

                await prisma.adCampaign.upsert({
                  where: { campaignId },
                  update: {
                    campaignName: campaign.campaignName || 'Unknown',
                    campaignStatus: campaign.campaignStatus || 'UNKNOWN',
                    campaignType,
                    budgetAmount: parseFloat(campaign.campaignBudgetAmount) || 0,
                    budgetType: campaign.campaignBudgetType || 'DAILY',
                    impressions: campaign.impressions || 0,
                    clicks: campaign.clicks || 0,
                    spend,
                    sales14d: salesValue,
                    orders14d: ordersValue,
                    units14d: unitsValue,
                    lastSyncedAt: new Date(),
                    updatedAt: new Date(),
                  },
                  create: {
                    campaignId,
                    campaignName: campaign.campaignName || 'Unknown',
                    campaignStatus: campaign.campaignStatus || 'UNKNOWN',
                    campaignType,
                    budgetAmount: parseFloat(campaign.campaignBudgetAmount) || 0,
                    budgetType: campaign.campaignBudgetType || 'DAILY',
                    impressions: campaign.impressions || 0,
                    clicks: campaign.clicks || 0,
                    spend,
                    sales14d: salesValue,
                    orders14d: ordersValue,
                    units14d: unitsValue,
                    lastSyncedAt: new Date(),
                  },
                })
                campaignsUpdated++
              }

              // Store TOTAL campaign spend in advertising_daily (this is the accurate total)
              // This uses campaign totals which include ALL spend, not just product-attributed
              if (totalSpend > 0) {
                const acos = totalSales14d > 0 ? (totalSpend / totalSales14d) * 100 : null
                const roas = totalSpend > 0 ? totalSales14d / totalSpend : null
                const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null
                const cpc = totalClicks > 0 ? totalSpend / totalClicks : null

                await prisma.advertisingDaily.upsert({
                  where: {
                    date_campaignType: {
                      date: new Date(startDateStr),
                      campaignType,
                    },
                  },
                  update: {
                    impressions: totalImpressions,
                    clicks: totalClicks,
                    spend: totalSpend,
                    sales14d: totalSales14d > 0 ? totalSales14d : null,
                    orders14d: totalOrders14d > 0 ? totalOrders14d : null,
                    unitsSold14d: totalUnits14d > 0 ? totalUnits14d : null,
                    acos,
                    roas,
                    ctr,
                    cpc,
                    updatedAt: new Date(),
                  },
                  create: {
                    date: new Date(startDateStr),
                    campaignType,
                    impressions: totalImpressions,
                    clicks: totalClicks,
                    spend: totalSpend,
                    sales14d: totalSales14d > 0 ? totalSales14d : null,
                    orders14d: totalOrders14d > 0 ? totalOrders14d : null,
                    unitsSold14d: totalUnits14d > 0 ? totalUnits14d : null,
                    acos,
                    roas,
                    ctr,
                    cpc,
                  },
                })
                console.log(`    Updated advertising_daily for ${startDateStr} (${campaignType}): $${totalSpend.toFixed(2)} total spend`)
              }
            }
          }

          // NOTE: We no longer aggregate SP_PRODUCTS to advertising_daily here
          // because SP_CAMPAIGNS reports already write the TOTAL campaign spend
          // to advertising_daily (which includes non-product-attributed spend).
          // Product-level spend is stored in ad_product_spend for per-SKU profit calcs.

          // Mark report as completed
          await prisma.adsPendingReport.update({
            where: { id: report.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          })
          reportsCompleted++

        } else if (status.status === 'FAILED') {
          console.log(`    Report ${report.reportId.substring(0, 8)}... FAILED: ${status.failureReason}`)
          await prisma.adsPendingReport.update({
            where: { id: report.id },
            data: { status: 'FAILED', failureReason: status.failureReason },
          })
        } else {
          // Still pending - check if it's been too long (> 3 hours)
          const ageMs = Date.now() - new Date(report.createdAt).getTime()
          if (ageMs > 3 * 60 * 60 * 1000) {
            console.log(`    Report ${report.reportId.substring(0, 8)}... expired (${Math.round(ageMs / 60000)} min old)`)
            await prisma.adsPendingReport.update({
              where: { id: report.id },
              data: { status: 'EXPIRED' },
            })
          }
        }
      } catch (e: any) {
        console.log(`    Report ${report.reportId.substring(0, 8)}... error: ${e.message}`)
      }

      // Small delay between checks
      await sleep(500)
    }

    // Step 2: Check for missing dates and request reports
    // Look at the last 7 days and find any dates without data in advertising_daily
    const DAYS_TO_CHECK = 7
    const missingDates: string[] = []

    console.log(`  Checking for missing ads data in the last ${DAYS_TO_CHECK} days...`)

    for (let i = 0; i < DAYS_TO_CHECK; i++) {
      const { startDate: dayStart } = getPSTDateRange(i)
      const dateStr = toZonedTime(dayStart, AMAZON_TIMEZONE).toISOString().split('T')[0]

      // Check if we have data for this date in advertising_daily
      const existingData = await prisma.advertisingDaily.findFirst({
        where: {
          date: new Date(dateStr),
          campaignType: 'SP',
        },
      })

      // Also check if there's already a pending report for this date
      const pendingReport = await prisma.adsPendingReport.findFirst({
        where: {
          status: 'PENDING',
          dateRange: { contains: dateStr },
          createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // Less than 2 hours old
        },
      })

      if (!existingData && !pendingReport) {
        missingDates.push(dateStr)
      }
    }

    if (missingDates.length > 0) {
      console.log(`  Found ${missingDates.length} dates with missing ads data: ${missingDates.join(', ')}`)
    } else {
      console.log(`  All recent dates have ads data`)
    }

    // Also check for active pending reports
    const activePending = await prisma.adsPendingReport.count({
      where: {
        status: 'PENDING',
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } // Less than 1 hour old
      },
    })

    // Request reports for missing dates (limit to 2 at a time to avoid overwhelming the API)
    const datesToRequest = missingDates.slice(0, 2)

    // Track which dates actually had reports requested
    const actuallyRequested: string[] = []

    if (datesToRequest.length > 0 && activePending < 4) {
      console.log(`  Requesting reports for missing dates: ${datesToRequest.join(', ')}`)

      // Get a fresh (possibly refreshed) access token
      let freshAccessToken: string | null = null
      try {
        freshAccessToken = await getValidAccessToken()
      } catch (e: any) {
        console.log(`  ⚠️ Failed to get valid access token: ${e.message}`)
      }

      if (freshAccessToken) {
        const headers = {
          'Authorization': `Bearer ${freshAccessToken}`,
          'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
          'Amazon-Advertising-API-Scope': profileId,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.createasyncreport.v3+json',
        }

        for (const dateStr of datesToRequest) {
          // Request campaign report
          const campaignReportConfig = {
            name: `Worker_SP_Campaign_${dateStr}_${Date.now()}`,
            startDate: dateStr,
            endDate: dateStr,
            configuration: {
              adProduct: 'SPONSORED_PRODUCTS',
              groupBy: ['campaign'],
              columns: [
                'campaignName',
                'campaignId',
                'campaignStatus',
                'campaignBudgetAmount',
                'campaignBudgetType',
                'impressions',
                'clicks',
                'cost',
                'purchases14d',
                'sales14d',
                'unitsSoldClicks14d',
              ],
              reportTypeId: 'spCampaigns',
              timeUnit: 'SUMMARY',
              format: 'GZIP_JSON',
            },
          }

          // Request product report (for profit calculation)
          const productReportConfig = {
            name: `Worker_SP_Product_${dateStr}_${Date.now()}`,
            startDate: dateStr,
            endDate: dateStr,
            configuration: {
              adProduct: 'SPONSORED_PRODUCTS',
              groupBy: ['advertiser'],
              columns: [
                'advertisedAsin',
                'advertisedSku',
                'impressions',
                'clicks',
                'spend',
                'sales14d',
                'purchases14d',
                'unitsSoldClicks14d',
              ],
              reportTypeId: 'spAdvertisedProduct',
              timeUnit: 'SUMMARY',
              format: 'GZIP_JSON',
            },
          }

          // Request campaign report
          try {
            const campaignResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
              method: 'POST',
              headers,
              body: JSON.stringify(campaignReportConfig),
            })

            const campaignResponseText = await campaignResponse.text()
            let campaignReportId: string | null = null

            if (campaignResponse.status === 425) {
              const match = campaignResponseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
              if (match) campaignReportId = match[1]
            } else if (campaignResponse.ok) {
              const data = JSON.parse(campaignResponseText)
              campaignReportId = data.reportId
            } else {
              console.log(`    Campaign report request for ${dateStr} failed: ${campaignResponse.status} - ${campaignResponseText.substring(0, 200)}`)
            }

            if (campaignReportId) {
              const existing = await prisma.adsPendingReport.findUnique({
                where: { reportId: campaignReportId },
              })
              if (!existing) {
                await prisma.adsPendingReport.create({
                  data: {
                    reportId: campaignReportId,
                    profileId,
                    reportType: 'SP_CAMPAIGNS',
                    status: 'PENDING',
                    dateRange: `${dateStr} to ${dateStr}`,
                  },
                })
                newReportRequested = true
                if (!actuallyRequested.includes(dateStr)) {
                  actuallyRequested.push(dateStr)
                }
                console.log(`    Campaign report for ${dateStr} requested: ${campaignReportId.substring(0, 8)}...`)
              }
            }
          } catch (e: any) {
            console.log(`    Failed to request campaign report for ${dateStr}: ${e.message}`)
          }

          // Request product report
          try {
            const productResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
              method: 'POST',
              headers,
              body: JSON.stringify(productReportConfig),
            })

            const productResponseText = await productResponse.text()
            let productReportId: string | null = null

            if (productResponse.status === 425) {
              const match = productResponseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
              if (match) productReportId = match[1]
            } else if (productResponse.ok) {
              const data = JSON.parse(productResponseText)
              productReportId = data.reportId
            } else {
              console.log(`    Product report request for ${dateStr} failed: ${productResponse.status} - ${productResponseText.substring(0, 200)}`)
            }

            if (productReportId) {
              const existing = await prisma.adsPendingReport.findUnique({
                where: { reportId: productReportId },
              })
              if (!existing) {
                await prisma.adsPendingReport.create({
                  data: {
                    reportId: productReportId,
                    profileId,
                    reportType: 'SP_PRODUCTS',
                    status: 'PENDING',
                    dateRange: `${dateStr} to ${dateStr}`,
                  },
                })
                newReportRequested = true
                if (!actuallyRequested.includes(dateStr)) {
                  actuallyRequested.push(dateStr)
                }
                console.log(`    Product report for ${dateStr} requested: ${productReportId.substring(0, 8)}...`)
              }
            }
          } catch (e: any) {
            console.log(`    Failed to request product report for ${dateStr}: ${e.message}`)
          }

          // ===== SPONSORED BRANDS (SB) =====
          // Note: SB uses different column names than SP (no "14d" suffix)
          const sbCampaignReportConfig = {
            name: `Worker_SB_Campaign_${dateStr}_${Date.now()}`,
            startDate: dateStr,
            endDate: dateStr,
            configuration: {
              adProduct: 'SPONSORED_BRANDS',
              groupBy: ['campaign'],
              columns: [
                'campaignName',
                'campaignId',
                'campaignStatus',
                'impressions',
                'clicks',
                'cost',
                'purchases',        // SB uses 'purchases' not 'purchases14d'
                'sales',            // SB uses 'sales' not 'sales14d'
                'unitsSoldClicks',  // SB uses 'unitsSoldClicks' not 'unitsSoldClicks14d'
              ],
              reportTypeId: 'sbCampaigns',
              timeUnit: 'SUMMARY',
              format: 'GZIP_JSON',
            },
          }

          // Request SB campaign report
          try {
            const sbResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
              method: 'POST',
              headers,
              body: JSON.stringify(sbCampaignReportConfig),
            })

            const sbResponseText = await sbResponse.text()
            let sbReportId: string | null = null

            if (sbResponse.status === 425) {
              const match = sbResponseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
              if (match) sbReportId = match[1]
            } else if (sbResponse.ok) {
              const data = JSON.parse(sbResponseText)
              sbReportId = data.reportId
            } else if (sbResponse.status !== 400) {
              // 400 usually means no SB campaigns exist, so don't log as error
              console.log(`    SB campaign report for ${dateStr} failed: ${sbResponse.status}`)
            }

            if (sbReportId) {
              const existing = await prisma.adsPendingReport.findUnique({
                where: { reportId: sbReportId },
              })
              if (!existing) {
                await prisma.adsPendingReport.create({
                  data: {
                    reportId: sbReportId,
                    profileId,
                    reportType: 'SB_CAMPAIGNS',
                    status: 'PENDING',
                    dateRange: `${dateStr} to ${dateStr}`,
                  },
                })
                newReportRequested = true
                console.log(`    SB campaign report for ${dateStr} requested: ${sbReportId.substring(0, 8)}...`)
              }
            }
          } catch (e: any) {
            console.log(`    Failed to request SB report for ${dateStr}: ${e.message}`)
          }

          // ===== SPONSORED DISPLAY (SD) =====
          // Note: SD uses different column names than SP (no "14d" suffix, no budgetType)
          const sdCampaignReportConfig = {
            name: `Worker_SD_Campaign_${dateStr}_${Date.now()}`,
            startDate: dateStr,
            endDate: dateStr,
            configuration: {
              adProduct: 'SPONSORED_DISPLAY',
              groupBy: ['campaign'],
              columns: [
                'campaignName',
                'campaignId',
                'campaignStatus',
                'campaignBudgetAmount',
                'impressions',
                'clicks',
                'cost',
                'purchases',        // SD uses 'purchases' not 'purchases14d'
                'sales',            // SD uses 'sales' not 'sales14d'
                'unitsSoldClicks',  // SD uses 'unitsSoldClicks' not 'unitsSoldClicks14d'
              ],
              reportTypeId: 'sdCampaigns',
              timeUnit: 'SUMMARY',
              format: 'GZIP_JSON',
            },
          }

          // Request SD campaign report
          try {
            const sdResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
              method: 'POST',
              headers,
              body: JSON.stringify(sdCampaignReportConfig),
            })

            const sdResponseText = await sdResponse.text()
            let sdReportId: string | null = null

            if (sdResponse.status === 425) {
              const match = sdResponseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
              if (match) sdReportId = match[1]
            } else if (sdResponse.ok) {
              const data = JSON.parse(sdResponseText)
              sdReportId = data.reportId
            } else if (sdResponse.status !== 400) {
              // 400 usually means no SD campaigns exist, so don't log as error
              console.log(`    SD campaign report for ${dateStr} failed: ${sdResponse.status}`)
            }

            if (sdReportId) {
              const existing = await prisma.adsPendingReport.findUnique({
                where: { reportId: sdReportId },
              })
              if (!existing) {
                await prisma.adsPendingReport.create({
                  data: {
                    reportId: sdReportId,
                    profileId,
                    reportType: 'SD_CAMPAIGNS',
                    status: 'PENDING',
                    dateRange: `${dateStr} to ${dateStr}`,
                  },
                })
                newReportRequested = true
                console.log(`    SD campaign report for ${dateStr} requested: ${sdReportId.substring(0, 8)}...`)
              }
            }
          } catch (e: any) {
            console.log(`    Failed to request SD report for ${dateStr}: ${e.message}`)
          }

          // Small delay between date requests
          await sleep(500)
        }
      }
    } else if (activePending >= 4) {
      console.log(`  ${activePending} active pending report(s), waiting for them to complete before requesting more`)
    } else {
      console.log(`  No missing dates to request reports for`)
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[ads-reports-sync] Completed in ${duration}s - ${reportsChecked} checked, ${reportsCompleted} completed, ${campaignsUpdated} campaigns updated, ${missingDates.length} missing dates found`)

    await logSyncResult('ads-reports', 'success', {
      reportsChecked,
      reportsCompleted,
      campaignsUpdated,
      newReportRequested,
      missingDatesFound: missingDates.length,
      missingDates: missingDates.slice(0, 5), // Log first 5 for reference
      datesRequested: actuallyRequested, // Only show dates that actually had reports created
    }, null)
    return { reportsChecked, reportsCompleted, campaignsUpdated, newReportRequested, missingDatesFound: missingDates.length }
  } catch (error: any) {
    console.error(`[ads-reports-sync] Failed:`, error.message)
    await logSyncResult('ads-reports', 'failed', null, error.message)
    throw error
  }
}

/**
 * Alerts generation processor
 */
async function processAlertsGeneration(job: any) {
  const startTime = Date.now()
  console.log(`\n[alerts-generation] Starting job ${job.id}...`)

  try {
    // Call the alerts generation API internally
    const { prisma: db } = await import('@/lib/prisma')
    const { query } = await import('@/lib/db')

    // Clear old unresolved alerts
    await db.inventoryAlert.deleteMany({
      where: { isResolved: false }
    })

    const alerts: any[] = []

    // 1. STOCKOUT RISK - Products with low days of supply
    const stockoutRiskProducts = await query<{
      sku: string
      title: string
      total_inventory: number
      avg_daily_velocity: number
      days_of_supply: number
      recommended_qty: number
    }>(`
      SELECT 
        p.sku,
        p.title,
        COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0) as total_inventory,
        COALESCE(f.avg_daily_velocity, 0) as avg_daily_velocity,
        CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) / f.avg_daily_velocity
          ELSE 999
        END as days_of_supply,
        CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN CEIL(f.avg_daily_velocity * 45) - (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0))
          ELSE 100
        END as recommended_qty
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      LEFT JOIN (
        SELECT master_sku, avg_daily_velocity
        FROM forecasts 
        WHERE channel = 'Amazon'
        AND (master_sku, created_at) IN (
          SELECT master_sku, MAX(created_at) FROM forecasts GROUP BY master_sku
        )
      ) f ON p.sku = f.master_sku
      WHERE p.is_active = true
        AND COALESCE(f.avg_daily_velocity, 0) > 0.1
        AND CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) / f.avg_daily_velocity
          ELSE 999
        END < 21
      ORDER BY days_of_supply ASC
      LIMIT 50
    `, [])

    for (const product of stockoutRiskProducts) {
      const daysOfSupply = Math.round(Number(product.days_of_supply))
      const severity = daysOfSupply < 7 ? 'critical' : daysOfSupply < 14 ? 'high' : 'medium'
      
      alerts.push({
        masterSku: product.sku,
        alertType: 'stockout_risk',
        severity,
        title: `Low Stock: ${product.sku}`,
        message: `${product.title || product.sku} has only ${daysOfSupply} days of supply remaining.`,
        recommendedAction: `Order ${Math.max(0, Math.round(Number(product.recommended_qty)))} units`,
        recommendedQuantity: Math.max(0, Math.round(Number(product.recommended_qty))),
      })
    }

    // 2. FBA REPLENISHMENT
    const fbaReplenishmentProducts = await query<{
      sku: string
      title: string
      warehouse_qty: number
      fba_qty: number
      fba_days_of_supply: number
    }>(`
      SELECT 
        p.sku,
        p.title,
        COALESCE(il.warehouse_available, 0) as warehouse_qty,
        COALESCE(il.fba_available, 0) as fba_qty,
        CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN COALESCE(il.fba_available, 0) / f.avg_daily_velocity
          ELSE 999
        END as fba_days_of_supply
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      LEFT JOIN (
        SELECT master_sku, avg_daily_velocity
        FROM forecasts 
        WHERE channel = 'Amazon'
        AND (master_sku, created_at) IN (
          SELECT master_sku, MAX(created_at) FROM forecasts GROUP BY master_sku
        )
      ) f ON p.sku = f.master_sku
      WHERE p.is_active = true
        AND COALESCE(il.warehouse_available, 0) > 10
        AND COALESCE(f.avg_daily_velocity, 0) > 0.1
        AND CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN COALESCE(il.fba_available, 0) / f.avg_daily_velocity
          ELSE 999
        END < 14
      ORDER BY fba_days_of_supply ASC
      LIMIT 30
    `, [])

    for (const product of fbaReplenishmentProducts) {
      const daysOfSupply = Math.round(Number(product.fba_days_of_supply))
      const severity = daysOfSupply < 5 ? 'critical' : daysOfSupply < 10 ? 'high' : 'medium'
      
      alerts.push({
        masterSku: product.sku,
        alertType: 'fba_replenishment',
        severity,
        title: `Ship to FBA: ${product.sku}`,
        message: `${product.title || product.sku} has ${daysOfSupply} days FBA supply. ${product.warehouse_qty} units in warehouse.`,
        recommendedQuantity: Math.min(product.warehouse_qty, 100),
      })
    }

    // 3. OUT OF STOCK
    const outOfStockProducts = await query<{ sku: string; title: string }>(`
      SELECT DISTINCT p.sku, p.title
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      WHERE p.is_active = true
        AND COALESCE(il.fba_available, 0) = 0
        AND EXISTS (
          SELECT 1 FROM order_items oi 
          WHERE oi.master_sku = p.sku 
          AND oi.created_at > NOW() - INTERVAL '30 days'
        )
      LIMIT 20
    `, [])

    for (const product of outOfStockProducts) {
      alerts.push({
        masterSku: product.sku,
        alertType: 'out_of_stock',
        severity: 'critical',
        title: `Out of Stock: ${product.sku}`,
        message: `${product.title || product.sku} is out of stock at FBA.`,
      })
    }

    // Insert all alerts
    if (alerts.length > 0) {
      await db.inventoryAlert.createMany({ data: alerts })
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[alerts-generation] Completed in ${duration}s - ${alerts.length} alerts generated`)
    
    await logSyncResult('alerts', 'success', { alertsGenerated: alerts.length }, null)
    return { alertsGenerated: alerts.length }
  } catch (error: any) {
    console.error(`[alerts-generation] Failed:`, error.message)
    await logSyncResult('alerts', 'failed', null, error.message)
    throw error
  }
}

/**
 * FBA Shipments sync processor
 * Pulls FBA inbound shipments from Amazon for inventory reconciliation
 */
async function processFbaShipmentsSync(job: any) {
  const startTime = Date.now()
  console.log(`\n[fba-shipments-sync] Starting job ${job.id}...`)

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) throw new Error('Amazon credentials not configured')

    const client = await createSpApiClient()
    if (!client) throw new Error('Failed to create SP-API client')

    const daysBack = job.data.daysBack || 365 // Default to 1 year max
    const { startDate } = getPSTDateRange(daysBack)

    let shipmentsCreated = 0
    let shipmentsUpdated = 0
    let itemsProcessed = 0

    // Use the Fulfillment Inbound API to get shipments
    // Try both the v2024 and legacy endpoints
    console.log(`  Fetching FBA shipments from last ${daysBack} days...`)

    // First try using the Reports API to get shipment data (more reliable)
    // GET_FBA_FULFILLMENT_INBOUND_NONCOMPLIANCE_DATA or similar

    // For now, use the legacy Fulfillment Inbound API which is more widely available
    let nextToken: string | null = null
    const statuses = ['WORKING', 'SHIPPED', 'RECEIVING', 'CHECKED_IN', 'IN_TRANSIT', 'DELIVERED'] // Removed CLOSED - we filter those out in the UI

    for (const status of statuses) {
      nextToken = null
      let pageCount = 0

      do {
        try {
          const response: any = await callApiWithTimeout(client, {
            operation: 'getShipments',
            endpoint: 'fulfillmentInbound',
            query: {
              MarketplaceId: credentials.marketplaceId,
              ShipmentStatusList: [status],
              LastUpdatedAfter: startDate.toISOString(),
              QueryType: 'SHIPMENT',
              ...(nextToken ? { NextToken: nextToken } : {}),
            },
          }, 60000)

          const shipments = response?.payload?.ShipmentData || response?.ShipmentData || []
          nextToken = response?.payload?.NextToken || response?.NextToken || null
          pageCount++

          console.log(`    ${status}: Page ${pageCount}, ${shipments.length} shipments`)

          for (const shipment of shipments) {
            const shipmentId = shipment.ShipmentId
            if (!shipmentId) continue

            // Get shipment items
            let items: any[] = []
            try {
              const itemsResponse: any = await callApiWithTimeout(client, {
                operation: 'getShipmentItems',
                endpoint: 'fulfillmentInbound',
                path: {
                  shipmentId: shipmentId,
                },
                query: {
                  MarketplaceId: credentials.marketplaceId,
                },
              }, 30000)
              items = itemsResponse?.payload?.ItemData || itemsResponse?.ItemData || []
            } catch (itemErr: any) {
              // If ShipmentId in path doesn't work, try with date range as fallback
              if (itemErr.message?.includes('ShipmentId') || itemErr.message?.includes('LastUpdatedAfter')) {
                try {
                  // Try with date range instead (last 90 days)
                  const endDate = new Date()
                  const startDate = new Date()
                  startDate.setDate(startDate.getDate() - 90)
                  
                  const itemsResponse: any = await callApiWithTimeout(client, {
                    operation: 'getShipmentItems',
                    endpoint: 'fulfillmentInbound',
                    query: {
                      MarketplaceId: credentials.marketplaceId,
                      LastUpdatedAfter: startDate.toISOString(),
                      LastUpdatedBefore: endDate.toISOString(),
                    },
                  }, 30000)
                  
                  // Filter items to only this shipment
                  const allItems = itemsResponse?.payload?.ItemData || itemsResponse?.ItemData || []
                  items = allItems.filter((item: any) => item.ShipmentId === shipmentId)
                } catch (fallbackErr: any) {
                  console.log(`      ⚠️ Could not fetch items for ${shipmentId}: ${itemErr.message} (fallback also failed: ${fallbackErr.message})`)
                }
              } else {
                console.log(`      ⚠️ Could not fetch items for ${shipmentId}: ${itemErr.message}`)
              }
            }

            // Calculate totals
            let totalUnits = 0
            let unitsReceived = 0
            for (const item of items) {
              totalUnits += item.QuantityShipped || 0
              unitsReceived += item.QuantityReceived || 0
            }

            // Map Amazon status to our status
            const statusMapping: Record<string, string> = {
              'WORKING': 'working',
              'READY_TO_SHIP': 'ready',
              'SHIPPED': 'shipped',
              'RECEIVING': 'receiving',
              'CHECKED_IN': 'checked_in',
              'CLOSED': 'closed',
              'CANCELLED': 'cancelled',
              'DELETED': 'cancelled',
              'IN_TRANSIT': 'in_transit',
              'DELIVERED': 'delivered',
            }

            const mappedStatus = statusMapping[shipment.ShipmentStatus] || shipment.ShipmentStatus?.toLowerCase() || 'unknown'

            // Parse created date from shipment - Amazon API returns different date fields
            let createdDate = new Date()
            // Try various date fields that Amazon might return
            if (shipment.ShipmentStatus === 'CLOSED' || shipment.ShipmentStatus === 'CANCELLED') {
              // Skip closed/cancelled shipments - they're filtered out in the UI
              continue
            }
            
            if (shipment.CreatedDate) {
              createdDate = new Date(shipment.CreatedDate)
            } else if (shipment.LastUpdatedDate) {
              createdDate = new Date(shipment.LastUpdatedDate)
            } else if (shipment.ShipDate) {
              createdDate = new Date(shipment.ShipDate)
            } else {
              // If no date available, use current date (shouldn't happen, but fallback)
              createdDate = new Date()
            }

            // Skip shipments older than 180 days during sync
            const daysSinceCreation = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
            if (daysSinceCreation > 180) {
              console.log(`    Skipping old shipment ${shipmentId} from ${createdDate.toISOString()} (${Math.round(daysSinceCreation)} days old)`)
              continue
            }

            // Upsert the shipment
            const existingShipment = await prisma.fbaShipment.findUnique({
              where: { shipmentId },
            })

            const shipmentData = {
              status: mappedStatus,
              destinationFc: shipment.DestinationFulfillmentCenterId || null,
              destinationName: shipment.ShipmentName || null,
              channel: `amazon_${credentials.marketplaceId === 'ATVPDKIKX0DER' ? 'us' : 'other'}`,
              createdDate, // Set the actual created date from Amazon
              totalUnits,
              unitsShipped: totalUnits,
              unitsReceived,
              unitsDiscrepancy: unitsReceived > 0 ? totalUnits - unitsReceived : 0,
            }

            if (existingShipment) {
              // Update existing - preserve reconciliation status if already reconciled
              await prisma.fbaShipment.update({
                where: { shipmentId },
                data: shipmentData,
              })
              shipmentsUpdated++
            } else {
              // Create new shipment
              await prisma.fbaShipment.create({
                data: {
                  shipmentId,
                  ...shipmentData,
                  reconciliationStatus: 'pending',
                },
              })
              shipmentsCreated++
            }

            // Upsert shipment items
            for (const item of items) {
              const sku = item.SellerSKU
              if (!sku) continue

              // Check if product exists
              const product = await prisma.product.findUnique({
                where: { sku },
              })

              if (!product) continue // Skip items without matching products

              const existingItem = await prisma.fbaShipmentItem.findFirst({
                where: {
                  shipment: { shipmentId },
                  masterSku: sku,
                },
              })

              const itemData = {
                masterSku: sku,
                channelSku: item.FulfillmentNetworkSKU || null,
                quantityShipped: item.QuantityShipped || 0,
                quantityReceived: item.QuantityReceived || 0,
                quantityDiscrepancy: (item.QuantityShipped || 0) - (item.QuantityReceived || 0),
              }

              if (existingItem) {
                await prisma.fbaShipmentItem.update({
                  where: { id: existingItem.id },
                  data: itemData,
                })
              } else {
                const fbaShipment = await prisma.fbaShipment.findUnique({
                  where: { shipmentId },
                })
                if (fbaShipment) {
                  await prisma.fbaShipmentItem.create({
                    data: {
                      shipmentId: fbaShipment.id,
                      ...itemData,
                    },
                  })
                }
              }
              itemsProcessed++
            }

            // Small delay between shipments
            await sleep(100)
          }

          if (nextToken) await sleep(500)
        } catch (pageError: any) {
          // Handle rate limiting
          if (pageError.message?.includes('429') || pageError.message?.includes('QuotaExceeded')) {
            console.log(`    ⚠️ Rate limited on ${status}, waiting 5s...`)
            await sleep(5000)
            continue
          }
          // Log but continue with other statuses
          console.log(`    ⚠️ Error fetching ${status}: ${pageError.message?.substring(0, 100)}`)
          break
        }
      } while (nextToken)
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[fba-shipments-sync] Completed in ${duration}s - ${shipmentsCreated} created, ${shipmentsUpdated} updated, ${itemsProcessed} items`)

    await logSyncResult('fba-shipments', 'success', {
      shipmentsCreated,
      shipmentsUpdated,
      itemsProcessed
    }, null)
    return { shipmentsCreated, shipmentsUpdated, itemsProcessed }
  } catch (error: any) {
    console.error(`[fba-shipments-sync] Failed:`, error.message)
    await logSyncResult('fba-shipments', 'failed', null, error.message)
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
ordersReportQueue.process('orders-report-sync', processOrdersReportSync)
financesQueue.process('finances-sync', processFinancesSync)
inventoryQueue.process('inventory-sync', processInventorySync)
productsQueue.process('products-sync', processProductsSync)
reportsQueue.process('daily-reports', processReportsSync)
aggregationQueue.process('daily-aggregation', processAggregation)
adsReportsQueue.process('ads-reports-sync', processAdsReportsSync)
alertsQueue.process('alerts-generation', processAlertsGeneration)
fbaShipmentsQueue.process('fba-shipments-sync', processFbaShipmentsSync)

  console.log('  ✓ Registered handler for orders-sync queue')
  console.log('  ✓ Registered handler for orders-report-sync queue')
  console.log('  ✓ Registered handler for finances-sync queue')
  console.log('  ✓ Registered handler for inventory-sync queue')
  console.log('  ✓ Registered handler for products-sync queue')
  console.log('  ✓ Registered handler for reports-sync queue')
  console.log('  ✓ Registered handler for aggregation queue')
  console.log('  ✓ Registered handler for ads-reports-sync queue')
  console.log('  ✓ Registered handler for alerts-generation queue')
  console.log('  ✓ Registered handler for fba-shipments-sync queue')

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

