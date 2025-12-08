// app/api/profit/periods/route.ts
// Returns profit summaries for each time period (Today, Yesterday, MTD, etc.)

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { getQuickFeeEstimate } from '@/lib/fee-estimation'
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  addDays,
  subMonths,
  format,
} from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

// Amazon uses PST/PDT (America/Los_Angeles) for their day boundaries
const AMAZON_TIMEZONE = 'America/Los_Angeles'

export const dynamic = 'force-dynamic'

// Debug info for tracing fee calculation issues
interface DebugInfo {
  dateRange: { start: string; end: string }
  orderItemCount: number
  itemsWithActualFees: number
  itemsWithEstimatedFees: number
  totalActualFees: number
  totalEstimatedFees: number
  sampleItems?: Array<{
    itemPrice: number
    quantity: number
    amazonFees: number
    estimatedFees: number
  }>
}

interface PeriodSummary {
  period: string
  dateRange: string
  sales: number
  salesChange?: number
  orders: number
  units: number
  promos: number
  refunds: number
  refundCount: number
  adCost: number
  amazonFees: number
  amazonFeesEstimated: number  // Portion that was estimated
  cogs: number
  grossProfit: number
  netProfit: number
  netProfitChange?: number
  estPayout: number
  margin: number
  roi: number
  acos: number | null
  tacos: number | null
  realAcos: number | null
  feeEstimationRate: number  // % of items that used estimated fees
  debug?: DebugInfo  // Optional debug info
}

