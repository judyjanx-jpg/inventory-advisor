/**
 * Trigger Sync API
 * 
 * POST /api/sync/trigger?type=orders - Trigger a manual sync
 * POST /api/sync/trigger?type=all - Trigger all syncs
 */

import { NextRequest, NextResponse } from 'next/server'
import { triggerSync } from '@/lib/queues/scheduler'

const VALID_TYPES = ['orders', 'orders-report', 'finances', 'inventory', 'products', 'reports', 'aggregation', 'ads-reports', 'alerts', 'all']

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'all'

    console.log(`\n🚀 [API] Sync trigger requested: type=${type}`)

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
      console.log(`   Triggering: orders, finances, inventory, products`)
      const jobs = await Promise.all([
        triggerSync('orders', body),
        triggerSync('finances', body),
        triggerSync('inventory', body),
        triggerSync('products', body),
      ])

      console.log(`   ✅ All jobs added to queue:`, jobs.map(j => `${j.name} (${j.id})`))
      console.log(`   📝 Check Railway worker service logs to see processing\n`)

      return NextResponse.json({
        success: true,
        message: 'All syncs triggered',
        jobs: jobs.map(j => ({ id: j.id, name: j.name })),
        note: 'Jobs are being processed by the worker service. Check worker logs on Railway.',
      })
    }

    // Trigger single sync
    console.log(`   Triggering: ${type}`)
    const job = await triggerSync(type, body)
    console.log(`   ✅ Job added to queue: ${job.name} (${job.id})`)
    console.log(`   📝 Check Railway worker service logs to see processing\n`)

    return NextResponse.json({
      success: true,
      message: `${type} sync triggered`,
      job: {
        id: job.id,
        name: job.name,
      },
      note: 'Job is being processed by the worker service. Check worker logs on Railway.',
    })
  } catch (error: any) {
    console.error('❌ [API] Failed to trigger sync:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}




