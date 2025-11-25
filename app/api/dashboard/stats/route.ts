import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get date range (last 30 days)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    // Calculate total revenue and profit from daily summary
    const dailySummaries = await prisma.dailySummary.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    })

    const totalRevenue = dailySummaries.reduce(
      (sum, day) => sum + Number(day.totalRevenue),
      0
    )
    const totalProfit = dailySummaries.reduce(
      (sum, day) => sum + Number(day.totalProfit),
      0
    )
    const totalUnitsSold = dailySummaries.reduce(
      (sum, day) => sum + day.unitsSold,
      0
    )
    const totalOrders = dailySummaries.reduce(
      (sum, day) => sum + day.ordersCount,
      0
    )

    const profitMargin = totalRevenue > 0 
      ? (totalProfit / totalRevenue) * 100 
      : 0

    // Get low stock alerts
    const lowStockProducts = await prisma.inventoryLevel.findMany({
      where: {
        OR: [
          { fbaAvailable: { lt: 50 } },
          { warehouseAvailable: { lt: 100 } },
        ],
      },
      include: {
        product: true,
      },
      take: 10,
    })

    return NextResponse.json({
      totalRevenue,
      totalProfit,
      profitMargin: Number(profitMargin.toFixed(2)),
      unitsSold: totalUnitsSold,
      ordersCount: totalOrders,
      lowStockItems: lowStockProducts.length,
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}