async function getPeriodData(startDate: Date, endDate: Date, includeDebug: boolean = false): Promise<{
  sales: number
  orders: number
  units: number
  promos: number
  refunds: number
  refundCount: number
  adCost: number
  amazonFees: number
  amazonFeesEstimated: number
  cogs: number
  feeEstimationRate: number
  debug?: DebugInfo
}> {
  // Get aggregated order items data using SQL for accuracy and performance
  // Use gross_revenue field which is already calculated and stored
  // If gross_revenue is NULL or 0, calculate from item_price + shipping_price + gift_wrap_price
  // Calculate estimated fees in SQL for deterministic results
  // Fee estimation: 15% referral fee + $3.50 FBA fee per unit
  const summaryData = await queryOne<{
    total_sales: string
    total_units: string
    total_promo: string
    total_actual_fees: string
    total_estimated_fees: string
    items_with_fees: string
    total_items: string
    total_orders: string
  }>(`
    SELECT
      ROUND(COALESCE(SUM(
        CASE 
          WHEN COALESCE(oi.gross_revenue, 0) > 0 
          THEN oi.gross_revenue
          WHEN oi.item_price > 0
          THEN oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
          ELSE COALESCE(p.price * oi.quantity, 0) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
        END
      ), 0), 2)::text as total_sales,
      COALESCE(SUM(oi.quantity), 0)::text as total_units,
      ROUND(COALESCE(SUM(COALESCE(oi.promo_discount, 0)), 0), 2)::text as total_promo,
      ROUND(COALESCE(SUM(COALESCE(oi.amazon_fees, 0)), 0), 2)::text as total_actual_fees,
      ROUND(COALESCE(SUM(
        CASE 
          WHEN COALESCE(oi.amazon_fees, 0) = 0 
          THEN CASE
            WHEN oi.item_price > 0 
            THEN ROUND((oi.item_price * 0.15) + (3.50 * oi.quantity), 2)
            WHEN COALESCE(p.price, 0) > 0
            THEN ROUND((p.price * oi.quantity * 0.15) + (3.50 * oi.quantity), 2)
            ELSE 0
          END
          ELSE 0 
        END
      ), 0), 2)::text as total_estimated_fees,
      COALESCE(SUM(CASE WHEN COALESCE(oi.amazon_fees, 0) > 0 THEN 1 ELSE 0 END), 0)::text as items_with_fees,
      COUNT(*)::text as total_items,
      COUNT(DISTINCT o.id)::text as total_orders
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    LEFT JOIN products p ON oi.master_sku = p.sku
    WHERE o.purchase_date >= $1::timestamp
      AND o.purchase_date < $2::timestamp
      AND o.status NOT IN ('Cancelled', 'Canceled')
  `, [startDate, endDate])

  const totalSales = parseFloat(summaryData?.total_sales || '0')
  const totalUnits = parseInt(summaryData?.total_units || '0', 10)
  const totalPromo = parseFloat(summaryData?.total_promo || '0')
  const actualFees = parseFloat(summaryData?.total_actual_fees || '0')
  const estimatedFees = parseFloat(summaryData?.total_estimated_fees || '0')
  const itemsWithActualFees = parseInt(summaryData?.items_with_fees || '0', 10)
  const totalItems = parseInt(summaryData?.total_items || '0', 10)
  const orderCount = parseInt(summaryData?.total_orders || '0', 10)
  const itemsWithEstimatedFees = totalItems - itemsWithActualFees

  // Collect sample items for debugging if needed
  const sampleItems: DebugInfo['sampleItems'] = []
  if (includeDebug && itemsWithEstimatedFees > 0) {
    const sampleItemsData = await query<{
      item_price: string
      quantity: string
    }>(`
      SELECT
        oi.item_price::text,
        oi.quantity::text
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= $1
        AND o.purchase_date < $2
        AND o.status NOT IN ('Cancelled', 'Canceled')
        AND COALESCE(oi.amazon_fees, 0) = 0
        AND oi.item_price > 0
      ORDER BY oi.id
      LIMIT 5
    `, [startDate, endDate])

    for (const item of sampleItemsData) {
      const itemPrice = parseFloat(item.item_price || '0')
      const quantity = parseInt(item.quantity || '1', 10)
      if (itemPrice > 0) {
        const estimate = getQuickFeeEstimate(itemPrice, quantity)
        sampleItems.push({
          itemPrice,
          quantity,
          amazonFees: 0,
          estimatedFees: estimate.totalFees,
        })
      }
    }
  }

  const feeEstimationRate = totalItems > 0 ? (itemsWithEstimatedFees / totalItems) * 100 : 0

  // Build debug info if requested
  const debug: DebugInfo | undefined = includeDebug ? {
    dateRange: {
      start: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
      end: format(endDate, 'yyyy-MM-dd HH:mm:ss'),
    },
    orderItemCount: totalItems,
    itemsWithActualFees,
    itemsWithEstimatedFees,
    totalActualFees: Number(actualFees.toFixed(2)),
    totalEstimatedFees: Number(estimatedFees.toFixed(2)),
    sampleItems,
  } : undefined

  // Order count is now calculated in the main query above using COUNT(DISTINCT o.id)
  // This ensures consistency - we only count orders that have items

  // Get refund data - both count and dollar amount
  // Try multiple sources: returns table, daily_summary, daily_profit
  let refundCount = 0
  let refundAmount = 0

  // First try returns table with actual refund_amount
  try {
    const refundData = await queryOne<{ total_quantity: string; total_amount: string }>(`
      SELECT
        COALESCE(SUM(quantity), 0)::text as total_quantity,
        COALESCE(SUM(refund_amount), 0)::text as total_amount
      FROM returns
        WHERE return_date >= $1
        AND return_date < $2
    `, [startDate, endDate])
    refundCount = parseInt(refundData?.total_quantity || '0', 10)
    refundAmount = parseFloat(refundData?.total_amount || '0')
  } catch (e) {
    // Returns table might not have data
  }

  // If refund_amount is 0 but we have refund count, estimate from order item prices
  if (refundAmount === 0 && refundCount > 0) {
    try {
      // Join returns with order_items to get the original item prices
      const estimatedRefunds = await queryOne<{ total: string }>(`
        SELECT COALESCE(SUM(oi.item_price * r.quantity), 0)::text as total
        FROM returns r
        JOIN order_items oi ON r.order_id = oi.order_id AND r.master_sku = oi.master_sku
        WHERE r.return_date >= $1
          AND r.return_date < $2
      `, [startDate, endDate])
      refundAmount = parseFloat(estimatedRefunds?.total || '0')
    } catch (e) {
      // Estimation failed, continue to other sources
    }
  }

  // If still 0, try daily_summary table
  if (refundAmount === 0) {
    try {
      const summaryRefunds = await queryOne<{ total: string }>(`
        SELECT COALESCE(SUM(total_refunds), 0)::text as total
        FROM daily_summary
        WHERE date >= $1::date
          AND date < $2::date
      `, [startDate, endDate])
      refundAmount = parseFloat(summaryRefunds?.total || '0')
    } catch (e) {
      // daily_summary might not exist
    }
  }

  // If still 0, try daily_profit table
  if (refundAmount === 0) {
    try {
      const profitRefunds = await queryOne<{ total: string }>(`
        SELECT COALESCE(SUM(refunds), 0)::text as total
        FROM daily_profit
        WHERE date >= $1::date
          AND date < $2::date
      `, [startDate, endDate])
      refundAmount = parseFloat(profitRefunds?.total || '0')
    } catch (e) {
      // daily_profit might not exist
    }
  }

  // Get ad spend from advertising_daily (if connected)
  let adCost = 0
  try {
    const adData = await queryOne<{ total_spend: string }>(`
      SELECT COALESCE(SUM(spend), 0)::text as total_spend
      FROM advertising_daily
      WHERE date >= $1
        AND date < $2
    `, [startDate, endDate])
    adCost = parseFloat(adData?.total_spend || '0')
  } catch {
    // Ads table might not exist yet
  }

  // Calculate COGS - use 'cost' column from products table
  let cogs = 0
  try {
    const cogsData = await queryOne<{ total_cogs: string }>(`
      SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost, 0)), 0)::text as total_cogs
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE o.purchase_date >= $1
      AND o.purchase_date < $2
      AND o.status NOT IN ('Cancelled', 'Canceled')
    `, [startDate, endDate])
    cogs = parseFloat(cogsData?.total_cogs || '0')
  } catch (e) {
    console.log('COGS query error:', e)
  }

  // Round all monetary values to 2 decimal places for consistency
  return {
    sales: Number(totalSales.toFixed(2)),
    orders: orderCount,
    units: totalUnits,
    promos: Number(totalPromo.toFixed(2)),
    refunds: Number(refundAmount.toFixed(2)),
    refundCount,
    adCost: Number(adCost.toFixed(2)),
    amazonFees: Number((actualFees + estimatedFees).toFixed(2)),
    amazonFeesEstimated: Number(estimatedFees.toFixed(2)),
    cogs: Number(cogs.toFixed(2)),
    feeEstimationRate: Number(feeEstimationRate.toFixed(1)),
    debug,
  }
}

