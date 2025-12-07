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
  refunds: number
  refundCount: number
  adCost: number
  amazonFees: number
  amazonFeesEstimated: number
  cogs: number
  feeEstimationRate: number
  debug?: DebugInfo
}> {
  // Get order items with fee data directly using pg
  const orderItems = await query<{
    item_price: string
    shipping_price: string
    promo_discount: string
    quantity: string
    amazon_fees: string
  }>(`
    SELECT
      oi.item_price::text,
      COALESCE(oi.shipping_price, 0)::text as shipping_price,
      COALESCE(oi.promo_discount, 0)::text as promo_discount,
      oi.quantity::text,
      oi.amazon_fees::text
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.purchase_date >= $1
      AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
  `, [startDate, endDate])

  // Calculate fees with estimation for items missing actual fees
  let totalSales = 0
  let totalUnits = 0
  let actualFees = 0
  let estimatedFees = 0
  let itemsWithActualFees = 0
  let itemsWithEstimatedFees = 0
  const sampleItems: DebugInfo['sampleItems'] = []

  for (const item of orderItems) {
    const itemPrice = parseFloat(item.item_price || '0')
    const shippingPrice = parseFloat(item.shipping_price || '0')
    const promoDiscount = parseFloat(item.promo_discount || '0')
    const quantity = parseInt(item.quantity || '1', 10)
    const amazonFees = parseFloat(item.amazon_fees || '0')

    // Sales = item_price + shipping_price - promo_discount
    totalSales += itemPrice + shippingPrice - promoDiscount
    totalUnits += quantity

    let itemEstimatedFees = 0
    if (amazonFees > 0) {
      // Use actual fees from synced financial events
      actualFees += amazonFees
      itemsWithActualFees++
    } else if (itemPrice > 0) {
      // Estimate fees for items that haven't synced yet
      const estimate = getQuickFeeEstimate(itemPrice, quantity)
      estimatedFees += estimate.totalFees
      itemEstimatedFees = estimate.totalFees
      itemsWithEstimatedFees++
    }

    // Collect sample items for debugging (first 5)
    if (includeDebug && sampleItems.length < 5) {
      sampleItems.push({
        itemPrice,
        quantity,
        amazonFees,
        estimatedFees: itemEstimatedFees,
      })
    }
  }

  const totalItems = orderItems.length
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

  // Get unique order count
  const orderCountResult = await queryOne<{ count: string }>(`
    SELECT COUNT(*)::text as count
    FROM orders
    WHERE purchase_date >= $1
      AND purchase_date <= $2
      AND status != 'Cancelled'
  `, [startDate, endDate])
  const orderCount = parseInt(orderCountResult?.count || '0', 10)

  // Get refund data
  let refundCount = 0
  try {
    const refundData = await queryOne<{ total_quantity: string }>(`
      SELECT COALESCE(SUM(quantity), 0)::text as total_quantity
      FROM returns
      WHERE return_date >= $1
        AND return_date <= $2
    `, [startDate, endDate])
    refundCount = parseInt(refundData?.total_quantity || '0', 10)
  } catch (e) {
    // Returns table might not have data
  }

  // Get ad spend from advertising_daily (if connected)
  let adCost = 0
  try {
    const adData = await queryOne<{ total_spend: string }>(`
      SELECT COALESCE(SUM(spend), 0)::text as total_spend
      FROM advertising_daily
      WHERE date >= $1
        AND date <= $2
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
      AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
    `, [startDate, endDate])
    cogs = parseFloat(cogsData?.total_cogs || '0')
  } catch (e) {
    console.log('COGS query error:', e)
  }

  return {
    sales: totalSales,
    orders: orderCount,
    units: totalUnits,
    refunds: 0,
    refundCount,
    adCost,
    amazonFees: actualFees + estimatedFees,
    amazonFeesEstimated: estimatedFees,
    cogs,
    feeEstimationRate,
    debug,
  }
}

// Helper to get date range for a period type
// Takes nowInPST (current time in PST) and returns start/end in UTC for database queries
function getDateRangeForPeriod(period: string, nowInPST: Date): { start: Date; end: Date; label: string } {
  // Helper to convert PST time to UTC for database queries
  const toUTC = (date: Date) => fromZonedTime(date, AMAZON_TIMEZONE)

  switch (period) {
    case 'today':
      return { start: toUTC(startOfDay(nowInPST)), end: toUTC(endOfDay(nowInPST)), label: format(nowInPST, 'd MMMM yyyy') }
    case 'yesterday':
      return { start: toUTC(startOfDay(subDays(nowInPST, 1))), end: toUTC(endOfDay(subDays(nowInPST, 1))), label: format(subDays(nowInPST, 1), 'd MMMM yyyy') }
    case '2daysAgo':
      return { start: toUTC(startOfDay(subDays(nowInPST, 2))), end: toUTC(endOfDay(subDays(nowInPST, 2))), label: format(subDays(nowInPST, 2), 'd MMMM yyyy') }
    case '3daysAgo':
      return { start: toUTC(startOfDay(subDays(nowInPST, 3))), end: toUTC(endOfDay(subDays(nowInPST, 3))), label: format(subDays(nowInPST, 3), 'd MMMM yyyy') }
    case '7days':
      return { start: toUTC(startOfDay(subDays(nowInPST, 6))), end: toUTC(endOfDay(nowInPST)), label: `${format(subDays(nowInPST, 6), 'd')}-${format(nowInPST, 'd MMMM yyyy')}` }
    case '14days':
      return { start: toUTC(startOfDay(subDays(nowInPST, 13))), end: toUTC(endOfDay(nowInPST)), label: `${format(subDays(nowInPST, 13), 'd')}-${format(nowInPST, 'd MMMM yyyy')}` }
    case '30days':
      return { start: toUTC(startOfDay(subDays(nowInPST, 29))), end: toUTC(endOfDay(nowInPST)), label: `${format(subDays(nowInPST, 29), 'd')}-${format(nowInPST, 'd MMMM yyyy')}` }
    case 'mtd':
      return { start: toUTC(startOfMonth(nowInPST)), end: toUTC(endOfDay(nowInPST)), label: `${format(startOfMonth(nowInPST), 'd')}-${format(nowInPST, 'd MMMM yyyy')}` }
    case 'lastMonth':
      return { start: toUTC(startOfMonth(subMonths(nowInPST, 1))), end: toUTC(endOfMonth(subMonths(nowInPST, 1))), label: `${format(startOfMonth(subMonths(nowInPST, 1)), 'd')}-${format(endOfMonth(subMonths(nowInPST, 1)), 'd MMMM yyyy')}` }
    default:
      return { start: toUTC(startOfDay(subDays(nowInPST, 1))), end: toUTC(endOfDay(subDays(nowInPST, 1))), label: format(subDays(nowInPST, 1), 'd MMMM yyyy') }
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

    // Calculate derived metrics
    const calculateMetrics = (data: any) => {
      const grossProfit = data.sales - data.amazonFees - data.cogs
      const netProfit = grossProfit - data.adCost - data.refunds
      const estPayout = data.sales - data.amazonFees - data.refunds
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

      response.debug = {
        serverTimeUTC: nowUTC.toISOString(),
        serverTimePST: format(nowInPST, 'yyyy-MM-dd HH:mm:ss'),
        timezone: AMAZON_TIMEZONE,
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
