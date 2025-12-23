import { NextRequest, NextResponse } from 'next/server'
import { triggerSync } from '@/lib/queues/scheduler'

/**
 * POST /api/fba-shipments/sync
 *
 * Trigger a manual FBA shipments sync from Amazon
 * Body (optional):
 * - daysBack: number (default: 90) - How many days back to sync
 */
export async function POST(request: NextRequest) {
  try {
    let daysBack = 90

    try {
      const body = await request.json()
      if (body.daysBack) {
        daysBack = parseInt(body.daysBack) || 90
      }
    } catch {
      // Body is optional, use defaults
    }

    // Trigger the sync job
    const job = await triggerSync('fba-shipments', { daysBack })

    return NextResponse.json({
      success: true,
      message: `FBA shipments sync triggered for last ${daysBack} days`,
      jobId: job.id,
    })
  } catch (error: any) {
    console.error('Error triggering FBA shipments sync:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to trigger sync' },
      { status: 500 }
    )
  }
}
