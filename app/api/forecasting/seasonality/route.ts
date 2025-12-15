/**
 * Seasonality Management API
 *
 * Endpoints for managing seasonal events and patterns
 */

import { NextResponse } from 'next/server'
import {
  detectSeasonality,
  learnSeasonalMultipliers,
  detectNewSeasonalPatterns,
  createSeasonalEvent,
  updateSkuEventMultiplier,
  getSeasonalityMultiplierForDate,
} from '@/lib/forecasting'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const masterSku = searchParams.get('sku')

    switch (action) {
      case 'events':
        // Get all seasonal events
        const events = await prisma.seasonalEvent.findMany({
          orderBy: { startMonth: 'asc' },
        })

        return NextResponse.json({
          success: true,
          data: events.map((e) => ({
            ...e,
            baseMultiplier: Number(e.baseMultiplier),
            learnedMultiplier: e.learnedMultiplier ? Number(e.learnedMultiplier) : null,
            skuMultipliers: e.skuMultipliers ? JSON.parse(e.skuMultipliers) : {},
          })),
        })

      case 'detect':
        if (!masterSku) {
          return NextResponse.json(
            { success: false, error: 'SKU is required' },
            { status: 400 }
          )
        }

        const salesData = await getSalesData(masterSku)
        const seasonality = await detectSeasonality(masterSku, salesData)

        return NextResponse.json({
          success: true,
          data: seasonality,
        })

      case 'detect-new-patterns':
        // Detect new seasonal patterns across all SKUs
        const allSalesData = await getAllSalesData()
        const newPatterns = await detectNewSeasonalPatterns(allSalesData)

        return NextResponse.json({
          success: true,
          data: newPatterns,
        })

      case 'multiplier':
        if (!masterSku) {
          return NextResponse.json(
            { success: false, error: 'SKU is required' },
            { status: 400 }
          )
        }

        const date = searchParams.get('date')
          ? new Date(searchParams.get('date')!)
          : new Date()

        const multiplierInfo = await getSeasonalityMultiplierForDate(masterSku, date)

        return NextResponse.json({
          success: true,
          data: multiplierInfo,
        })

      case 'upcoming':
        // Get upcoming seasonal events
        const today = new Date()
        const upcomingEvents = await prisma.seasonalEvent.findMany({
          where: { isActive: true },
        })

        const upcoming = upcomingEvents
          .map((event) => {
            let eventDate = new Date(
              today.getFullYear(),
              event.startMonth - 1,
              event.startDay
            )

            if (eventDate < today) {
              eventDate = new Date(
                today.getFullYear() + 1,
                event.startMonth - 1,
                event.startDay
              )
            }

            const daysUntil = Math.ceil(
              (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            )

            return {
              ...event,
              baseMultiplier: Number(event.baseMultiplier),
              learnedMultiplier: event.learnedMultiplier
                ? Number(event.learnedMultiplier)
                : null,
              eventDate,
              daysUntil,
            }
          })
          .filter((e) => e.daysUntil <= 90)
          .sort((a, b) => a.daysUntil - b.daysUntil)

        return NextResponse.json({
          success: true,
          data: upcoming,
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Seasonality API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, masterSku, eventId, ...params } = body

    switch (action) {
      case 'create-event':
        const {
          name,
          eventType,
          startMonth,
          startDay,
          endMonth,
          endDay,
          baseMultiplier,
        } = params

        const newEvent = await createSeasonalEvent(
          name,
          eventType,
          startMonth,
          startDay,
          endMonth,
          endDay,
          baseMultiplier
        )

        return NextResponse.json({
          success: true,
          data: newEvent,
        })

      case 'update-event':
        if (!eventId) {
          return NextResponse.json(
            { success: false, error: 'Event ID is required' },
            { status: 400 }
          )
        }

        const updated = await prisma.seasonalEvent.update({
          where: { id: eventId },
          data: params,
        })

        return NextResponse.json({
          success: true,
          data: updated,
        })

      case 'update-sku-multiplier':
        if (!eventId || !masterSku || params.multiplier === undefined) {
          return NextResponse.json(
            { success: false, error: 'Event ID, SKU, and multiplier are required' },
            { status: 400 }
          )
        }

        await updateSkuEventMultiplier(eventId, masterSku, params.multiplier)

        return NextResponse.json({
          success: true,
          message: 'SKU multiplier updated',
        })

      case 'learn-multipliers':
        if (!masterSku) {
          return NextResponse.json(
            { success: false, error: 'SKU is required' },
            { status: 400 }
          )
        }

        const salesData = await getSalesData(masterSku)
        const learned = await learnSeasonalMultipliers(masterSku, salesData)

        return NextResponse.json({
          success: true,
          data: learned,
        })

      case 'delete-event':
        if (!eventId) {
          return NextResponse.json(
            { success: false, error: 'Event ID is required' },
            { status: 400 }
          )
        }

        await prisma.seasonalEvent.delete({
          where: { id: eventId },
        })

        return NextResponse.json({
          success: true,
          message: 'Event deleted',
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Seasonality API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

async function getSalesData(masterSku: string) {
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  try {
    const dailyProfits = await prisma.dailyProfit.findMany({
      where: {
        masterSku,
        date: { gte: twoYearsAgo },
      },
      orderBy: { date: 'asc' },
    })

    return dailyProfits.map((dp) => ({
      date: dp.date,
      units: dp.unitsSold,
    }))
  } catch (error) {
    return []
  }
}

async function getAllSalesData() {
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  try {
    const dailyProfits = await prisma.dailyProfit.findMany({
      where: {
        date: { gte: twoYearsAgo },
      },
      orderBy: { date: 'asc' },
    })

    // Aggregate by date
    const dailyMap = new Map<string, number>()

    for (const dp of dailyProfits) {
      const dateStr = dp.date.toISOString().split('T')[0]
      dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + dp.unitsSold)
    }

    return Array.from(dailyMap.entries())
      .map(([dateStr, units]) => ({
        date: new Date(dateStr),
        units,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  } catch (error) {
    return []
  }
}
