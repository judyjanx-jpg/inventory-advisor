// Job Scheduler
// Sets up recurring sync jobs. Run this once on app startup.
// Bull handles persistence - jobs survive restarts.
//
// Cron format: minute hour day month weekday
// Examples:
//   '*/15 * * * *'  = every 15 minutes
//   '0 * * * *'     = every hour on the hour
//   '0 */2 * * *'   = every 2 hours
//   '0 6 * * *'     = daily at 6am
//   '0 0 * * 0'     = weekly on Sunday at midnight

import {
  ordersQueue,
  ordersReportQueue,
  financesQueue,
  inventoryQueue,
  productsQueue,
  reportsQueue,
  aggregationQueue,
  adsReportsQueue,
  alertsQueue,
  queueMap,
} from './index'

interface ScheduleConfig {
  queue: any
  name: string
  cron: string
  description: string
  enabled: boolean
  data?: Record<string, any> // Optional job data like daysBack
}

const schedules: ScheduleConfig[] = [
  {
    queue: ordersReportQueue,
    name: 'orders-report-sync',
    cron: '*/30 * * * *',  // Every 30 minutes
    description: 'Sync orders via Report API (includes pending orders)',
    enabled: true,
  },
  {
    queue: ordersQueue,
    name: 'orders-sync',
    cron: '*/15 * * * *',  // Every 15 minutes
    description: 'Sync recent orders from SP-API',
    enabled: false, // Disabled - using orders-report-sync instead
  },
  {
    queue: financesQueue,
    name: 'finances-sync',
    cron: '0 */4 * * *',   // Every 4 hours (reduced frequency to avoid rate limits)
    description: 'Sync financial events (fees, refunds)',
    enabled: true,
    data: { daysBack: 14 }, // Sync 14 days to catch any missed data
  },
  {
    queue: inventoryQueue,
    name: 'inventory-sync',
    cron: '0 * * * *',     // Every hour
    description: 'Sync FBA inventory levels',
    enabled: true,
  },
  {
    queue: productsQueue,
    name: 'products-sync',
    cron: '0 6 * * *',     // Daily at 6am
    description: 'Sync product catalog',
    enabled: true,
  },
  {
    queue: reportsQueue,
    name: 'daily-reports',
    cron: '0 7 * * *',     // Daily at 7am
    description: 'Sync returns data from Amazon reports',
    enabled: true,
    data: { daysBack: 30 }, // Sync 30 days of returns daily
  },
  {
    queue: aggregationQueue,
    name: 'daily-aggregation',
    cron: '30 7 * * *',    // Daily at 7:30am (after reports)
    description: 'Calculate daily profit summaries',
    enabled: true,
  },
  {
    queue: adsReportsQueue,
    name: 'ads-reports-sync',
    cron: '*/30 * * * *',   // Every 30 minutes (to check pending reports and request new ones)
    description: 'Sync Amazon Ads campaign data (SP reports)',
    enabled: true,
  },
  {
    queue: alertsQueue,
    name: 'alerts-generation',
    cron: '0 8 * * *',      // Daily at 8am (after aggregation)
    description: 'Generate inventory alerts from forecast data',
    enabled: true,
  },
]

/**
 * Initialize all scheduled jobs
 */
export async function initializeScheduler() {
  console.log('\n🕐 Initializing job scheduler...')

  for (const schedule of schedules) {
    if (!schedule.enabled) {
      console.log(`  ⏸ ${schedule.name}: disabled`)
      continue
    }

    try {
      // Remove existing repeatable jobs to avoid duplicates
      const existingJobs = await schedule.queue.getRepeatableJobs()
      for (const job of existingJobs) {
        if (job.name === schedule.name) {
          await schedule.queue.removeRepeatableByKey(job.key)
        }
      }

      // Add the scheduled job
      await schedule.queue.add(
        schedule.name,
        { scheduled: true, createdAt: new Date().toISOString(), ...schedule.data },
        {
          repeat: { cron: schedule.cron },
          jobId: schedule.name,
        }
      )

      console.log(`  ✓ ${schedule.name}: ${schedule.cron}`)
      console.log(`    └─ ${schedule.description}`)
    } catch (error: any) {
      console.error(`  ✗ ${schedule.name}: ${error.message}`)
    }
  }

  console.log('Scheduler initialized!\n')
}

/**
 * Manually trigger a sync
 * 
 * Uses the same job names as scheduled jobs so the worker processes them correctly.
 */
export async function triggerSync(syncType: string, data?: any) {
  const queue = queueMap[syncType]
  if (!queue) {
    throw new Error(`Unknown sync type: ${syncType}. Valid: ${Object.keys(queueMap).join(', ')}`)
  }

  // Map syncType to the actual job name used by processors
  const jobNameMap: Record<string, string> = {
    orders: 'orders-sync',
    finances: 'finances-sync',
    inventory: 'inventory-sync',
    products: 'products-sync',
    reports: 'daily-reports',
    aggregation: 'daily-aggregation',
    'ads-reports': 'ads-reports-sync',
  }

  const jobName = jobNameMap[syncType] || `${syncType}-sync`
  
  console.log(`\n🚀 Triggering manual sync: ${jobName}`)
  console.log(`   Queue: ${queue.name}`)

  try {
    await queue.isReady()

    const job = await queue.add(
      jobName,
      { 
        manual: true, 
        triggeredAt: new Date().toISOString(),
        ...data,
      },
      { priority: 1 } // Higher priority than scheduled jobs
    )

    console.log(`   ✅ Job added: ${job.id} (${job.name})`)
    return job
  } catch (error: any) {
    console.error(`   ❌ Failed to add job:`, error.message)
    throw error
  }
}

/**
 * Get status of all queues
 */
export async function getQueueStatus() {
  const status = []

  for (const schedule of schedules) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        schedule.queue.getWaitingCount(),
        schedule.queue.getActiveCount(),
        schedule.queue.getCompletedCount(),
        schedule.queue.getFailedCount(),
        schedule.queue.getDelayedCount(),
      ])

      // Get last completed job
      const completedJobs = await schedule.queue.getCompleted(0, 0)
      const lastCompleted = completedJobs[0]

      // Get last failed job
      const failedJobs = await schedule.queue.getFailed(0, 0)
      const lastFailed = failedJobs[0]

      status.push({
        name: schedule.name,
        cron: schedule.cron,
        description: schedule.description,
        enabled: schedule.enabled,
        counts: { waiting, active, completed, failed, delayed },
        lastCompleted: lastCompleted ? {
          id: lastCompleted.id,
          finishedOn: lastCompleted.finishedOn,
          duration: lastCompleted.finishedOn && lastCompleted.processedOn 
            ? lastCompleted.finishedOn - lastCompleted.processedOn 
            : null,
        } : null,
        lastFailed: lastFailed ? {
          id: lastFailed.id,
          failedReason: lastFailed.failedReason,
          finishedOn: lastFailed.finishedOn,
        } : null,
      })
    } catch (error: any) {
      status.push({
        name: schedule.name,
        error: error.message,
      })
    }
  }

  return status
}

/**
 * Get schedule configuration
 */
export function getScheduleConfig() {
  return schedules.map(s => ({
    name: s.name,
    cron: s.cron,
    description: s.description,
    enabled: s.enabled,
  }))
}