// app/api/pricing/history/[sku]/route.ts
// API for fetching price history for a specific SKU

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const { sku } = await params

    // Get price history for last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const history = await prisma.priceHistory.findMany({
      where: {
        sku,
        createdAt: { gte: thirtyDaysAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    // Get scheduled steps
    const schedule = await prisma.priceSchedule.findMany({
      where: { sku },
      orderBy: { stepNumber: 'asc' }
    })

    // Format for chart
    const chartData = history.map(h => ({
      date: h.createdAt.toISOString(),
      price: Number(h.newPrice)
    })).reverse()

    // Add current price as last point if no recent history
    const product = await prisma.product.findUnique({
      where: { sku },
      select: { price: true }
    })
    
    if (product && (chartData.length === 0 || 
        new Date(chartData[chartData.length - 1].date).getTime() < Date.now() - 86400000)) {
      chartData.push({
        date: new Date().toISOString(),
        price: Number(product.price)
      })
    }

    return NextResponse.json({
      success: true,
      history: history.map(h => ({
        date: h.createdAt.toISOString(),
        oldPrice: Number(h.oldPrice),
        newPrice: Number(h.newPrice),
        triggeredBy: h.triggeredBy
      })),
      chartData,
      schedule: schedule.map(s => ({
        step: s.stepNumber,
        price: Number(s.targetPrice),
        scheduledFor: s.scheduledFor.toISOString(),
        status: s.status,
        appliedAt: s.appliedAt?.toISOString() || null
      }))
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

