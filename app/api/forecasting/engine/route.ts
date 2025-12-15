/**
 * Multi-Model Forecasting Engine API
 *
 * Endpoints:
 * - GET: Get forecast for a SKU
 * - POST: Generate forecasts with specific parameters
 */

import { NextResponse } from 'next/server'
import {
  getForecast,
  generateEnsembleForecast,
  getSystemHealth,
  generateAlerts,
  runScheduledJobs,
} from '@/lib/forecasting'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const masterSku = searchParams.get('sku')
    const daysAhead = parseInt(searchParams.get('days') || '90')

    switch (action) {
      case 'forecast':
        if (!masterSku) {
          return NextResponse.json(
            { success: false, error: 'SKU is required' },
            { status: 400 }
          )
        }

        const forecast = await getForecast(masterSku, daysAhead)
        return NextResponse.json({
          success: true,
          data: {
            masterSku,
            daysAhead,
            ...forecast,
            // Add summary metrics
            summary: {
              avgDailyForecast:
                forecast.forecasts.reduce((sum, f) => sum + f.finalForecast, 0) /
                forecast.forecasts.length,
              totalForecast: forecast.forecasts.reduce(
                (sum, f) => sum + f.finalForecast,
                0
              ),
              avgConfidence:
                forecast.forecasts.reduce((sum, f) => sum + f.confidence, 0) /
                forecast.forecasts.length,
              hasSeasonality: forecast.seasonality.hasSeasonality,
              isSpiking: forecast.spike.isSpiking,
              isNewItem: forecast.newItem.isNewItem,
              urgency: forecast.recommendation.urgency,
            },
          },
        })

      case 'health':
        const health = await getSystemHealth()
        return NextResponse.json({
          success: true,
          data: health,
        })

      case 'alerts':
        const alerts = await generateAlerts()
        return NextResponse.json({
          success: true,
          data: alerts,
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Forecasting API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, masterSku, daysAhead, params } = body

    switch (action) {
      case 'generate':
        if (!masterSku) {
          return NextResponse.json(
            { success: false, error: 'SKU is required' },
            { status: 400 }
          )
        }

        const forecast = await getForecast(masterSku, daysAhead || 90)
        return NextResponse.json({
          success: true,
          data: forecast,
        })

      case 'run-jobs':
        // Run all scheduled jobs
        const jobResults = await runScheduledJobs()
        return NextResponse.json({
          success: true,
          data: {
            modelOptimization: {
              skusProcessed: jobResults.modelOptimization.totalSkusProcessed,
              skusImproved: jobResults.modelOptimization.skusImproved,
              avgImprovement: jobResults.modelOptimization.averageImprovement,
            },
            newItemCheck: {
              checked: jobResults.newItemCheck.checkedCount,
              recalibrated: jobResults.newItemCheck.recalibratedCount,
            },
            supplierUpdate: {
              updated: jobResults.supplierUpdate.updated,
              alerts: jobResults.supplierUpdate.alerts.length,
            },
            anomalyDetection: jobResults.anomalyDetection.summary,
            alerts: jobResults.alerts.summary,
          },
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Forecasting API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
