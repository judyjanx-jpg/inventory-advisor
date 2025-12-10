import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { subDays, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, format } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const AMAZON_TIMEZONE = 'America/Los_Angeles'

type PeriodType = '4days' | '7days' | 'week' | 'month'

async function calculateProfitForRange(startDate: Date, endDate: Date): Promise<number> {
  const result = await query<{ profit: number }>(`
    SELECT COALESCE(
      SUM(
        (item_price + shipping_price + gift_wrap_price) * quantity 
        - (referral_fee + fba_fee + other_fees + amazon_fees)
        - COALESCE(p.cost, 0) * oi.quantity
      ), 
      0
    ) as profit
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN products p ON oi.master_sku = p.sku
    WHERE o.purchase_date >= $1 AND o.purchase_date < $2
      AND o.status != 'Cancelled'
  `, [startDate.toISOString(), endDate.toISOString()])

  return Number(result[0]?.profit || 0)
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = (searchParams.get('type') || '4days') as PeriodType
    
    const now = new Date()
    const nowInPST = toZonedTime(now, AMAZON_TIMEZONE)
    const toUTC = (date: Date) => fromZonedTime(date, AMAZON_TIMEZONE)
    
    let periods: Array<{ label: string; date: string; profit: number; change: number | null }> = []

    if (type === '4days' || type === '7days') {
      const numDays = type === '4days' ? 4 : 7
      
      for (let i = 0; i < numDays; i++) {
        const dayStart = toUTC(startOfDay(subDays(nowInPST, i)))
        const dayEnd = toUTC(startOfDay(subDays(nowInPST, i - 1)))
        const profit = await calculateProfitForRange(dayStart, dayEnd)
        
        const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`
        
        periods.push({
          label,
          date: format(subDays(nowInPST, i), 'yyyy-MM-dd'),
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
      const thisWeekStart = toUTC(startOfWeek(nowInPST, { weekStartsOn: 0 }))
      const thisWeekEnd = toUTC(startOfDay(addDays(nowInPST, 1))) // Up to now
      const lastWeekStart = toUTC(startOfDay(subDays(startOfWeek(nowInPST, { weekStartsOn: 0 }), 7)))
      const lastWeekEnd = thisWeekStart

      const thisWeekProfit = await calculateProfitForRange(thisWeekStart, thisWeekEnd)
      const lastWeekProfit = await calculateProfitForRange(lastWeekStart, lastWeekEnd)

      let change: number | null = null
      if (lastWeekProfit !== 0) {
        change = Math.round(((thisWeekProfit - lastWeekProfit) / Math.abs(lastWeekProfit)) * 1000) / 10
      }

      periods = [
        { 
          label: 'This week', 
          date: format(startOfWeek(nowInPST, { weekStartsOn: 0 }), 'yyyy-MM-dd'), 
          profit: Math.round(thisWeekProfit * 100) / 100, 
          change 
        },
        { 
          label: 'Last week', 
          date: format(subDays(startOfWeek(nowInPST, { weekStartsOn: 0 }), 7), 'yyyy-MM-dd'), 
          profit: Math.round(lastWeekProfit * 100) / 100, 
          change: null 
        }
      ]
    } else if (type === 'month') {
      // This month vs last month
      const thisMonthStart = toUTC(startOfMonth(nowInPST))
      const thisMonthEnd = toUTC(startOfDay(addDays(nowInPST, 1))) // Up to now
      const lastMonthStart = toUTC(startOfMonth(subDays(startOfMonth(nowInPST), 1)))
      const lastMonthEnd = thisMonthStart

      const thisMonthProfit = await calculateProfitForRange(thisMonthStart, thisMonthEnd)
      const lastMonthProfit = await calculateProfitForRange(lastMonthStart, lastMonthEnd)

      let change: number | null = null
      if (lastMonthProfit !== 0) {
        change = Math.round(((thisMonthProfit - lastMonthProfit) / Math.abs(lastMonthProfit)) * 1000) / 10
      }

      periods = [
        { 
          label: 'This month', 
          date: format(startOfMonth(nowInPST), 'yyyy-MM-dd'), 
          profit: Math.round(thisMonthProfit * 100) / 100, 
          change 
        },
        { 
          label: 'Last month', 
          date: format(startOfMonth(subDays(startOfMonth(nowInPST), 1)), 'yyyy-MM-dd'), 
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
