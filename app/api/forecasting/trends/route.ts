/**
 * Forecasting Trends API
 * 
 * GET /api/forecasting/trends?sku=SKU123
 * 
 * Returns monthly sales data for current year vs previous year
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku')

    if (!sku) {
      return NextResponse.json({ success: false, error: 'SKU required' }, { status: 400 })
    }

    const now = new Date()
    const currentYear = now.getFullYear()
    const previousYear = currentYear - 1

    // Get sales data for both years
    const startOfPreviousYear = new Date(previousYear, 0, 1)
    const endOfCurrentYear = new Date(currentYear, 11, 31)

    const salesData = await prisma.orderItem.findMany({
      where: {
        masterSku: sku,
        order: {
          purchaseDate: {
            gte: startOfPreviousYear,
            lte: endOfCurrentYear,
          },
          status: { notIn: ['Cancelled', 'Pending'] },
        },
      },
      select: {
        quantity: true,
        order: {
          select: {
            purchaseDate: true,
          },
        },
      },
    })

    // Aggregate by month
    const monthlyData: Record<string, { currentYear: number; previousYear: number }> = {}
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    months.forEach(month => {
      monthlyData[month] = { currentYear: 0, previousYear: 0 }
    })

    for (const item of salesData) {
      const date = new Date(item.order.purchaseDate)
      const year = date.getFullYear()
      const monthIndex = date.getMonth()
      const monthName = months[monthIndex]
      const qty = item.quantity || 0

      if (year === currentYear) {
        monthlyData[monthName].currentYear += qty
      } else if (year === previousYear) {
        monthlyData[monthName].previousYear += qty
      }
    }

    // Convert to array format for chart
    const trends = months.map(month => ({
      month,
      currentYear: monthlyData[month].currentYear,
      previousYear: monthlyData[month].previousYear,
      change: monthlyData[month].previousYear > 0 
        ? ((monthlyData[month].currentYear - monthlyData[month].previousYear) / monthlyData[month].previousYear * 100)
        : 0,
    }))

    // Calculate velocity changes
    const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const days14Ago = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const days60Ago = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    const [sales7d, salesPrev7d, sales30d, salesPrev30d] = await Promise.all([
      prisma.orderItem.aggregate({
        _sum: { quantity: true },
        where: {
          masterSku: sku,
          order: {
            purchaseDate: { gte: days7Ago },
            status: { notIn: ['Cancelled', 'Pending'] },
          },
        },
      }),
      prisma.orderItem.aggregate({
        _sum: { quantity: true },
        where: {
          masterSku: sku,
          order: {
            purchaseDate: { gte: days14Ago, lt: days7Ago },
            status: { notIn: ['Cancelled', 'Pending'] },
          },
        },
      }),
      prisma.orderItem.aggregate({
        _sum: { quantity: true },
        where: {
          masterSku: sku,
          order: {
            purchaseDate: { gte: days30Ago },
            status: { notIn: ['Cancelled', 'Pending'] },
          },
        },
      }),
      prisma.orderItem.aggregate({
        _sum: { quantity: true },
        where: {
          masterSku: sku,
          order: {
            purchaseDate: { gte: days60Ago, lt: days30Ago },
            status: { notIn: ['Cancelled', 'Pending'] },
          },
        },
      }),
    ])

    const current7d = sales7d._sum.quantity || 0
    const prev7d = salesPrev7d._sum.quantity || 0
    const current30d = sales30d._sum.quantity || 0
    const prev30d = salesPrev30d._sum.quantity || 0

    const velocityChange7d = prev7d > 0 ? ((current7d - prev7d) / prev7d * 100) : 0
    const velocityChange30d = prev30d > 0 ? ((current30d - prev30d) / prev30d * 100) : 0

    return NextResponse.json({
      success: true,
      trends,
      velocityChanges: {
        change7d: velocityChange7d,
        change30d: velocityChange30d,
        current7dUnits: current7d,
        prev7dUnits: prev7d,
        current30dUnits: current30d,
        prev30dUnits: prev30d,
      },
      summary: {
        currentYearTotal: Object.values(monthlyData).reduce((sum, m) => sum + m.currentYear, 0),
        previousYearTotal: Object.values(monthlyData).reduce((sum, m) => sum + m.previousYear, 0),
      },
    })

  } catch (error: any) {
    console.error('Trends API error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
