import { NextRequest, NextResponse } from 'next/server'
import { generateObservations } from '@/lib/jobs/generateInsights'

// This endpoint can be called by a cron job (e.g., Railway Cron, Vercel Cron, etc.)
// to automatically generate insights daily
// 
// Example cron schedule: 0 9 * * * (9 AM daily)
// 
// For Railway: Add a cron job in railway.json or use Railway's cron service
// For Vercel: Add to vercel.json cron jobs
// For manual testing: POST /api/cron/insights

export async function GET(request: NextRequest) {
  // Check for authorization header (optional - you can add API key protection)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // If CRON_SECRET is set, require it for security
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({
      success: false,
      error: 'Unauthorized'
    }, { status: 401 })
  }

  try {
    const observations = await generateObservations()

    return NextResponse.json({
      success: true,
      message: `Generated ${observations.length} observations`,
      count: observations.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Cron insights generation error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to generate insights',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request)
}

