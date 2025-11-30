import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

// ============================================
// SCHEDULED SYNC - For incremental updates
// ============================================

type SyncType = 'orders' | 'inventory' | 'returns' | 'fees' | 'all'

interface SyncConfig {
  type: SyncType
  daysBack: number
  description: string
}

const SYNC_CONFIGS: Record<string, SyncConfig> = {
  // Quick sync - last 24 hours of orders
  quick: {
    type: 'orders',
    daysBack: 1,
    description: 'Quick order sync (last 24 hours)',
  },
  // Hourly sync - orders and inventory
  hourly: {
    type: 'all',
    daysBack: 2,
    description: 'Hourly sync (orders + inventory, last 2 days)',
  },
  // Daily sync - everything for last 7 days
  daily: {
    type: 'all',
    daysBack: 7,
    description: 'Daily sync (all data, last 7 days)',
  },
  // Weekly sync - deeper refresh
  weekly: {
    type: 'all',
    daysBack: 30,
    description: 'Weekly sync (all data, last 30 days)',
  },
}

// Helper functions
function safeFloat(value: string | undefined | null): number {
  if (!value) return 0
  const cleaned = value.replace(/[,$]/g, '').trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

function safeInt(value: string | undefined | null): number {
  if (!value) return 0
  const parsed = parseInt(value.replace(/[,$]/g, '').trim(), 10)
  return isNaN(parsed) ? 0 : parsed
}

function getField(row: Record<string, string>, ...fieldNames: string[]): string {
  for (const name of fieldNames) {
    if (row[name] !== undefined && row[name] !== '') {
      return row[name]
    }
  }
  return ''
}

/**
 * Sync recent orders using the Orders API (faster for recent data)
 */
async function syncRecentOrders(client: any, marketplaceId: string, startDate: Date) {
  console.log(`\n📦 Syncing orders since ${startDate.toISOString().split('T')[0]}...`)
  
  let ordersProcessed = 0
  let itemsProcessed = 0
  let nextToken: string | null = null
  
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
  
  try {
    do {
      const queryParams: any = {
        MarketplaceIds: [marketplaceId],
        CreatedAfter: startDate.toISOString(),
        MaxResultsPerPage: 100,
      }
      
      if (nextToken) {
        queryParams.NextToken = nextToken
      }
      
      const response = await client.callAPI({
        operation: 'getOrders',
        endpoint: 'orders',
        query: queryParams,
      })
      
      const orders = response?.Orders || response?.payload?.Orders || []
      nextToken = response?.NextToken || response?.payload?.NextToken || null
      
      for (const order of orders) {
        const orderId = order.AmazonOrderId
        if (!orderId) continue
        
        const purchaseDate = order.PurchaseDate ? new Date(order.PurchaseDate) : new Date()
        const shippingAddress = order.ShippingAddress || {}
        
        await prisma.order.upsert({
          where: { id: orderId },
          update: {
            status: order.OrderStatus || 'Unknown',
            fulfillmentChannel: order.FulfillmentChannel || 'Unknown',
            salesChannel: order.SalesChannel || 'Amazon.com',
            orderTotal: parseFloat(order.OrderTotal?.Amount || '0'),
            currency: order.OrderTotal?.CurrencyCode || 'USD',
          },
          create: {
            id: orderId,
            purchaseDate,
            status: order.OrderStatus || 'Unknown',
            fulfillmentChannel: order.FulfillmentChannel || 'Unknown',
            salesChannel: order.SalesChannel || 'Amazon.com',
            shipCity: shippingAddress.City || '',
            shipState: shippingAddress.StateOrRegion || '',
            shipPostalCode: shippingAddress.PostalCode || '',
            shipCountry: shippingAddress.CountryCode || '',
            orderTotal: parseFloat(order.OrderTotal?.Amount || '0'),
            currency: order.OrderTotal?.CurrencyCode || 'USD',
          },
        })
        
        // Get order items
        await delay(200)
        
        try {
          const itemsResponse = await client.callAPI({
            operation: 'getOrderItems',
            endpoint: 'orders',
            path: { orderId },
          })
          
          const orderItems = itemsResponse?.OrderItems || itemsResponse?.payload?.OrderItems || []
          
          for (const item of orderItems) {
            const sku = item.SellerSKU
            if (!sku) continue
            
            // Check if product exists
            const product = await prisma.product.findUnique({ where: { sku } })
            if (!product) {
              // Create placeholder
              await prisma.product.create({
                data: {
                  sku,
                  title: item.Title || `[Auto] ${sku}`,
                  asin: item.ASIN || null,
                  status: 'inactive',
                  source: 'order-sync',
                },
              }).catch(() => {}) // Ignore if exists
            }
            
            const itemPrice = parseFloat(item.ItemPrice?.Amount || '0')
            const shippingPrice = parseFloat(item.ShippingPrice?.Amount || '0')
            const giftWrapPrice = parseFloat(item.GiftWrapPrice?.Amount || '0')
            const promoDiscount = Math.abs(parseFloat(item.PromotionDiscount?.Amount || '0'))
            const grossRevenue = itemPrice + shippingPrice + giftWrapPrice
            
            await prisma.orderItem.upsert({
              where: {
                orderId_masterSku: { orderId, masterSku: sku },
              },
              update: {
                quantity: item.QuantityOrdered || 1,
                itemPrice,
                shippingPrice,
                giftWrapPrice,
                promoDiscount,
                grossRevenue,
              },
              create: {
                orderId,
                masterSku: sku,
                asin: item.ASIN || null,
                quantity: item.QuantityOrdered || 1,
                itemPrice,
                itemTax: parseFloat(item.ItemTax?.Amount || '0'),
                shippingPrice,
                shippingTax: parseFloat(item.ShippingTax?.Amount || '0'),
                giftWrapPrice,
                giftWrapTax: parseFloat(item.GiftWrapTax?.Amount || '0'),
                promoDiscount,
                grossRevenue,
              },
            })
            itemsProcessed++
          }
        } catch (e) {
          // Continue on item fetch error
        }
        
        ordersProcessed++
      }
      
      if (nextToken) {
        await delay(1000)
      }
      
    } while (nextToken)
    
  } catch (error: any) {
    console.log(`  ⚠️ Order sync error: ${error.message}`)
  }
  
  console.log(`  ✓ Orders: ${ordersProcessed}, Items: ${itemsProcessed}`)
  return { orders: ordersProcessed, items: itemsProcessed }
}

/**
 * Sync FBA inventory levels
 */
async function syncInventory(client: any, marketplaceId: string) {
  console.log(`\n📦 Syncing FBA inventory...`)
  
  let updated = 0
  let nextToken: string | null = null
  
  try {
    do {
      const queryParams: any = {
        granularityType: 'Marketplace',
        granularityId: marketplaceId,
        marketplaceIds: [marketplaceId],
        details: true,
      }
      
      if (nextToken) {
        queryParams.nextToken = nextToken
      }
      
      const response = await client.callAPI({
        operation: 'getInventorySummaries',
        endpoint: 'fbaInventory',
        query: queryParams,
      })
      
      const payload = response?.payload || response
      const items = payload?.inventorySummaries || []
      nextToken = payload?.pagination?.nextToken || response?.pagination?.nextToken || null
      
      for (const item of items) {
        if (!item.sellerSku) continue
        
        const details = item.inventoryDetails || {}
        const fbaAvailable = details.fulfillableQuantity ?? item.fulfillableQuantity ?? 0
        const inboundWorking = details.inboundWorkingQuantity ?? item.inboundWorkingQuantity ?? 0
        const inboundShipped = details.inboundShippedQuantity ?? item.inboundShippedQuantity ?? 0
        const inboundReceiving = details.inboundReceivingQuantity ?? item.inboundReceivingQuantity ?? 0
        
        let fbaReserved = 0
        const reserved = details.reservedQuantity ?? item.reservedQuantity
        if (reserved) {
          fbaReserved = typeof reserved === 'number' ? reserved : (reserved.totalReservedQuantity || 0)
        }
        
        let fbaUnfulfillable = 0
        const unfulfillable = details.unfulfillableQuantity ?? item.unfulfillableQuantity
        if (unfulfillable) {
          fbaUnfulfillable = typeof unfulfillable === 'number' ? unfulfillable : (unfulfillable.totalUnfulfillableQuantity || 0)
        }
        
        // Update FNSKU on product
        if (item.fnSku) {
          await prisma.product.updateMany({
            where: { sku: item.sellerSku },
            data: { fnsku: item.fnSku },
          })
        }
        
        // Update inventory level
        await prisma.inventoryLevel.upsert({
          where: { masterSku: item.sellerSku },
          update: {
            fbaAvailable,
            fbaReserved,
            fbaUnfulfillable,
            fbaInboundWorking: inboundWorking,
            fbaInboundShipped: inboundShipped,
            fbaInboundReceiving: inboundReceiving,
          },
          create: {
            masterSku: item.sellerSku,
            fbaAvailable,
            fbaReserved,
            fbaUnfulfillable,
            fbaInboundWorking: inboundWorking,
            fbaInboundShipped: inboundShipped,
            fbaInboundReceiving: inboundReceiving,
            warehouseAvailable: 0,
          },
        })
        updated++
      }
      
    } while (nextToken)
    
  } catch (error: any) {
    console.log(`  ⚠️ Inventory sync error: ${error.message}`)
  }
  
  console.log(`  ✓ Inventory updated: ${updated} SKUs`)
  return { updated }
}

/**
 * Update sales velocity calculations
 */
async function updateSalesVelocity() {
  console.log(`\n📈 Updating sales velocity...`)
  
  const skus = await prisma.orderItem.findMany({
    select: { masterSku: true },
    distinct: ['masterSku'],
  })
  
  const now = new Date()
  const days7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const days90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  
  let updated = 0
  
  for (const { masterSku } of skus) {
    const [stats7, stats30, stats90] = await Promise.all([
      prisma.orderItem.aggregate({
        where: { masterSku, order: { purchaseDate: { gte: days7 } } },
        _sum: { quantity: true },
      }),
      prisma.orderItem.aggregate({
        where: { masterSku, order: { purchaseDate: { gte: days30 } } },
        _sum: { quantity: true },
      }),
      prisma.orderItem.aggregate({
        where: { masterSku, order: { purchaseDate: { gte: days90 } } },
        _sum: { quantity: true },
      }),
    ])
    
    await prisma.salesVelocity.upsert({
      where: { masterSku },
      update: {
        velocity7d: (stats7._sum.quantity || 0) / 7,
        velocity30d: (stats30._sum.quantity || 0) / 30,
        velocity90d: (stats90._sum.quantity || 0) / 90,
      },
      create: {
        masterSku,
        velocity7d: (stats7._sum.quantity || 0) / 7,
        velocity30d: (stats30._sum.quantity || 0) / 30,
        velocity90d: (stats90._sum.quantity || 0) / 90,
      },
    }).catch(() => {})
    
    updated++
  }
  
  console.log(`  ✓ Velocity updated: ${updated} SKUs`)
  return { updated }
}

/**
 * Sync financial events (actual fees per order)
 */
async function syncFinancialEvents(client: any, startDate: Date) {
  console.log(`\n💰 Syncing financial events since ${startDate.toISOString().split('T')[0]}...`)
  
  let eventsProcessed = 0
  let feesUpdated = 0
  let nextToken: string | null = null

  try {
    do {
      const queryParams: any = {
        PostedAfter: startDate.toISOString(),
        MaxResultsPerPage: 100,
      }
      if (nextToken) queryParams.NextToken = nextToken

      const response = await client.callAPI({
        operation: 'listFinancialEvents',
        endpoint: 'finances',
        query: queryParams,
      })

      const financialEvents = response?.payload?.FinancialEvents || response?.FinancialEvents || {}
      nextToken = response?.payload?.NextToken || response?.NextToken || null

      const shipmentEvents = financialEvents.ShipmentEventList || []

      for (const event of shipmentEvents) {
        const orderId = event.AmazonOrderId
        if (!orderId) continue

        const itemList = event.ShipmentItemList || []
        for (const item of itemList) {
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

      if (nextToken) await new Promise(r => setTimeout(r, 500))
    } while (nextToken)

  } catch (error: any) {
    console.log(`  ⚠️ Financial events error: ${error.message}`)
  }

  console.log(`  ✓ Financial events: ${eventsProcessed} processed, ${feesUpdated} fees updated`)
  return { eventsProcessed, feesUpdated }
}

/**
 * Update daily profit aggregations
 */
async function updateDailyProfits(startDate: Date) {
  console.log(`\n📊 Updating daily profits since ${startDate.toISOString().split('T')[0]}...`)
  
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: { purchaseDate: { gte: startDate } },
    },
    include: {
      order: { select: { purchaseDate: true } },
      product: { select: { cost: true } },
    },
  })
  
  const dailyMap = new Map<string, {
    date: Date
    masterSku: string
    unitsSold: number
    revenue: number
    amazonFees: number
    cogs: number
  }>()
  
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
    }).catch(() => {})
    
    updated++
  }
  
  console.log(`  ✓ Daily profits updated: ${updated} records`)
  return { updated }
}

