/**
 * Stop All Syncs
 * POST /api/amazon/sync/stop-all - Reset all sync states
 * GET /api/amazon/sync/stop-all - Same (for easy browser access)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function stopAllSyncs(request: NextRequest) {
  try {
    console.log('🛑 Stopping all syncs...')
    const results: string[] = []

    // 1. Update any running sync logs to cancelled
    const updated = await prisma.syncLog.updateMany({
      where: { status: 'running' },
      data: { 
        status: 'cancelled',
        completedAt: new Date(),
      },
    })
    results.push(`Cancelled ${updated.count} running sync log(s)`)

    // 2. Reset API connection sync status
    await prisma.apiConnection.updateMany({
      where: { platform: 'amazon' },
      data: { 
        lastSyncStatus: 'idle',
        lastSyncError: null,
      },
    })
    results.push('Reset API connection status')

    // 3. Stop historical-batched sync (call its DELETE endpoint)
    try {
      const baseUrl = request.nextUrl.origin
      await fetch(`${baseUrl}/api/amazon/sync/historical-batched`, { 
        method: 'DELETE' 
      })
      results.push('Stopped historical-batched sync')
    } catch (e) {
      // Ignore
    }

    // 4. Stop initial sync if running
    try {
      await prisma.syncLog.updateMany({
        where: { 
          syncType: 'initial-full',
          status: 'running',
        },
        data: { 
          status: 'cancelled',
          completedAt: new Date(),
        },
      })
      results.push('Stopped initial sync')
    } catch (e) {
      // Ignore
    }

    console.log('✅ All syncs stopped')
    results.forEach(r => console.log(`   ${r}`))

    return NextResponse.json({
      success: true,
      message: 'All syncs stopped',
      actions: results,
    })

  } catch (error: any) {
    console.error('Error stopping syncs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return stopAllSyncs(request)
}

export async function GET(request: NextRequest) {
  return stopAllSyncs(request)
}

