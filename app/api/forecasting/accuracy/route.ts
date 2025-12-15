/**
 * Forecast Accuracy API
 *
 * Endpoints for tracking and reporting forecast accuracy
 */

import { NextResponse } from 'next/server'
import {
  generateAccuracyReport,
  trackForecastAccuracy,
  compareModelPerformance,
  optimizeModelWeights,
} from '@/lib/forecasting'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const masterSku = searchParams.get('sku')
    const days = parseInt(searchParams.get('days') || '30')

    switch (action) {
      case 'report':
        const endDate = new Date()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const report = await generateAccuracyReport(startDate, endDate)
        return NextResponse.json({
          success: true,
          data: {
            period: { start: startDate, end: endDate },
            ...report,
          },
        })

      case 'model-comparison':
        if (!masterSku) {
          return NextResponse.json(
            { success: false, error: 'SKU is required' },
            { status: 400 }
          )
        }

        // Get sales data for comparison
        const salesData = await getSalesData(masterSku)
        const comparison = await compareModelPerformance(masterSku, salesData, days)

        return NextResponse.json({
          success: true,
          data: {
            masterSku,
            validationDays: days,
            models: comparison,
          },
        })

      case 'sku-accuracy':
        if (!masterSku) {
          return NextResponse.json(
            { success: false, error: 'SKU is required' },
            { status: 400 }
          )
        }

        const skuAccuracy = await prisma.forecastAccuracy.findMany({
          where: {
            masterSku,
            forecastDate: {
              gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
            },
          },
          orderBy: { forecastDate: 'desc' },
        })

        const avgMape =
          skuAccuracy.length > 0
            ? skuAccuracy.reduce((sum, a) => sum + Number(a.percentageError), 0) /
              skuAccuracy.length
            : 0

        return NextResponse.json({
          success: true,
          data: {
            masterSku,
            period: { days },
            accuracy: (1 - avgMape) * 100,
            mape: avgMape * 100,
            sampleSize: skuAccuracy.length,
            records: skuAccuracy,
          },
        })

      case 'model-weights':
        if (!masterSku) {
          // Return all model weights
          const allWeights = await prisma.modelWeight.findMany({
            orderBy: { lastUpdated: 'desc' },
            take: 100,
          })

          return NextResponse.json({
            success: true,
            data: allWeights,
          })
        }

        const weights = await prisma.modelWeight.findUnique({
          where: { masterSku },
        })

        return NextResponse.json({
          success: true,
          data: weights,
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Accuracy API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, masterSku, forecastDate, location, predictedUnits, modelUsed } = body

    switch (action) {
      case 'track':
        await trackForecastAccuracy(
          masterSku,
          new Date(forecastDate),
          location || 'total',
          predictedUnits,
          modelUsed || 'ensemble'
        )

        return NextResponse.json({
          success: true,
          message: 'Accuracy tracked',
        })

      case 'optimize':
        if (!masterSku) {
          return NextResponse.json(
            { success: false, error: 'SKU is required' },
            { status: 400 }
          )
        }

        const result = await optimizeModelWeights(masterSku)

        return NextResponse.json({
          success: true,
          data: result,
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Accuracy API error:', error)
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

    if (dailyProfits.length > 0) {
      return dailyProfits.map((dp) => ({
        date: dp.date,
        units: dp.unitsSold,
      }))
    }
  } catch (error) {
    // Fall through
  }

  return []
}
