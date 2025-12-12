/**
 * Sync Status API
 *
 * GET /api/sync/status - Get status of all sync queues
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { getQueueStatus, getScheduleConfig } from '@/lib/queues/scheduler'
import { checkRedisConnection } from '@/lib/queues'

export async function GET() {
  try {
    // Check Redis connection first
    const redisConnected = await checkRedisConnection()
    
    if (!redisConnected) {
      return NextResponse.json({
        success: false,
        error: 'Redis not connected',
        message: 'Add REDIS_URL to your environment variables. On Railway, add a Redis service.',
      }, { status: 503 })
    }

    const status = await getQueueStatus()
    const schedule = getScheduleConfig()

    return NextResponse.json({
      success: true,
      redisConnected: true,
      queues: status,
      schedule,
    })
  } catch (error: any) {
    console.error('Failed to get queue status:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}




