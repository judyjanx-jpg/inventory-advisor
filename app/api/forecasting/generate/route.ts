import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateForecast, ForecastParams } from '@/lib/forecasting/forecast-engine'

/**
 * Generate forecasts for a SKU
 * POST /api/forecasting/generate
 * Body: { masterSku: string, location: 'fba' | 'warehouse' | 'total', daysAhead: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { masterSku, location = 'total', daysAhead = 180 } = body

    if (!masterSku) {
      return NextResponse.json(
        { error: 'masterSku is required' },
        { status: 400 }
      )
    }

    // Check if prisma and dailyProfit are available
    if (!prisma) {
      return NextResponse.json(
        { error: 'Database client not initialized' },
        { status: 500 }
      )
    }

    if (!prisma.dailyProfit) {
      return NextResponse.json(
        { error: 'DailyProfit model not found. Please stop the server, run "npx prisma generate", then restart.' },
        { status: 500 }
      )
    }

    // Generate forecasts
    const params: ForecastParams = {
      masterSku,
      location: location as 'fba' | 'warehouse' | 'total',
      daysAhead: Math.min(daysAhead, 365), // Max 1 year
      includeSeasonality: true,
      includeDeals: true,
    }

    let forecasts
    try {
      forecasts = await generateForecast(params)
    } catch (error: any) {
      console.error('Error in generateForecast:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to generate forecast' },
        { status: 500 }
      )
    }

    // Store forecasts in database (if table exists)
    const storedForecasts = []
    try {
      for (const forecast of forecasts) {
        // Ensure forecast.date is a Date object
        const forecastDate = forecast.date instanceof Date ? forecast.date : new Date(forecast.date)
        
        // Prisma composite unique key syntax
        // The unique constraint name is auto-generated from the field names
        const stored = await prisma.forecast.upsert({
          where: {
            masterSku_location_forecastDate: {
              masterSku: masterSku,
              location: params.location,
              forecastDate: forecastDate,
            },
          },
          update: {
            baseForecast: Number(forecast.baseForecast) || 0,
            finalForecast: Number(forecast.finalForecast) || 0,
            confidence: Number(forecast.confidence) || 0,
            seasonalityMultiplier: forecast.seasonalityMultiplier ? Number(forecast.seasonalityMultiplier) : 1.0,
            safetyStock: Number(forecast.safetyStock) || 0,
            recommendedInventory: Number(forecast.recommendedInventory) || 0,
          },
          create: {
            masterSku,
            location: params.location,
            forecastDate: forecastDate,
            baseForecast: Number(forecast.baseForecast) || 0,
            finalForecast: Number(forecast.finalForecast) || 0,
            confidence: Number(forecast.confidence) || 0,
            seasonalityMultiplier: forecast.seasonalityMultiplier ? Number(forecast.seasonalityMultiplier) : 1.0,
            safetyStock: Number(forecast.safetyStock) || 0,
            recommendedInventory: Number(forecast.recommendedInventory) || 0,
          },
        })
        storedForecasts.push(stored)
      }
    } catch (dbError: any) {
      // If table doesn't exist, just return the forecasts without storing
      if (dbError.message?.includes('does not exist') || dbError.message?.includes('Unknown table')) {
        console.warn('Forecast table does not exist. Returning forecasts without storing.')
        return NextResponse.json({
          success: true,
          count: forecasts.length,
          forecasts: forecasts.map(f => ({
            ...f,
            date: f.date.toISOString(),
          })),
          message: 'Forecasts generated but not stored. Please run database migration first.',
        })
      }
      throw dbError
    }

    // Return forecasts with proper date formatting
    const formattedForecasts = storedForecasts.map(f => ({
      ...f,
      date: f.forecastDate instanceof Date ? f.forecastDate.toISOString() : f.forecastDate,
      forecastDate: f.forecastDate instanceof Date ? f.forecastDate.toISOString() : f.forecastDate,
    }))

    console.log(`[POST Forecasts] Stored ${storedForecasts.length} forecasts, returning ${formattedForecasts.length}`)

    return NextResponse.json({
      success: true,
      count: storedForecasts.length,
      forecasts: formattedForecasts,
    })
  } catch (error: any) {
    console.error('Error generating forecasts:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate forecasts' },
      { status: 500 }
    )
  }
}

/**
 * Get existing forecasts for a SKU
 * GET /api/forecasting/generate?masterSku=XXX&location=total&daysAhead=180
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const masterSku = searchParams.get('masterSku')
    const location = searchParams.get('location') || 'total'
    const daysAhead = parseInt(searchParams.get('daysAhead') || '180')

    if (!masterSku) {
      return NextResponse.json(
        { error: 'masterSku is required' },
        { status: 400 }
      )
    }

    // Set dates to start of day to avoid timezone issues
    const startDate = new Date()
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + daysAhead)
    endDate.setHours(23, 59, 59, 999)

    try {
      console.log(`[GET Forecasts] Querying for ${masterSku}, location: ${location}, date range: ${startDate.toISOString()} to ${endDate.toISOString()}`)
      
      const forecasts = await prisma.forecast.findMany({
        where: {
          masterSku,
          location: location as string,
          forecastDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: {
          forecastDate: 'asc',
        },
      })

      console.log(`[GET Forecasts] Found ${forecasts.length} forecasts`)

      // Format dates for frontend
      const formattedForecasts = forecasts.map(f => ({
        ...f,
        date: f.forecastDate instanceof Date ? f.forecastDate.toISOString() : f.forecastDate,
        forecastDate: f.forecastDate instanceof Date ? f.forecastDate.toISOString() : f.forecastDate,
      }))

      console.log(`[GET Forecasts] Returning ${formattedForecasts.length} forecasts`)

      return NextResponse.json({
        success: true,
        count: forecasts.length,
        forecasts: formattedForecasts,
      })
    } catch (dbError: any) {
      // If table doesn't exist yet, return empty array
      if (dbError.message?.includes('does not exist') || dbError.message?.includes('Unknown table')) {
        console.warn('Forecast table does not exist yet. Run migration first.')
        return NextResponse.json({
          success: true,
          count: 0,
          forecasts: [],
          message: 'Forecast table does not exist. Please run database migration first.',
        })
      }
      throw dbError
    }
  } catch (error: any) {
    console.error('Error fetching forecasts:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch forecasts' },
      { status: 500 }
    )
  }
}

