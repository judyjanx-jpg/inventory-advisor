import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

/**
 * Financial Events Sync
 * 
 * This syncs ACTUAL fees from Amazon's Financial Events API.
 * This is CRITICAL for accurate profit calculations.
 * 
 * Fee types we extract:
 * - FBAPerUnitFulfillmentFee (pick, pack, ship)
 * - Commission (referral fee, usually 15%)
 * - FBAWeightBasedFee
 * - VariableClosingFee
 * - And more...
 */

function safeFloat(value: any): number {
  if (!value) return 0
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/[,$]/g, '').trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { searchParams } = new URL(request.url)
    const daysBack = parseInt(searchParams.get('days') || '30')
    
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json({ error: 'Amazon credentials not configured' }, { status: 400 })
    }

    const client = await createSpApiClient()
    if (!client) {
      throw new Error('Failed to create SP-API client')
    }

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    console.log('\n' + '='.repeat(60))
    console.log('💰 FINANCIAL EVENTS SYNC')
    console.log(`   Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
    console.log('='.repeat(60))

    let nextToken: string | null = null
    let eventsProcessed = 0
    let feesUpdated = 0
    let ordersWithFees = new Set<string>()

    do {
      const queryParams: any = {
        PostedAfter: startDate.toISOString(),
        PostedBefore: endDate.toISOString(),
        MaxResultsPerPage: 100,
      }
      
      if (nextToken) {
        queryParams.NextToken = nextToken
      }

      console.log(`  Fetching financial events... (${eventsProcessed} processed)`)

      const response = await client.callAPI({
        operation: 'listFinancialEvents',
        endpoint: 'finances',
        query: queryParams,
      })

      const financialEvents = response?.payload?.FinancialEvents || response?.FinancialEvents || {}
      nextToken = response?.payload?.NextToken || response?.NextToken || null

      // Process Shipment Events (main order fees)
      const shipmentEvents = financialEvents.ShipmentEventList || []
      console.log(`  Found ${shipmentEvents.length} shipment events`)

      for (const event of shipmentEvents) {
        const orderId = event.AmazonOrderId
        if (!orderId) continue

        const postedDate = event.PostedDate ? new Date(event.PostedDate) : new Date()
        
        // Process each item in the shipment
        const itemList = event.ShipmentItemList || []
        
        for (const item of itemList) {
          const sku = item.SellerSKU
          if (!sku) continue

          // Aggregate fees for this item
          let referralFee = 0
          let fbaFulfillmentFee = 0
          let fbaWeightHandling = 0
          let variableClosingFee = 0
          let otherFees = 0

          // Process ItemFeeList
          const itemFees = item.ItemFeeList || []
          for (const fee of itemFees) {
            const feeType = fee.FeeType || ''
            const amount = Math.abs(safeFloat(fee.FeeAmount?.CurrencyAmount))

            if (feeType.includes('Commission') || feeType.includes('Referral')) {
              referralFee += amount
            } else if (feeType.includes('FBAPerUnitFulfillment') || feeType.includes('FBAFulfillment')) {
              fbaFulfillmentFee += amount
            } else if (feeType.includes('FBAWeight') || feeType.includes('WeightHandling')) {
              fbaWeightHandling += amount
            } else if (feeType.includes('VariableClosing')) {
              variableClosingFee += amount
            } else if (feeType.includes('Fee')) {
              otherFees += amount
            }
          }

          // Process ItemChargeList for revenue
          let itemPrice = 0
          let shippingPrice = 0
          let giftWrapPrice = 0
          let promoDiscount = 0

          const itemCharges = item.ItemChargeList || []
          for (const charge of itemCharges) {
            const chargeType = charge.ChargeType || ''
            const amount = safeFloat(charge.ChargeAmount?.CurrencyAmount)

            if (chargeType === 'Principal' || chargeType === 'ItemPrice') {
              itemPrice += amount
            } else if (chargeType.includes('Shipping')) {
              shippingPrice += amount
            } else if (chargeType.includes('GiftWrap')) {
              giftWrapPrice += amount
            }
          }

          // Process promotions
          const promotionList = item.PromotionList || []
          for (const promo of promotionList) {
            promoDiscount += Math.abs(safeFloat(promo.PromotionAmount?.CurrencyAmount))
          }

          const totalFees = referralFee + fbaFulfillmentFee + fbaWeightHandling + variableClosingFee + otherFees
          const grossRevenue = itemPrice + shippingPrice + giftWrapPrice - promoDiscount

          // Update order item with fees
          try {
            const result = await prisma.orderItem.updateMany({
              where: { 
                orderId,
                masterSku: sku,
              },
              data: {
                referralFee,
                fbaFee: fbaFulfillmentFee + fbaWeightHandling,
                otherFees: variableClosingFee + otherFees,
                amazonFees: totalFees,
                itemPrice: itemPrice > 0 ? itemPrice : undefined,
                shippingPrice: shippingPrice > 0 ? shippingPrice : undefined,
                giftWrapPrice: giftWrapPrice > 0 ? giftWrapPrice : undefined,
                promoDiscount: promoDiscount > 0 ? promoDiscount : undefined,
                grossRevenue: grossRevenue > 0 ? grossRevenue : undefined,
              },
            })

            if (result.count > 0) {
              feesUpdated++
              ordersWithFees.add(orderId)
            }
          } catch (e) {
            // Order item might not exist yet - that's OK
          }

          eventsProcessed++
        }
      }

      // Process Refund Events
      const refundEvents = financialEvents.RefundEventList || []
      for (const event of refundEvents) {
        // Handle refunds similarly if needed
        eventsProcessed++
      }

      // Rate limit
      if (nextToken) {
        await new Promise(r => setTimeout(r, 500))
      }

    } while (nextToken)

    // Now update DailyProfit with actual fees
    console.log('\n  Recalculating daily profits with actual fees...')
    
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          purchaseDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        amazonFees: { gt: 0 },
      },
      include: {
        order: { select: { purchaseDate: true } },
        product: { select: { cost: true } },
      },
    })

    // Group by date + SKU
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

    let dailyUpdated = 0
    for (const [_, daily] of dailyMap) {
      const grossProfit = daily.revenue - daily.amazonFees
      const netProfit = grossProfit - daily.cogs

      try {
        await prisma.dailyProfit.upsert({
          where: {
            date_masterSku: { date: daily.date, masterSku: daily.masterSku },
          },
          update: {
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
        dailyUpdated++
      } catch (e) {}
    }

    const elapsedSec = Math.round((Date.now() - startTime) / 1000)

    console.log('\n' + '='.repeat(60))
    console.log('✅ FINANCIAL EVENTS SYNC COMPLETE')
    console.log(`   Events processed: ${eventsProcessed}`)
    console.log(`   Order items with fees: ${feesUpdated}`)
    console.log(`   Unique orders: ${ordersWithFees.size}`)
    console.log(`   Daily profits updated: ${dailyUpdated}`)
    console.log(`   Time: ${elapsedSec}s`)
    console.log('='.repeat(60) + '\n')

    // Log sync
    try {
      await prisma.syncLog.create({
        data: {
          syncType: 'financial-events',
          status: 'success',
          completedAt: new Date(),
          recordsProcessed: eventsProcessed,
          recordsUpdated: feesUpdated,
          metadata: {
            daysBack,
            ordersWithFees: ordersWithFees.size,
            dailyUpdated,
          },
        },
      })
    } catch (e) {}

    return NextResponse.json({
      success: true,
      message: `Synced ${feesUpdated} order fees from ${ordersWithFees.size} orders`,
      eventsProcessed,
      feesUpdated,
      ordersWithFees: ordersWithFees.size,
      dailyUpdated,
      elapsedSeconds: elapsedSec,
    })

  } catch (error: any) {
    console.error('Financial events sync failed:', error)
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Syncs actual Amazon fees from Financial Events API',
    usage: 'POST /api/amazon/sync/financial-events?days=30',
    feeTypes: [
      'Commission (Referral Fee ~15%)',
      'FBA Fulfillment Fee (pick, pack, ship)',
      'FBA Weight Handling Fee',
      'Variable Closing Fee',
      'Other transaction fees',
    ],
    importance: 'CRITICAL for accurate profit calculations',
  })
}

