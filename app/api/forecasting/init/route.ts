import { NextResponse } from 'next/server'
import { initializeSeasonalEvents } from '@/lib/forecasting/seasonal-events'

/**
 * Initialize forecasting system
 * POST /api/forecasting/init
 * Creates default seasonal events
 */
export async function POST() {
  try {
    await initializeSeasonalEvents()

    return NextResponse.json({
      success: true,
      message: 'Forecasting system initialized',
    })
  } catch (error: any) {
    console.error('Error initializing forecasting:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to initialize forecasting' },
      { status: 500 }
    )
  }
}

