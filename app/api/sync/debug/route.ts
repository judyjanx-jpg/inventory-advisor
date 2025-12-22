/**
 * Debug Sync Queue
 *
 * GET /api/sync/debug - Check queue status and Redis connection
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { 
  ordersQueue, 
  financesQueue, 
  inventoryQueue, 
  productsQueue,
  checkRedisConnection 
} from '@/lib/queues'

export async function GET() {
  try {
    const redisConnected = await checkRedisConnection()
    
    const queues = [
      { name: 'orders-sync', queue: ordersQueue },
      { name: 'finances-sync', queue: financesQueue },
      { name: 'inventory-sync', queue: inventoryQueue },
      { name: 'products-sync', queue: productsQueue },
    ]

    const status = await Promise.all(
      queues.map(async ({ name, queue }) => {
        try {
          await queue.isReady()
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
          ])

          const waitingJobs = await queue.getWaiting(0, 5)
          const activeJobs = await queue.getActive(0, 5)

          return {
            name,
            ready: true,
            counts: { waiting, active, completed, failed, delayed },
            waitingJobs: waitingJobs.map(j => ({
              id: j.id,
              name: j.name,
              data: j.data,
            })),
            activeJobs: activeJobs.map(j => ({
              id: j.id,
              name: j.name,
              data: j.data,
            })),
          }
        } catch (error: any) {
          return {
            name,
            ready: false,
            error: error.message,
          }
        }
      })
    )

    return NextResponse.json({
      success: true,
      redisConnected,
      redisUrl: process.env.REDIS_URL ? '✓ configured' : '✗ NOT SET',
      queues: status,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}




