// app/api/profit/products/route.ts
// Returns product-level profit data for the selected period

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getQuickFeeEstimate } from '@/lib/fee-estimation'
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  addDays,
  subMonths
} from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

// Amazon uses PST/PDT (America/Los_Angeles) for their day boundaries
const AMAZON_TIMEZONE = 'America/Los_Angeles'

export const dynamic = 'force-dynamic'

interface ProductProfit {
  id: string
  sku: string
  asin: string
  parentAsin?: string
  displayName?: string  // Internal SKU/name set by user
  title: string         // Amazon product title
  imageUrl?: string
  brand?: string
  supplier?: string
  channel?: string
  unitsSold: number
  refunds: number
  refundRate: number
  sales: number
  adSpend: number
  cogs: number
  cogsTotal: number
  amazonFees: number
  amazonFeesEstimated: number  // Portion that was estimated
  netProfit: number
  margin: number
  roi: number
  realAcos: number | null
  sessions: number
  unitSessionPct: number
  bsr?: number
  bsrChange?: number
}

// Helper to get date range in Amazon's timezone (PST/PDT)
// Uses startOfNextDay with < comparison for more reliable date range queries
function getDateRange(period: string): { startDate: Date; endDate: Date } {
  const now = new Date()
  // Convert current UTC time to PST for day boundary calculations
  const nowInPST = toZonedTime(now, AMAZON_TIMEZONE)

  // Helper to convert PST time back to UTC for database queries
  const toUTC = (date: Date) => fromZonedTime(date, AMAZON_TIMEZONE)

  switch (period) {
    case 'today': {
      const todayStart = startOfDay(nowInPST)
      const tomorrowStart = startOfDay(addDays(nowInPST, 1))
      return {
        startDate: toUTC(todayStart),
        endDate: toUTC(tomorrowStart)
      }
    }
    case 'yesterday': {
      const yesterdayStart = startOfDay(subDays(nowInPST, 1))
      const todayStart = startOfDay(nowInPST)
      return {
        startDate: toUTC(yesterdayStart),
        endDate: toUTC(todayStart)
      }
    }
    case '2daysAgo': {
      const twoDaysAgoStart = startOfDay(subDays(nowInPST, 2))
      const yesterdayStart = startOfDay(subDays(nowInPST, 1))
      return {
        startDate: toUTC(twoDaysAgoStart),
        endDate: toUTC(yesterdayStart)
      }
    }
    case '3daysAgo': {
      const threeDaysAgoStart = startOfDay(subDays(nowInPST, 3))
      const twoDaysAgoStart = startOfDay(subDays(nowInPST, 2))
      return {
        startDate: toUTC(threeDaysAgoStart),
        endDate: toUTC(twoDaysAgoStart)
      }
    }
    case '7days': {
      const sevenDaysAgoStart = startOfDay(subDays(nowInPST, 6))
      const todayStart = startOfDay(nowInPST)
      return {
        startDate: toUTC(sevenDaysAgoStart),
        endDate: toUTC(todayStart)
      }
    }
    case '14days': {
      const fourteenDaysAgoStart = startOfDay(subDays(nowInPST, 13))
      const todayStart = startOfDay(nowInPST)
      return {
        startDate: toUTC(fourteenDaysAgoStart),
        endDate: toUTC(todayStart)
      }
    }
    case '30days': {
      const thirtyDaysAgoStart = startOfDay(subDays(nowInPST, 30))
      const todayStart = startOfDay(nowInPST)
      return {
        startDate: toUTC(thirtyDaysAgoStart),
        endDate: toUTC(todayStart)
      }
    }
    case 'mtd':
    case 'forecast': {
      const monthStart = startOfMonth(nowInPST)
      const tomorrowStart = startOfDay(addDays(nowInPST, 1))
      return {
        startDate: toUTC(monthStart),
        endDate: toUTC(tomorrowStart)
      }
    }
    case 'lastMonth': {
      const lastMonthStart = startOfMonth(subMonths(nowInPST, 1))
      const thisMonthStart = startOfMonth(nowInPST)
      return {
        startDate: toUTC(lastMonthStart),
        endDate: toUTC(thisMonthStart)
      }
    }
    default: {
      const yesterdayStart = startOfDay(subDays(nowInPST, 1))
      const todayStart = startOfDay(nowInPST)
      return {
        startDate: toUTC(yesterdayStart),
        endDate: toUTC(todayStart)
      }
    }
  }
}

