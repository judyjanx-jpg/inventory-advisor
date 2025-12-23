import { NextResponse } from 'next/server'
import {
  getProfitSummary,
  getDateRangeForPeriod,
  nowInPST,
  pstToUTC,
} from '@/lib/profit/engine'
import { startOfDay, subDays } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 30-day profit and units
    const { start, end } = getDateRangeForPeriod('30days')
    const thirtyDayData = await getProfitSummary(start, end, false)
    
    // Yesterday's profit and units
    const currentPST = nowInPST()
    const yesterdayStart = pstToUTC(startOfDay(subDays(currentPST, 1)))
    const yesterdayEnd = pstToUTC(startOfDay(currentPST))
    const yesterdayData = await getProfitSummary(yesterdayStart, yesterdayEnd, false)
    
    // Same day last year (yesterday's date from one year ago)
    // Using 365 days to get to the same calendar date last year
    const yesterdayDate = subDays(currentPST, 1)
    const lastYearStart = pstToUTC(startOfDay(subDays(yesterdayDate, 365)))
    const lastYearEnd = pstToUTC(startOfDay(subDays(yesterdayDate, 364)))
    const lastYearData = await getProfitSummary(lastYearStart, lastYearEnd, false)
    
    // Calculate % change from same day last year (for profit)
    const profitChangePercent = lastYearData.netProfit !== 0
      ? ((yesterdayData.netProfit - lastYearData.netProfit) / Math.abs(lastYearData.netProfit)) * 100
      : null
    
    return NextResponse.json({
      success: true,
      yesterday: {
        profit: Math.round(yesterdayData.netProfit * 100) / 100,
        units: yesterdayData.units
      },
      thirtyDay: {
        profit: Math.round(thirtyDayData.netProfit * 100) / 100,
        units: thirtyDayData.units
      },
      lastYear: {
        profit: Math.round(lastYearData.netProfit * 100) / 100,
        profitChangePercent: profitChangePercent !== null ? Math.round(profitChangePercent * 10) / 10 : null
      }
    })
  } catch (error) {
    console.error('Profit API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate profit data'
    }, { status: 500 })
  }
}