// ============================================
// MAIN ENDPOINT
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { searchParams } = new URL(request.url)
    const schedule = searchParams.get('schedule') || 'hourly'
    
    const config = SYNC_CONFIGS[schedule]
    if (!config) {
      return NextResponse.json(
        { error: `Invalid schedule: ${schedule}. Use: quick, hourly, daily, weekly` },
        { status: 400 }
      )
    }
    
    console.log('\n' + '═'.repeat(50))
    console.log(`🔄 SCHEDULED SYNC: ${config.description}`)
    console.log('═'.repeat(50))
    
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json({ error: 'Amazon credentials not configured' }, { status: 400 })
    }
    
    const client = await createSpApiClient()
    if (!client) {
      throw new Error('Failed to create SP-API client')
    }
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - config.daysBack)
    
    const results: Record<string, any> = {}
    
    // Always sync orders for scheduled syncs
    results.orders = await syncRecentOrders(client, credentials.marketplaceId, startDate)
    
    // Sync inventory for hourly+ syncs
    if (['hourly', 'daily', 'weekly'].includes(schedule)) {
      results.inventory = await syncInventory(client, credentials.marketplaceId)
    }
    
    // Sync financial events for daily+ syncs (critical for fees)
    if (['daily', 'weekly'].includes(schedule)) {
      results.financialEvents = await syncFinancialEvents(client, startDate)
    }
    
    // Update calculations
    results.velocity = await updateSalesVelocity()
    results.dailyProfits = await updateDailyProfits(startDate)
    
    const elapsedSec = Math.round((Date.now() - startTime) / 1000)
    
    console.log('\n' + '═'.repeat(50))
    console.log(`✅ Scheduled sync complete in ${elapsedSec}s`)
    console.log('═'.repeat(50) + '\n')
    
    // Log the sync
    try {
      await prisma.syncLog.create({
        data: {
          syncType: `scheduled-${schedule}`,
          status: 'success',
          completedAt: new Date(),
          metadata: results,
        },
      })
    } catch (e) {}
    
    return NextResponse.json({
      success: true,
      schedule,
      elapsedSeconds: elapsedSec,
      results,
    })
    
  } catch (error: any) {
    console.error('Scheduled sync failed:', error.message)
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    schedules: Object.entries(SYNC_CONFIGS).map(([key, config]) => ({
      name: key,
      description: config.description,
      daysBack: config.daysBack,
    })),
    usage: {
      quick: 'POST /api/amazon/sync/scheduled?schedule=quick',
      hourly: 'POST /api/amazon/sync/scheduled?schedule=hourly',
      daily: 'POST /api/amazon/sync/scheduled?schedule=daily',
      weekly: 'POST /api/amazon/sync/scheduled?schedule=weekly',
    },
    recommendedCron: {
      orders: '*/15 * * * *    (every 15 minutes)',
      inventory: '0 */2 * * *   (every 2 hours)',
      daily: '0 6 * * *        (daily at 6am)',
      weekly: '0 5 * * 0       (weekly on Sunday 5am)',
    },
  })
}