// Helper to get date range for a period type
// Takes nowInPST (current time in PST) and returns start/end in UTC for database queries
// Uses startOfNextDay with < comparison for more reliable date range queries
function getDateRangeForPeriod(period: string, nowInPST: Date): { start: Date; end: Date; label: string } {
  // Helper to convert PST time to UTC for database queries
  const toUTC = (date: Date) => fromZonedTime(date, AMAZON_TIMEZONE)

  switch (period) {
    case 'today': {
      const todayStart = startOfDay(nowInPST)
      const tomorrowStart = startOfDay(addDays(nowInPST, 1))
      return { start: toUTC(todayStart), end: toUTC(tomorrowStart), label: format(nowInPST, 'd MMMM yyyy') }
    }
    case 'yesterday': {
      const yesterdayStart = startOfDay(subDays(nowInPST, 1))
      const todayStart = startOfDay(nowInPST)
      return { start: toUTC(yesterdayStart), end: toUTC(todayStart), label: format(subDays(nowInPST, 1), 'd MMMM yyyy') }
    }
    case '2daysAgo': {
      const twoDaysAgoStart = startOfDay(subDays(nowInPST, 2))
      const yesterdayStart = startOfDay(subDays(nowInPST, 1))
      return { start: toUTC(twoDaysAgoStart), end: toUTC(yesterdayStart), label: format(subDays(nowInPST, 2), 'd MMMM yyyy') }
    }
    case '3daysAgo': {
      const threeDaysAgoStart = startOfDay(subDays(nowInPST, 3))
      const twoDaysAgoStart = startOfDay(subDays(nowInPST, 2))
      return { start: toUTC(threeDaysAgoStart), end: toUTC(twoDaysAgoStart), label: format(subDays(nowInPST, 3), 'd MMMM yyyy') }
    }
    case '7days': {
      const sevenDaysAgoStart = startOfDay(subDays(nowInPST, 6))
      const todayStart = startOfDay(nowInPST)
      return { start: toUTC(sevenDaysAgoStart), end: toUTC(todayStart), label: `${format(subDays(nowInPST, 6), 'd MMM')} - ${format(subDays(nowInPST, 1), 'd MMMM yyyy')}` }
    }
    case '14days': {
      const fourteenDaysAgoStart = startOfDay(subDays(nowInPST, 13))
      const todayStart = startOfDay(nowInPST)
      return { start: toUTC(fourteenDaysAgoStart), end: toUTC(todayStart), label: `${format(subDays(nowInPST, 13), 'd MMM')} - ${format(subDays(nowInPST, 1), 'd MMMM yyyy')}` }
    }
    case '30days': {
      const thirtyDaysAgoStart = startOfDay(subDays(nowInPST, 30))
      const todayStart = startOfDay(nowInPST)
      const yesterday = subDays(nowInPST, 1)
      return { start: toUTC(thirtyDaysAgoStart), end: toUTC(todayStart), label: `${format(thirtyDaysAgoStart, 'd MMMM')} - ${format(yesterday, 'd MMMM yyyy')}` }
    }
    case 'mtd': {
      const monthStart = startOfMonth(nowInPST)
      const tomorrowStart = startOfDay(addDays(nowInPST, 1))
      return { start: toUTC(monthStart), end: toUTC(tomorrowStart), label: `${format(startOfMonth(nowInPST), 'd')}-${format(nowInPST, 'd MMMM yyyy')}` }
    }
    case 'lastMonth': {
      const lastMonthStart = startOfMonth(subMonths(nowInPST, 1))
      const thisMonthStart = startOfMonth(nowInPST)
      return { start: toUTC(lastMonthStart), end: toUTC(thisMonthStart), label: `${format(startOfMonth(subMonths(nowInPST, 1)), 'd')}-${format(endOfMonth(subMonths(nowInPST, 1)), 'd MMMM yyyy')}` }
    }
    default: {
      const yesterdayStart = startOfDay(subDays(nowInPST, 1))
      const todayStart = startOfDay(nowInPST)
      return { start: toUTC(yesterdayStart), end: toUTC(todayStart), label: format(subDays(nowInPST, 1), 'd MMMM yyyy') }
    }
  }
}

