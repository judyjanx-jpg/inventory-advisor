import { NextRequest, NextResponse } from 'next/server'
import { generateObservations } from '@/lib/jobs/generateInsights'

// POST /api/ai/insights/generate - Manually trigger insight generation (for testing or scheduled jobs)
export async function POST(request: NextRequest) {
  try {
    const observations = await generateObservations() ?? []

    return NextResponse.json({
      success: true,
      count: observations.length,
      message: `Generated ${observations.length} observations`
    })
  } catch (error) {
    console.error('Generate insights error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    return NextResponse.json({
      success: false,
      error: 'Failed to generate insights',
      details: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
    }, { status: 500 })
  }
}

