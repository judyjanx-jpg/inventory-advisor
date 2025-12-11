// app/api/profit/periods/route.ts
// Returns profit summaries for each time period (Today, Yesterday, MTD, etc.)
// Uses the shared profit engine for Sellerboard-level accuracy

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import {
  getPeriodData,
  getPeriodDataLightweight,
  precomputePriceLookups,
  calculateMetrics,
  getDateRangeForPeriod,
  getCustomDateRange,
  AMAZON_TIMEZONE,
  nowInPST,
  pstToUTC,
  type PeriodData,
  type DerivedMetrics,
} from '@/lib/profit/engine'
import {
  startOfDay,
  startOfMonth,
  endOfMonth,
  endOfDay,
  addDays,
  format,
} from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

export const dynamic = 'force-dynamic'

interface PeriodSummary extends PeriodData, DerivedMetrics {
  period: string
  dateRange: string
  salesChange?: number
  netProfitChange?: number
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

    // Get current time in PST for Amazon day boundary calculations
    const currentPST = nowInPST()
    const monthStartPST = startOfMonth(currentPST)
    const monthStartUTC = pstToUTC(monthStartPST)

    // Handle custom date range
    if (preset === 'custom') {
      const startDateParam = searchParams.get('startDate')
      const endDateParam = searchParams.get('endDate')

      if (!startDateParam || !endDateParam) {
        return NextResponse.json(
          { error: 'startDate and endDate are required for custom preset', periods: [] },
          { status: 400 }
        )
      }

      const { start, end, label } = getCustomDateRange(startDateParam, endDateParam)
      const data = await getPeriodData(start, end, includeDebug)
      const metrics = calculateMetrics(data)

      return NextResponse.json({
        periods: [{
          period: 'custom',
          dateRange: label,
          ...data,
          ...metrics,
        }],
        preset: 'custom',
      })
    }

    // Get which periods to fetch based on preset
    const periodsToFetch = periodPresets[preset] || periodPresets.default

    // Pre-compute price lookups once to avoid running heavy CTEs for each period
    // This is the key optimization to prevent PostgreSQL shared memory exhaustion
    const priceLookups = await precomputePriceLookups()

    // Build period data for each requested period
    // Process sequentially using lightweight queries that reuse price lookups
    const periodsData: Array<PeriodData & { period: string; dateRange: string }> = []
    for (const period of periodsToFetch) {
      const range = getDateRangeForPeriod(period)

      // Special handling for forecast - it's based on MTD extrapolated
      if (period === 'forecast') {
        const mtdData = await getPeriodDataLightweight(monthStartUTC, pstToUTC(endOfDay(currentPST)), priceLookups, includeDebug)
        const daysInMonth = endOfMonth(currentPST).getDate()
        const dayOfMonth = currentPST.getDate()
        const forecastMultiplier = daysInMonth / dayOfMonth

        periodsData.push({
          period: 'forecast',
          dateRange: `${format(monthStartPST, 'd')}-${format(endOfMonth(currentPST), 'd MMMM yyyy')}`,
          sales: mtdData.sales * forecastMultiplier,
          orders: Math.round(mtdData.orders * forecastMultiplier),
          lineItems: Math.round(mtdData.lineItems * forecastMultiplier),
          units: Math.round(mtdData.units * forecastMultiplier),
          promos: mtdData.promos * forecastMultiplier,
          refunds: mtdData.refunds * forecastMultiplier,
          refundCount: Math.round(mtdData.refundCount * forecastMultiplier),
          adCost: mtdData.adCost * forecastMultiplier,
          adCostSP: mtdData.adCostSP * forecastMultiplier,
          adCostSB: mtdData.adCostSB * forecastMultiplier,
          adCostSD: mtdData.adCostSD * forecastMultiplier,
          amazonFees: mtdData.amazonFees * forecastMultiplier,
          amazonFeesEstimated: mtdData.amazonFeesEstimated * forecastMultiplier,
          cogs: mtdData.cogs * forecastMultiplier,
          feeEstimationRate: mtdData.feeEstimationRate,
          debug: mtdData.debug,
        })
      } else {
        const data = await getPeriodDataLightweight(range.start, range.end, priceLookups, includeDebug)
        periodsData.push({
          period,
          dateRange: range.label,
          ...data,
        })
      }
    }

    // Build the final periods array with metrics
    const periods: PeriodSummary[] = periodsData.map((periodData, index) => {
      const metrics = calculateMetrics(periodData as PeriodData)

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
        lineItems: periodData.lineItems,
        units: periodData.units,
        promos: periodData.promos || 0,
        refunds: periodData.refunds || 0,
        refundCount: periodData.refundCount,
        adCost: periodData.adCost,
        adCostSP: periodData.adCostSP || 0,
        adCostSB: periodData.adCostSB || 0,
        adCostSD: periodData.adCostSD || 0,
        amazonFees: periodData.amazonFees,
        amazonFeesEstimated: periodData.amazonFeesEstimated,
        cogs: periodData.cogs,
        feeEstimationRate: periodData.feeEstimationRate,
        debug: periodData.debug,
        ...metrics,
        salesChange,
      }
    })

    // Build response with optional debug info
    const response: Record<string, unknown> = { periods, preset }

    if (includeDebug) {
      // Build date range info for each period
      const dateRanges: Record<string, { start: string; end: string; startPST: string; endPST: string }> = {}
      periodsToFetch.forEach(period => {
        const range = getDateRangeForPeriod(period)
        dateRanges[period] = {
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          startPST: format(toZonedTime(range.start, AMAZON_TIMEZONE), 'yyyy-MM-dd HH:mm:ss'),
          endPST: format(toZonedTime(range.end, AMAZON_TIMEZONE), 'yyyy-MM-dd HH:mm:ss'),
        }
      })

      // Get order status breakdown for today (helps verify shipped-only filter is working)
      const todayRange = getDateRangeForPeriod('today')
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
        serverTimeUTC: new Date().toISOString(),
        serverTimePST: format(currentPST, 'yyyy-MM-dd HH:mm:ss'),
        timezone: AMAZON_TIMEZONE,
        note: 'Profit calculations exclude Cancelled/Canceled orders',
        todayOrderStatusBreakdown: statusBreakdown.map(s => ({
          status: s.status,
          orders: parseInt(s.order_count),
          units: parseInt(s.unit_count),
          includedInProfit: s.status !== 'Cancelled' && s.status !== 'Canceled',
        })),
        dateRanges,
        periodDebug: periodsData.reduce((acc: Record<string, unknown>, p) => {
          acc[p.period] = (p as PeriodData).debug
          return acc
        }, {}),
      }
    }

    return NextResponse.json(response)

  } catch (error: unknown) {
    const err = error as Error
    console.error('Error fetching period data:', err)
    console.error('Error stack:', err.stack)
    return NextResponse.json(
      {
        error: err.message || 'Unknown error',
        errorDetails: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        periods: []
      },
      { status: 500 }
    )
  }
}