// Build the GROUP BY column based on the groupBy parameter
function getGroupByColumn(groupBy: string): { column: string; label: string } {
  switch (groupBy) {
    case 'asin':
      return { column: 'COALESCE(p.asin, oi.asin)', label: 'ASIN' }
    case 'parent':
      return { column: 'COALESCE(p.parent_sku, oi.master_sku)', label: 'Parent' }
    case 'brand':
      return { column: "COALESCE(p.brand, 'Unknown')", label: 'Brand' }
    case 'supplier':
      return { column: "COALESCE(s.name, 'Unknown')", label: 'Supplier' }
    case 'channel':
      return { column: "'Amazon'", label: 'Channel' } // Only Amazon for now
    case 'sku':
    default:
      return { column: 'oi.master_sku', label: 'SKU' }
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'yesterday'
    const groupBy = searchParams.get('groupBy') || 'sku'

    const { startDate, endDate } = getDateRange(period)
    const { column: groupByColumn } = getGroupByColumn(groupBy)

    // Get product-level data with fees directly using pg
    // Dynamic grouping based on groupBy parameter
    // Joins with suppliers table to get supplier names
    // Joins with parent product (parent_p) to get display_name for parent grouping
    const salesByProduct = await query<{
      sku: string
      asin: string | null
      title: string | null
      display_name: string | null
      brand: string | null
      supplier_name: string | null
      parent_sku: string | null
      cost: string | null
      units_sold: string
      total_sales: string
      actual_fees: string
      items_with_fees: string
      total_items: string
    }>(`
      WITH recent_avg_prices AS (
        SELECT 
          oi.master_sku,
          AVG(oi.item_price / NULLIF(oi.quantity, 0)) as avg_unit_price
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date >= NOW() - INTERVAL '30 days'
          AND oi.item_price > 0
          AND oi.quantity > 0
          AND o.status NOT IN ('Cancelled', 'Canceled')
        GROUP BY oi.master_sku
      )
      SELECT
        ${groupByColumn} as sku,
        MAX(COALESCE(p.asin, oi.asin)) as asin,
        MAX(COALESCE(p.title, oi.master_sku)) as title,
        MAX(COALESCE(parent_p.display_name, p.display_name)) as display_name,
        MAX(p.brand) as brand,
        MAX(s.name) as supplier_name,
        MAX(p.parent_sku) as parent_sku,
        COALESCE(AVG(p.cost), 0)::text as cost,
        COALESCE(SUM(oi.quantity), 0)::text as units_sold,
        COALESCE(SUM(
          CASE 
            WHEN oi.item_price > 0 
            THEN oi.item_price + COALESCE(oi.shipping_price, 0)
            -- Use average selling price from recent orders (last 30 days) for more accurate estimation
            ELSE COALESCE((rap.avg_unit_price * oi.quantity), 0) + COALESCE(oi.shipping_price, 0)
          END
        ), 0)::text as total_sales,
        COALESCE(SUM(oi.amazon_fees), 0)::text as actual_fees,
        COUNT(CASE WHEN oi.amazon_fees > 0 THEN 1 END)::text as items_with_fees,
        COUNT(oi.id)::text as total_items
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      LEFT JOIN recent_avg_prices rap ON oi.master_sku = rap.master_sku
      LEFT JOIN products p ON oi.master_sku = p.sku
      LEFT JOIN products parent_p ON p.parent_sku = parent_p.sku
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE o.purchase_date >= $1
        AND o.purchase_date < $2
        AND o.status NOT IN ('Cancelled', 'Canceled')
      GROUP BY ${groupByColumn}
      ORDER BY SUM(
        CASE 
          WHEN oi.item_price > 0 
          THEN oi.item_price
          ELSE COALESCE(rap.avg_unit_price * oi.quantity, 0)
        END
      ) DESC
    `, [startDate, endDate])

    // Get refunds by product
    let refundsByProduct: Array<{ sku: string; refund_count: string }> = []
    try {
      refundsByProduct = await query<{
        sku: string
        refund_count: string
      }>(`
        SELECT
          master_sku as sku,
          COALESCE(SUM(quantity), 0)::text as refund_count
        FROM returns
        WHERE return_date >= $1
          AND return_date < $2
        GROUP BY master_sku
      `, [startDate, endDate])
    } catch (e) {
      // Returns table might not have data
    }

    // Create lookup map for refunds
    const refundsMap = new Map(refundsByProduct.map(r => [r.sku, r]))

    // Build product profit data with fee estimation
    const products: ProductProfit[] = salesByProduct.map((sale) => {
      const refund = refundsMap.get(sale.sku)

      const unitsSold = parseInt(sale.units_sold || '0', 10)
      const totalSales = parseFloat(sale.total_sales || '0')
      const refundCount = parseInt(refund?.refund_count || '0', 10)
      const actualFees = parseFloat(sale.actual_fees || '0')
      const itemsWithFees = parseInt(sale.items_with_fees || '0', 10)
      const totalItems = parseInt(sale.total_items || '0', 10)
      const adSpend = 0 // Will be populated when Ads API is connected
      const cogs = parseFloat(sale.cost || '0')
      const cogsTotal = cogs * unitsSold

      // Calculate estimated fees for items without actual fees
      let estimatedFees = 0
      const itemsWithoutFees = totalItems - itemsWithFees
      if (itemsWithoutFees > 0 && totalSales > 0) {
        // Estimate based on average sale price per item
        const avgPricePerItem = totalSales / totalItems
        const estimatedSalesWithoutFees = avgPricePerItem * itemsWithoutFees
        const estimate = getQuickFeeEstimate(estimatedSalesWithoutFees, itemsWithoutFees)
        estimatedFees = estimate.totalFees
      }

      const totalFees = actualFees + estimatedFees

      const refundRate = unitsSold > 0 ? (refundCount / unitsSold) * 100 : 0
      const grossProfit = totalSales - totalFees - cogsTotal
      const netProfit = grossProfit - adSpend
      const margin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0
      const roi = cogsTotal > 0 ? (netProfit / cogsTotal) * 100 : 0
      const realAcos = netProfit > 0 && adSpend > 0 ? (adSpend / netProfit) * 100 : null

      return {
        id: sale.sku,
        sku: sale.sku,
        asin: sale.asin || '',
        parentAsin: sale.parent_sku || undefined,
        // display_name is internal SKU, title is Amazon product title
        displayName: sale.display_name || undefined,
        title: sale.title || sale.sku,
        imageUrl: undefined, // No image_url column in products table
        brand: sale.brand || undefined,
        supplier: sale.supplier_name || undefined,
        channel: 'Amazon',
        unitsSold,
        refunds: refundCount,
        refundRate,
        sales: totalSales,
        adSpend,
        cogs,
        cogsTotal,
        amazonFees: totalFees,
        amazonFeesEstimated: estimatedFees,
        netProfit,
        margin,
        roi,
        realAcos,
        sessions: 0,
        unitSessionPct: 0,
        bsr: undefined,
        bsrChange: undefined,
      }
    })

    // Sort by net profit descending
    products.sort((a, b) => b.netProfit - a.netProfit)

    // Calculate summary stats
    const totalEstimatedFees = products.reduce((sum, p) => sum + p.amazonFeesEstimated, 0)
    const totalActualFees = products.reduce((sum, p) => sum + (p.amazonFees - p.amazonFeesEstimated), 0)
    const totalFees = totalEstimatedFees + totalActualFees
    const feeEstimationRate = totalFees > 0 ? (totalEstimatedFees / totalFees) * 100 : 0

    return NextResponse.json({
      products,
      meta: {
        totalActualFees: Number(totalActualFees.toFixed(2)),
        totalEstimatedFees: Number(totalEstimatedFees.toFixed(2)),
        feeEstimationRate: Number(feeEstimationRate.toFixed(1)),
        note: feeEstimationRate > 10
          ? 'Some fees are estimated. Run financial-events sync for actual fees.'
          : undefined,
      },
    })

  } catch (error: any) {
    console.error('Error fetching product profit data:', error)
    return NextResponse.json(
      {
        error: error.message,
        products: [],
        // Include more details for debugging
        errorCode: error.code,
        errorMeta: error.meta,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
