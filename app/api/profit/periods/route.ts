// app/api/profit/periods/route.ts
// Returns profit summaries for each time period (Today, Yesterday, MTD, etc.)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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

export const dynamic = 'force-dynamic'

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
}

async function getPeriodData(startDate: Date, endDate: Date): Promise<{
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
}> {
  // Get order items with fee data directly from OrderItem table
  // This is where the financial-events sync stores the fees
  const orderItems = await prisma.$queryRaw<Array<{
    item_price: string
    quantity: number
    amazon_fees: string
  }>>`
    SELECT
      oi.item_price::text,
      oi.quantity,
      oi.amazon_fees::text
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.purchase_date >= ${startDate}
      AND o.purchase_date <= ${endDate}
      AND o.status != 'Cancelled'
  `

  // Calculate fees with estimation for items missing actual fees
  let totalSales = 0
  let totalUnits = 0
  let actualFees = 0
  let estimatedFees = 0
  let itemsWithActualFees = 0
  let itemsWithEstimatedFees = 0

  for (const item of orderItems) {
    const itemPrice = parseFloat(item.item_price || '0')
    const quantity = item.quantity || 1
    const amazonFees = parseFloat(item.amazon_fees || '0')

    totalSales += itemPrice
    totalUnits += quantity

    if (amazonFees > 0) {
      // Use actual fees from synced financial events
      actualFees += amazonFees
      itemsWithActualFees++
    } else if (itemPrice > 0) {
      // Estimate fees for items that haven't synced yet
      const estimate = getQuickFeeEstimate(itemPrice, quantity)
      estimatedFees += estimate.totalFees
      itemsWithEstimatedFees++
    }
  }

  const totalItems = orderItems.length
  const feeEstimationRate = totalItems > 0 ? (itemsWithEstimatedFees / totalItems) * 100 : 0

  // Get unique order count
  const orderCount = await prisma.order.count({
    where: {
      purchaseDate: {
        gte: startDate,
        lte: endDate,
      },
      status: {
        not: 'Cancelled',
      },
    },
  })

  // Get refund data
  let refundCount = 0
  try {
    const refundData = await prisma.return.aggregate({
      where: {
        returnDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        quantity: true,
      },
      _count: true,
    })
    refundCount = Number(refundData._sum.quantity || 0)
  } catch (e) {
    // Returns table might not have data
  }

  // Get ad spend from advertising_daily (if connected)
  let adCost = 0
  try {
    const adData = await prisma.advertisingDaily.aggregate({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        spend: true,
      },
    })
    adCost = Number(adData._sum.spend || 0)
  } catch {
    // Ads table might not exist yet
  }

  // Calculate COGS - use 'cost' column from products table
  let cogs = 0
  try {
    const cogsData = await prisma.$queryRaw<{ total_cogs: number }[]>`
      SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost, 0)), 0) as total_cogs
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE o.purchase_date >= ${startDate}
      AND o.purchase_date <= ${endDate}
      AND o.status != 'Cancelled'
    `
    cogs = Number(cogsData[0]?.total_cogs || 0)
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
  }
}

export async function GET() {
  try {
    const now = new Date()
    const today = startOfDay(now)
    const yesterday = startOfDay(subDays(now, 1))
    const monthStart = startOfMonth(now)
    const lastMonthStart = startOfMonth(subMonths(now, 1))
    const lastMonthEnd = endOfMonth(subMonths(now, 1))

    // Fetch data for each period
    const [todayData, yesterdayData, mtdData, lastMonthData] = await Promise.all([
      getPeriodData(today, endOfDay(now)),
      getPeriodData(yesterday, endOfDay(subDays(now, 1))),
      getPeriodData(monthStart, endOfDay(now)),
      getPeriodData(lastMonthStart, lastMonthEnd),
    ])

    // Calculate derived metrics
    const calculateMetrics = (data: Awaited<ReturnType<typeof getPeriodData>>) => {
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

    const todayMetrics = calculateMetrics(todayData)
    const yesterdayMetrics = calculateMetrics(yesterdayData)
    const mtdMetrics = calculateMetrics(mtdData)
    const lastMonthMetrics = calculateMetrics(lastMonthData)

    // Build forecast based on MTD data
    const daysInMonth = endOfMonth(now).getDate()
    const dayOfMonth = now.getDate()
    const forecastMultiplier = daysInMonth / dayOfMonth

    const forecastData = {
      sales: mtdData.sales * forecastMultiplier,
      orders: Math.round(mtdData.orders * forecastMultiplier),
      units: Math.round(mtdData.units * forecastMultiplier),
      refunds: mtdData.refunds * forecastMultiplier,
      refundCount: Math.round(mtdData.refundCount * forecastMultiplier),
      adCost: mtdData.adCost * forecastMultiplier,
      amazonFees: mtdData.amazonFees * forecastMultiplier,
      amazonFeesEstimated: mtdData.amazonFeesEstimated * forecastMultiplier,
      cogs: mtdData.cogs * forecastMultiplier,
      feeEstimationRate: mtdData.feeEstimationRate,  // Keep same rate for forecast
    }
    const forecastMetrics = calculateMetrics(forecastData)

    // Calculate changes
    const salesChangeToday = yesterdayData.sales > 0 
      ? ((todayData.sales - yesterdayData.sales) / yesterdayData.sales) * 100 
      : undefined

    const periods: PeriodSummary[] = [
      {
        period: 'today',
        dateRange: format(today, 'd MMMM yyyy'),
        ...todayData,
        ...todayMetrics,
        salesChange: salesChangeToday,
      },
      {
        period: 'yesterday',
        dateRange: format(yesterday, 'd MMMM yyyy'),
        ...yesterdayData,
        ...yesterdayMetrics,
      },
      {
        period: 'mtd',
        dateRange: `${format(monthStart, 'd')}-${format(now, 'd MMMM yyyy')}`,
        ...mtdData,
        ...mtdMetrics,
        salesChange: lastMonthData.sales > 0 
          ? ((mtdData.sales - lastMonthData.sales) / lastMonthData.sales) * 100 
          : undefined,
      },
      {
        period: 'forecast',
        dateRange: `${format(monthStart, 'd')}-${format(endOfMonth(now), 'd MMMM yyyy')}`,
        ...forecastData,
        ...forecastMetrics,
        salesChange: lastMonthData.sales > 0 
          ? ((forecastData.sales - lastMonthData.sales) / lastMonthData.sales) * 100 
          : undefined,
      },
      {
        period: 'lastMonth',
        dateRange: `${format(lastMonthStart, 'd')}-${format(lastMonthEnd, 'd MMMM yyyy')}`,
        ...lastMonthData,
        ...lastMonthMetrics,
      },
    ]

    return NextResponse.json({ periods })

  } catch (error: any) {
    console.error('Error fetching period data:', error)
    return NextResponse.json(
      { error: error.message, periods: [] },
      { status: 500 }
    )
  }
}
