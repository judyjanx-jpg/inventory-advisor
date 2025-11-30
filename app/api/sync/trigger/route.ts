/**
 * Trigger Sync API
 * 
 * POST /api/sync/trigger?type=orders - Trigger a manual sync
 * POST /api/sync/trigger?type=all - Trigger all syncs
 */

import { NextRequest, NextResponse } from 'next/server'
import { triggerSync } from '@/lib/queues/scheduler'

const VALID_TYPES = ['orders', 'finances', 'inventory', 'products', 'reports', 'aggregation', 'all']

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all'

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({
        success: false,
        error: `Invalid sync type: ${type}`,
        validTypes: VALID_TYPES,
      }, { status: 400 })
    }

    // Get optional parameters from body
    let body = {}
    try {
      body = await request.json()
    } catch {
      // No body is fine
    }

    if (type === 'all') {
      // Trigger all syncs
      const jobs = await Promise.all([
        triggerSync('orders', body),
        triggerSync('finances', body),
        triggerSync('inventory', body),
        triggerSync('products', body),
      ])

      return NextResponse.json({
        success: true,
        message: 'All syncs triggered',
        jobs: jobs.map(j => ({ id: j.id, name: j.name })),
      })
    }

    // Trigger single sync
    const job = await triggerSync(type, body)

    return NextResponse.json({
      success: true,
      message: `${type} sync triggered`,
      job: {
        id: job.id,
        name: job.name,
      },
    })
  } catch (error: any) {
    console.error('Failed to trigger sync:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}

