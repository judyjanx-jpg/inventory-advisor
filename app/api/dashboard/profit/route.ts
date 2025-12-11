// app/api/dashboard/profit/route.ts
// Returns profit periods for the dashboard (4days, 7days, week, month)
// Uses the shared profit engine for Sellerboard-level accuracy

import { NextRequest, NextResponse } from 'next/server'
import {
  getNetProfitForRange,
  getDateRangeForPeriod,
  nowInPST,
  pstToUTC,
  AMAZON_TIMEZONE,
} from '@/lib/profit/engine'
import {
  subDays,
  startOfDay,
  startOfWeek,
  addDays,
  startOfMonth,
  format,
} from 'date-fns'

type PeriodType = '4days' | '7days' | 'week' | 'month'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = (searchParams.get('type') || '4days') as PeriodType

    const currentPST = nowInPST()

    let periods: Array<{ label: string; date: string; profit: number; change: number | null }> = []

    if (type === '4days' || type === '7days') {
      const numDays = type === '4days' ? 4 : 7

      for (let i = 0; i < numDays; i++) {
        const dayStart = pstToUTC(startOfDay(subDays(currentPST, i)))
        const dayEnd = pstToUTC(startOfDay(subDays(currentPST, i - 1)))
        const profit = await getNetProfitForRange(dayStart, dayEnd)

        const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`

        periods.push({
          label,
          date: format(subDays(currentPST, i), 'yyyy-MM-dd'),
          profit: Math.round(profit * 100) / 100,
          change: null
        })
      }

      // Calculate percentage changes
      for (let i = 0; i < periods.length - 1; i++) {
        const current = periods[i].profit
        const previous = periods[i + 1].profit
        if (previous !== 0) {
          periods[i].change = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
        }
      }
    } else if (type === 'week') {
      // This week vs last week
      const thisWeekStart = pstToUTC(startOfWeek(currentPST, { weekStartsOn: 0 }))
      const thisWeekEnd = pstToUTC(startOfDay(addDays(currentPST, 1))) // Up to now
      const lastWeekStart = pstToUTC(startOfDay(subDays(startOfWeek(currentPST, { weekStartsOn: 0 }), 7)))
      const lastWeekEnd = thisWeekStart

      const thisWeekProfit = await getNetProfitForRange(thisWeekStart, thisWeekEnd)
      const lastWeekProfit = await getNetProfitForRange(lastWeekStart, lastWeekEnd)

      let change: number | null = null
      if (lastWeekProfit !== 0) {
        change = Math.round(((thisWeekProfit - lastWeekProfit) / Math.abs(lastWeekProfit)) * 1000) / 10
      }

      periods = [
        {
          label: 'This week',
          date: format(startOfWeek(currentPST, { weekStartsOn: 0 }), 'yyyy-MM-dd'),
          profit: Math.round(thisWeekProfit * 100) / 100,
          change
        },
        {
          label: 'Last week',
          date: format(subDays(startOfWeek(currentPST, { weekStartsOn: 0 }), 7), 'yyyy-MM-dd'),
          profit: Math.round(lastWeekProfit * 100) / 100,
          change: null
        }
      ]
    } else if (type === 'month') {
      // This month vs last month
      const thisMonthStart = pstToUTC(startOfMonth(currentPST))
      const thisMonthEnd = pstToUTC(startOfDay(addDays(currentPST, 1))) // Up to now
      const lastMonthStart = pstToUTC(startOfMonth(subDays(startOfMonth(currentPST), 1)))
      const lastMonthEnd = thisMonthStart

      const thisMonthProfit = await getNetProfitForRange(thisMonthStart, thisMonthEnd)
      const lastMonthProfit = await getNetProfitForRange(lastMonthStart, lastMonthEnd)

      let change: number | null = null
      if (lastMonthProfit !== 0) {
        change = Math.round(((thisMonthProfit - lastMonthProfit) / Math.abs(lastMonthProfit)) * 1000) / 10
      }

      periods = [
        {
          label: 'This month',
          date: format(startOfMonth(currentPST), 'yyyy-MM-dd'),
          profit: Math.round(thisMonthProfit * 100) / 100,
          change
        },
        {
          label: 'Last month',
          date: format(startOfMonth(subDays(startOfMonth(currentPST), 1)), 'yyyy-MM-dd'),
          profit: Math.round(lastMonthProfit * 100) / 100,
          change: null
        }
      ]
    }

    return NextResponse.json({
      success: true,
      periods
    })
  } catch (error) {
    console.error('Profit API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate profit'
    }, { status: 500 })
  }
}
