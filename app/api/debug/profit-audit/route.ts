/**
 * Profit Audit Diagnostic API
 *
 * Compares calculated profit from OrderItem data vs stored DailyProfit records
 * Identifies:
 * - Missing Amazon fees (amazonFees = 0)
 * - Missing COGS (product.cost = 0)
 * - Date mismatches between purchaseDate and fee postedDate
 *
 * GET /api/debug/profit-audit?date=2024-12-05
 * GET /api/debug/profit-audit?date=2024-12-05&details=true
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startOfDay, endOfDay, parseISO, format, subDays, addDays } from 'date-fns'

export const dynamic = 'force-dynamic'

interface OrderItemWithDetails {
  id: number
  orderId: string
  masterSku: string
  quantity: number
  itemPrice: number
  amazonFees: number
  referralFee: number
  fbaFee: number
  otherFees: number
  productCost: number
  purchaseDate: Date
}

interface MissingFeeItem {
  orderId: string
  sku: string
  quantity: number
  itemPrice: number
  purchaseDate: string
}

interface MissingCostProduct {
  sku: string
  title: string
  totalUnitsSold: number
  totalRevenue: number
}

interface DateMismatchItem {
  orderId: string
  sku: string
  purchaseDate: string
  feePostedDate: string | null
  daysDifference: number
  amazonFees: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const showDetails = searchParams.get('details') === 'true'
    const lookbackDays = parseInt(searchParams.get('lookback') || '3')

    if (!dateParam) {
      return NextResponse.json({
        error: 'Missing date parameter',
        usage: {
          basic: 'GET /api/debug/profit-audit?date=2024-12-05',
          withDetails: 'GET /api/debug/profit-audit?date=2024-12-05&details=true',
          withLookback: 'GET /api/debug/profit-audit?date=2024-12-05&lookback=5',
        },
        description: {
          date: 'The date to audit (YYYY-MM-DD)',
          details: 'Include individual order item details',
          lookback: 'Days to look back for fee matching (default 3)',
        },
      })
    }

    const targetDate = parseISO(dateParam)
    const dayStart = startOfDay(targetDate)
    const dayEnd = endOfDay(targetDate)

    console.log(`\n${'='.repeat(60)}`)
    console.log(`📊 PROFIT AUDIT: ${format(targetDate, 'yyyy-MM-dd')}`)
    console.log(`${'='.repeat(60)}`)

    // ===========================================
    // 1. Get all order items for this date (by purchaseDate)
    // ===========================================
    const orderItems = await prisma.$queryRaw<Array<{
      id: number
      order_id: string
      master_sku: string
      quantity: number
      item_price: string
      amazon_fees: string
      referral_fee: string
      fba_fee: string
      other_fees: string
      gross_revenue: string
      purchase_date: Date
      product_cost: string | null
      product_title: string | null
    }>>`
      SELECT
        oi.id,
        oi.order_id,
        oi.master_sku,
        oi.quantity,
        oi.item_price::text,
        oi.amazon_fees::text,
        oi.referral_fee::text,
        oi.fba_fee::text,
        oi.other_fees::text,
        oi.gross_revenue::text,
        o.purchase_date,
        p.cost::text as product_cost,
        p.title as product_title
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE o.purchase_date >= ${dayStart}
        AND o.purchase_date <= ${dayEnd}
        AND o.status != 'Cancelled'
      ORDER BY o.purchase_date, oi.master_sku
    `

    // ===========================================
    // 2. Calculate totals from OrderItem table
    // ===========================================
    let totalOrders = new Set<string>()
    let totalUnits = 0
    let totalRevenue = 0
    let totalAmazonFees = 0
    let totalReferralFees = 0
    let totalFbaFees = 0
    let totalOtherFees = 0
    let totalCogs = 0

    const missingFees: MissingFeeItem[] = []
    const missingCostProducts = new Map<string, MissingCostProduct>()
    const itemsWithFees: Array<{ orderId: string; sku: string; fees: number }> = []

    for (const item of orderItems) {
      totalOrders.add(item.order_id)
      totalUnits += item.quantity

      const itemPrice = parseFloat(item.item_price || '0')
      const amazonFees = parseFloat(item.amazon_fees || '0')
      const referralFee = parseFloat(item.referral_fee || '0')
      const fbaFee = parseFloat(item.fba_fee || '0')
      const otherFees = parseFloat(item.other_fees || '0')
      const productCost = parseFloat(item.product_cost || '0')

      totalRevenue += itemPrice
      totalAmazonFees += amazonFees
      totalReferralFees += referralFee
      totalFbaFees += fbaFee
      totalOtherFees += otherFees
      totalCogs += item.quantity * productCost

      // Track items with missing fees
      if (amazonFees === 0 && itemPrice > 0) {
        missingFees.push({
          orderId: item.order_id,
          sku: item.master_sku,
          quantity: item.quantity,
          itemPrice,
          purchaseDate: format(item.purchase_date, 'yyyy-MM-dd HH:mm'),
        })
      }

      // Track products with missing COGS
      if (productCost === 0) {
        const existing = missingCostProducts.get(item.master_sku)
        if (existing) {
          existing.totalUnitsSold += item.quantity
          existing.totalRevenue += itemPrice
        } else {
          missingCostProducts.set(item.master_sku, {
            sku: item.master_sku,
            title: item.product_title || item.master_sku,
            totalUnitsSold: item.quantity,
            totalRevenue: itemPrice,
          })
        }
      }

      if (amazonFees > 0) {
        itemsWithFees.push({ orderId: item.order_id, sku: item.master_sku, fees: amazonFees })
      }
    }

    // ===========================================
    // 3. Get DailyProfit records for comparison
    // ===========================================
    const dailyProfits = await prisma.dailyProfit.findMany({
      where: {
        date: dayStart,
      },
    })

    let dpTotalUnits = 0
    let dpTotalRevenue = 0
    let dpTotalAmazonFees = 0
    let dpTotalCogs = 0
    let dpTotalNetProfit = 0

    for (const dp of dailyProfits) {
      dpTotalUnits += dp.unitsSold
      dpTotalRevenue += Number(dp.revenue)
      dpTotalAmazonFees += Number(dp.amazonFees)
      dpTotalCogs += Number(dp.cogs)
      dpTotalNetProfit += Number(dp.netProfit)
    }

    // ===========================================
    // 4. Check for date mismatch issues
    // ===========================================
    // Look for fees that might have posted on a different date
    const dateMismatches: DateMismatchItem[] = []

    // Check orders from target date - did their fees come in later?
    const ordersOnDate = Array.from(totalOrders)

    // Get sync logs to see when financial events were last synced
    const recentSyncLogs = await prisma.syncLog.findMany({
      where: {
        syncType: { in: ['financial-events', 'scheduled-daily', 'scheduled-weekly'] },
      },
      orderBy: { startedAt: 'desc' },
      take: 5,
    })

    // ===========================================
    // 5. Look for fees from orders on nearby days
    //    that might have been attributed to this date's purchases
    // ===========================================
    const nearbyDateStart = startOfDay(subDays(targetDate, lookbackDays))
    const nearbyDateEnd = endOfDay(addDays(targetDate, lookbackDays))

    const nearbyOrderItems = await prisma.$queryRaw<Array<{
      order_id: string
      master_sku: string
      purchase_date: Date
      amazon_fees: string
    }>>`
      SELECT
        oi.order_id,
        oi.master_sku,
        o.purchase_date,
        oi.amazon_fees::text
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= ${nearbyDateStart}
        AND o.purchase_date <= ${nearbyDateEnd}
        AND o.status != 'Cancelled'
        AND oi.amazon_fees > 0
    `

    // Group by date to show fee distribution
    const feesByDate = new Map<string, { orders: number; totalFees: number; unitCount: number }>()
    for (const item of nearbyOrderItems) {
      const dateKey = format(item.purchase_date, 'yyyy-MM-dd')
      const existing = feesByDate.get(dateKey) || { orders: 0, totalFees: 0, unitCount: 0 }
      existing.orders++
      existing.totalFees += parseFloat(item.amazon_fees || '0')
      existing.unitCount++
      feesByDate.set(dateKey, existing)
    }

    // ===========================================
    // 6. Calculate expected profit vs actual
    // ===========================================
    const calculatedGrossProfit = totalRevenue - totalAmazonFees
    const calculatedNetProfit = calculatedGrossProfit - totalCogs
    const calculatedMargin = totalRevenue > 0 ? (calculatedNetProfit / totalRevenue) * 100 : 0

    // ===========================================
    // 7. Identify potential issues
    // ===========================================
    const issues: string[] = []

    const missingFeesPercent = totalRevenue > 0 ? (missingFees.length / orderItems.length) * 100 : 0
    if (missingFeesPercent > 20) {
      issues.push(`${missingFeesPercent.toFixed(1)}% of order items have no Amazon fees - fees may not have synced yet`)
    }

    if (missingCostProducts.size > 0) {
      const missingCostRevenue = Array.from(missingCostProducts.values())
        .reduce((sum, p) => sum + p.totalRevenue, 0)
      issues.push(`${missingCostProducts.size} products have cost=0, affecting $${missingCostRevenue.toFixed(2)} revenue`)
    }

    const dpDiff = Math.abs(dpTotalNetProfit - calculatedNetProfit)
    if (dpDiff > 1 && dpTotalNetProfit !== 0) {
      issues.push(`DailyProfit net profit differs by $${dpDiff.toFixed(2)} from calculated`)
    }

    // Check if recent sync covered this date
    const latestSync = recentSyncLogs[0]
    if (latestSync) {
      const syncedAt = latestSync.completedAt || latestSync.startedAt
      const syncDaysAgo = Math.floor((Date.now() - syncedAt.getTime()) / (1000 * 60 * 60 * 24))
      if (syncDaysAgo > 1) {
        issues.push(`Last financial sync was ${syncDaysAgo} days ago - fees may be stale`)
      }
    }

    // ===========================================
    // Build response
    // ===========================================
    const response: any = {
      date: format(targetDate, 'yyyy-MM-dd'),

      // Summary from OrderItem table
      orderItemSummary: {
        orderCount: totalOrders.size,
        lineItemCount: orderItems.length,
        totalUnits,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        feeBreakdown: {
          amazonFees: Number(totalAmazonFees.toFixed(2)),
          referralFees: Number(totalReferralFees.toFixed(2)),
          fbaFees: Number(totalFbaFees.toFixed(2)),
          otherFees: Number(totalOtherFees.toFixed(2)),
        },
        totalCogs: Number(totalCogs.toFixed(2)),
        calculatedGrossProfit: Number(calculatedGrossProfit.toFixed(2)),
        calculatedNetProfit: Number(calculatedNetProfit.toFixed(2)),
        calculatedMargin: Number(calculatedMargin.toFixed(1)),
      },

      // Summary from DailyProfit table
      dailyProfitSummary: {
        recordCount: dailyProfits.length,
        totalUnits: dpTotalUnits,
        totalRevenue: Number(dpTotalRevenue.toFixed(2)),
        totalAmazonFees: Number(dpTotalAmazonFees.toFixed(2)),
        totalCogs: Number(dpTotalCogs.toFixed(2)),
        totalNetProfit: Number(dpTotalNetProfit.toFixed(2)),
      },

      // Comparison
      comparison: {
        revenueDiff: Number((totalRevenue - dpTotalRevenue).toFixed(2)),
        feesDiff: Number((totalAmazonFees - dpTotalAmazonFees).toFixed(2)),
        cogsDiff: Number((totalCogs - dpTotalCogs).toFixed(2)),
        netProfitDiff: Number((calculatedNetProfit - dpTotalNetProfit).toFixed(2)),
      },

      // Issue tracking
      issues,

      missingFeesCount: missingFees.length,
      missingFeesPercent: Number(missingFeesPercent.toFixed(1)),

      missingCostProductCount: missingCostProducts.size,

      // Fee distribution across nearby dates
      feeDistributionByDate: Object.fromEntries(
        Array.from(feesByDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, data]) => [date, {
            itemsWithFees: data.unitCount,
            totalFees: Number(data.totalFees.toFixed(2)),
          }])
      ),

      // Recent sync info
      lastFinancialSync: latestSync ? {
        type: latestSync.syncType,
        completedAt: latestSync.completedAt?.toISOString() || latestSync.startedAt.toISOString(),
        recordsUpdated: latestSync.recordsUpdated,
      } : null,

      // Diagnostic hints
      diagnosticHints: [
        'If missingFeesPercent is high, run: POST /api/amazon/sync/financial-events?days=7',
        'Fees come from Financial Events API by postedDate, not purchaseDate',
        'Fees typically post 1-3 days after purchase',
        'COGS missing = Product.cost field not set in products table',
      ],
    }

    // Include details if requested
    if (showDetails) {
      response.details = {
        orderItemsMissingFees: missingFees.slice(0, 50),
        productsMissingCost: Array.from(missingCostProducts.values()),
      }
    }

    console.log(`\n📊 Audit complete:`)
    console.log(`   Orders: ${totalOrders.size}, Items: ${orderItems.length}`)
    console.log(`   Revenue: $${totalRevenue.toFixed(2)}`)
    console.log(`   Fees: $${totalAmazonFees.toFixed(2)}`)
    console.log(`   COGS: $${totalCogs.toFixed(2)}`)
    console.log(`   Net Profit: $${calculatedNetProfit.toFixed(2)}`)
    console.log(`   Missing fees: ${missingFees.length} items (${missingFeesPercent.toFixed(1)}%)`)
    console.log(`   Missing cost: ${missingCostProducts.size} products`)

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Profit audit error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
