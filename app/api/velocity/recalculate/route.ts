import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Recalculate sales velocity for all products
 * POST /api/velocity/recalculate
 */
export async function POST() {
  try {
    const now = new Date()
    const days7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const days90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // Get all products
    const products = await prisma.product.findMany({
      where: {
        isHidden: false,
        // Only child products (not parents)
        OR: [
          { parentSku: { not: null } },
          {
            AND: [
              { isParent: false },
              { parentSku: null },
            ],
          },
        ],
      },
    })

    console.log(`Calculating velocity for ${products.length} products...`)

    // Check if we have any DailyProfit data at all
    const totalDailyProfitRecords = await prisma.dailyProfit.count()
    const recentDailyProfitRecords = await prisma.dailyProfit.count({
      where: {
        date: { gte: days30 },
      },
    })
    console.log(`DailyProfit records: ${totalDailyProfitRecords} total, ${recentDailyProfitRecords} in last 30 days`)

    let updated = 0
    let skipped = 0
    let zeroVelocity = 0

    for (const product of products) {
      try {
        // Calculate units sold in each period from DailyProfit
        const [sales7, sales30, sales90] = await Promise.all([
          prisma.dailyProfit.aggregate({
            where: {
              masterSku: product.sku,
              date: { gte: days7 },
            },
            _sum: {
              unitsSold: true,
            },
          }),
          prisma.dailyProfit.aggregate({
            where: {
              masterSku: product.sku,
              date: { gte: days30 },
            },
            _sum: {
              unitsSold: true,
            },
          }),
          prisma.dailyProfit.aggregate({
            where: {
              masterSku: product.sku,
              date: { gte: days90 },
            },
            _sum: {
              unitsSold: true,
            },
          }),
        ])

        const units7d = Number(sales7._sum.unitsSold || 0)
        const units30d = Number(sales30._sum.unitsSold || 0)
        const units90d = Number(sales90._sum.unitsSold || 0)
        
        const velocity7d = units7d / 7
        const velocity30d = units30d / 30
        const velocity90d = units90d / 90
        
        // Log first 10 products for debugging (including zeros)
        if (updated < 10) {
          console.log(`  ${product.sku}: 7d=${units7d} (${velocity7d.toFixed(2)}/day), 30d=${units30d} (${velocity30d.toFixed(2)}/day), 90d=${units90d} (${velocity90d.toFixed(2)}/day)`)
        }
        
        if (velocity7d === 0 && velocity30d === 0 && velocity90d === 0) {
          zeroVelocity++
        }

        // Calculate trend
        let trend: string | null = null
        let trendPercent: number | null = null
        if (velocity30d > 0 && velocity90d > 0) {
          trendPercent = ((velocity30d - velocity90d) / velocity90d) * 100
          if (trendPercent > 10) {
            trend = 'rising'
          } else if (trendPercent < -10) {
            trend = 'declining'
          } else {
            trend = 'stable'
          }
        }

        // Update or create velocity record
        await prisma.salesVelocity.upsert({
          where: { masterSku: product.sku },
          update: {
            velocity7d,
            velocity30d,
            velocity90d,
            trend,
            trendPercent: trendPercent ? Number(trendPercent.toFixed(2)) : null,
            lastCalculated: now,
          },
          create: {
            masterSku: product.sku,
            velocity7d,
            velocity30d,
            velocity90d,
            trend,
            trendPercent: trendPercent ? Number(trendPercent.toFixed(2)) : null,
            lastCalculated: now,
          },
        })

        updated++
      } catch (error: any) {
        console.error(`Error calculating velocity for ${product.sku}:`, error.message)
        skipped++
      }
    }

    console.log(`Velocity calculation complete: ${updated} updated, ${skipped} skipped, ${zeroVelocity} with zero velocity`)

    return NextResponse.json({
      success: true,
      message: `Velocity calculated for ${updated} products (${zeroVelocity} have zero velocity - no sales in last 90 days)`,
      updated,
      skipped,
      zeroVelocity,
      total: products.length,
      dailyProfitRecords: {
        total: totalDailyProfitRecords,
        last30Days: recentDailyProfitRecords,
      },
    })
  } catch (error: any) {
    console.error('Error recalculating velocity:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to recalculate velocity' },
      { status: 500 }
    )
  }
}

