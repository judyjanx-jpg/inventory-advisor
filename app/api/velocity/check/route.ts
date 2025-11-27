import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Check velocity for a specific SKU or all SKUs
 * GET /api/velocity/check?sku=XXX or GET /api/velocity/check
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku')

    if (sku) {
      // Check specific SKU
      const velocity = await prisma.salesVelocity.findUnique({
        where: { masterSku: sku },
      })

      // Also check DailyProfit data
      const now = new Date()
      const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      
      const sales30d = await prisma.dailyProfit.aggregate({
        where: {
          masterSku: sku,
          date: { gte: days30 },
        },
        _sum: {
          unitsSold: true,
        },
      })

      return NextResponse.json({
        sku,
        velocity,
        dailyProfit30d: {
          unitsSold: Number(sales30d._sum.unitsSold || 0),
          calculatedVelocity: Number(sales30d._sum.unitsSold || 0) / 30,
        },
      })
    } else {
      // Get all velocities with > 0
      const velocities = await prisma.salesVelocity.findMany({
        where: {
          OR: [
            { velocity7d: { gt: 0 } },
            { velocity30d: { gt: 0 } },
            { velocity90d: { gt: 0 } },
          ],
        },
        take: 20,
        orderBy: {
          velocity30d: 'desc',
        },
      })

      const totalWithVelocity = await prisma.salesVelocity.count({
        where: {
          velocity30d: { gt: 0 },
        },
      })

      return NextResponse.json({
        totalWithVelocity,
        sample: velocities,
      })
    }
  } catch (error: any) {
    console.error('Error checking velocity:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check velocity' },
      { status: 500 }
    )
  }
}

