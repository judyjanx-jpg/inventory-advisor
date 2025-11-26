import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const masterSku = searchParams.get('masterSku')
    const channel = searchParams.get('channel')
    // Support pagination - default to 5000, allow up to 10000
    const limit = Math.min(parseInt(searchParams.get('limit') || '5000'), 10000)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build where clause for DailyProfit (where sales data is actually stored)
    const where: any = {}
    
    if (startDate || endDate) {
      where.date = {}
      if (startDate) {
        where.date.gte = new Date(startDate)
      }
      if (endDate) {
        where.date.lte = new Date(endDate)
      }
    }

    if (masterSku) {
      where.masterSku = masterSku
    }

    // Query DailyProfit table (where sales sync actually saves data)
    const dailyProfits = await prisma.dailyProfit.findMany({
      where,
      include: {
        product: {
          select: {
            title: true,
            sku: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
      take: limit,
      skip: offset,
    })

    // Transform to match SalesHistory format for frontend
    const salesHistory = dailyProfits.map(dp => ({
      id: dp.id,
      date: dp.date,
      masterSku: dp.masterSku,
      channel: 'amazon_us', // Default channel since DailyProfit doesn't have channel
      channelSku: dp.masterSku,
      unitsSold: dp.unitsSold,
      revenue: dp.revenue,
      fees: dp.amazonFees || 0,
      skuMapping: {
        product: dp.product,
      },
    }))

    // Calculate summary stats
    const summary = await prisma.dailyProfit.aggregate({
      where,
      _sum: {
        unitsSold: true,
        revenue: true,
        amazonFees: true,
      },
      _count: {
        id: true,
      },
    })

    return NextResponse.json({
      data: salesHistory,
      pagination: {
        limit,
        offset,
        total: summary._count.id,
        hasMore: offset + limit < summary._count.id,
      },
      summary: {
        totalRecords: summary._count.id,
        totalUnitsSold: Number(summary._sum.unitsSold || 0),
        totalRevenue: Number(summary._sum.revenue || 0),
        totalFees: Number(summary._sum.amazonFees || 0),
      },
    })
  } catch (error: any) {
    console.error('Error fetching sales history:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sales history' },
      { status: 500 }
    )
  }
}