// Period presets configuration
const periodPresets: Record<string, string[]> = {
  default: ['today', 'yesterday', 'mtd', 'forecast', 'lastMonth'],
  simple: ['today', 'yesterday', 'mtd', 'lastMonth'],
  days: ['today', 'yesterday', '7days', '14days', '30days'],
  recent: ['today', 'yesterday', '2daysAgo', '3daysAgo'],
  months: ['mtd', 'lastMonth', '2monthsAgo', '3monthsAgo'],
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const includeDebug = searchParams.get('debug') === 'true'
    const preset = searchParams.get('preset') || 'default'

    // Convert current time to PST for Amazon day boundary calculations
    const nowUTC = new Date()
    const nowInPST = toZonedTime(nowUTC, AMAZON_TIMEZONE)

    // Helper to convert PST time to UTC for database queries
    const toUTC = (date: Date) => fromZonedTime(date, AMAZON_TIMEZONE)

    const monthStartPST = startOfMonth(nowInPST)
    const monthStartUTC = toUTC(monthStartPST)  // For forecast calculation

    // Get which periods to fetch based on preset
    const periodsToFetch = periodPresets[preset] || periodPresets.default

    // Build period data for each requested period
    const periodPromises = periodsToFetch.map(async (period) => {
      const range = getDateRangeForPeriod(period, nowInPST)

      // Special handling for forecast - it's based on MTD extrapolated
      if (period === 'forecast') {
        const mtdData = await getPeriodData(monthStartUTC, toUTC(endOfDay(nowInPST)), includeDebug)
        const daysInMonth = endOfMonth(nowInPST).getDate()
        const dayOfMonth = nowInPST.getDate()
        const forecastMultiplier = daysInMonth / dayOfMonth

        return {
          period: 'forecast',
          dateRange: `${format(monthStartPST, 'd')}-${format(endOfMonth(nowInPST), 'd MMMM yyyy')}`,
          sales: mtdData.sales * forecastMultiplier,
          orders: Math.round(mtdData.orders * forecastMultiplier),
          units: Math.round(mtdData.units * forecastMultiplier),
          promos: mtdData.promos * forecastMultiplier,
          refunds: mtdData.refunds * forecastMultiplier,
          refundCount: Math.round(mtdData.refundCount * forecastMultiplier),
          adCost: mtdData.adCost * forecastMultiplier,
          amazonFees: mtdData.amazonFees * forecastMultiplier,
          amazonFeesEstimated: mtdData.amazonFeesEstimated * forecastMultiplier,
          cogs: mtdData.cogs * forecastMultiplier,
          feeEstimationRate: mtdData.feeEstimationRate,
          debug: mtdData.debug,
        }
      }

      const data = await getPeriodData(range.start, range.end, includeDebug)
      return {
        period,
        dateRange: range.label,
        ...data,
      }
    })

    const periodsData = await Promise.all(periodPromises)

    // Calculate derived metrics (matching Sellerboard's approach)
    // Gross profit = Sales - Promos - Amazon fees - COGS
    // Net profit = Gross profit - Ad cost - Refunds
    const calculateMetrics = (data: any) => {
      const grossProfit = data.sales - data.promos - data.amazonFees - data.cogs
      const netProfit = grossProfit - data.adCost - data.refunds
      const estPayout = data.sales - data.promos - data.amazonFees - data.refunds
      const margin = data.sales > 0 ? (netProfit / data.sales) * 100 : 0
      const roi = data.cogs > 0 ? (netProfit / data.cogs) * 100 : 0
      const acos = data.adCost > 0 && data.sales > 0 ? (data.adCost / data.sales) * 100 : null
      const tacos = data.sales > 0 ? (data.adCost / data.sales) * 100 : null
      const realAcos = netProfit > 0 && data.adCost > 0 ? (data.adCost / netProfit) * 100 : null

      return {
        grossProfit,
        netProfit,
        estPayout,
        margin,
        roi,
        acos,
        tacos,
        realAcos,
        amazonFeesEstimated: data.amazonFeesEstimated,
        feeEstimationRate: data.feeEstimationRate,
      }
    }

    // Debug: Log date ranges being used (check server logs)
    if (includeDebug) {
      console.log('=== Period Date Ranges (PST) ===')
      console.log('Current time PST:', format(nowInPST, 'yyyy-MM-dd HH:mm:ss'))
      periodsToFetch.forEach(period => {
        const range = getDateRangeForPeriod(period, nowInPST)
        console.log(`${period}: ${format(toZonedTime(range.start, AMAZON_TIMEZONE), 'yyyy-MM-dd HH:mm:ss')} to ${format(toZonedTime(range.end, AMAZON_TIMEZONE), 'yyyy-MM-dd HH:mm:ss')} PST`)
      })
    }

    // Build the final periods array with metrics
    const periods: PeriodSummary[] = periodsData.map((periodData, index) => {
      const metrics = calculateMetrics(periodData)

      // Calculate sales change for first period (compare to second period)
      let salesChange: number | undefined
      if (index === 0 && periodsData[1]?.sales > 0) {
        salesChange = ((periodData.sales - periodsData[1].sales) / periodsData[1].sales) * 100
      }

      return {
        period: periodData.period,
        dateRange: periodData.dateRange,
        sales: periodData.sales,
        orders: periodData.orders,
        units: periodData.units,
        promos: periodData.promos || 0,
        refunds: periodData.refunds || 0,
        refundCount: periodData.refundCount,
        adCost: periodData.adCost,
        amazonFees: periodData.amazonFees,
        cogs: periodData.cogs,
        ...metrics,
        salesChange,
      }
    })

    // Build response with optional debug info
    const response: any = { periods, preset }

    if (includeDebug) {
      // Build date range info for each period
      const dateRanges: Record<string, { start: string; end: string; startPST: string; endPST: string }> = {}
      periodsToFetch.forEach(period => {
        const range = getDateRangeForPeriod(period, nowInPST)
        dateRanges[period] = {
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          startPST: format(toZonedTime(range.start, AMAZON_TIMEZONE), 'yyyy-MM-dd HH:mm:ss'),
          endPST: format(toZonedTime(range.end, AMAZON_TIMEZONE), 'yyyy-MM-dd HH:mm:ss'),
        }
      })

      // Get order status breakdown for today (helps verify shipped-only filter is working)
      const todayRange = getDateRangeForPeriod('today', nowInPST)
      const statusBreakdown = await query<{ status: string; order_count: string; unit_count: string }>(`
        SELECT
          o.status,
          COUNT(DISTINCT o.id)::text as order_count,
          COALESCE(SUM(oi.quantity), 0)::text as unit_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.purchase_date >= $1
          AND o.purchase_date < $2
        GROUP BY o.status
        ORDER BY o.status
      `, [todayRange.start, todayRange.end])

      response.debug = {
        serverTimeUTC: nowUTC.toISOString(),
        serverTimePST: format(nowInPST, 'yyyy-MM-dd HH:mm:ss'),
        timezone: AMAZON_TIMEZONE,
        note: 'Profit calculations exclude Cancelled/Canceled orders',
        todayOrderStatusBreakdown: statusBreakdown.map(s => ({
          status: s.status,
          orders: parseInt(s.order_count),
          units: parseInt(s.unit_count),
          includedInProfit: s.status !== 'Cancelled' && s.status !== 'Canceled',
        })),
        dateRanges,
        periodDebug: periodsData.reduce((acc: any, p) => {
          acc[p.period] = p.debug
          return acc
        }, {}),
      }
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Error fetching period data:', error)
    return NextResponse.json(
      { error: error.message, periods: [] },
      { status: 500 }
    )
  }
}
