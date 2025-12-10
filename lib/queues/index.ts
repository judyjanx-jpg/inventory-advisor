/**
 * Bull Queue Setup
 * 
 * Central queue configuration for all sync jobs.
 * Jobs survive crashes/restarts - stored in Redis.
 */

import Queue from 'bull'

// Get Redis URL from environment
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Queue configuration defaults
const defaultJobOptions: Queue.JobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // Start with 5 seconds, then 10, 20, etc.
  },
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: 200,     // Keep last 200 failed jobs for debugging
}

// Create queues
export const ordersQueue = new Queue('orders-sync', REDIS_URL, {
  defaultJobOptions,
})

export const financesQueue = new Queue('finances-sync', REDIS_URL, {
  defaultJobOptions,
})

export const inventoryQueue = new Queue('inventory-sync', REDIS_URL, {
  defaultJobOptions,
})

export const productsQueue = new Queue('products-sync', REDIS_URL, {
  defaultJobOptions,
})

export const reportsQueue = new Queue('reports-sync', REDIS_URL, {
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5,
    timeout: 3600000, // 1 hour timeout for large reports
  },
})

export const aggregationQueue = new Queue('aggregation', REDIS_URL, {
  defaultJobOptions,
})

export const ordersReportQueue = new Queue('orders-report-sync', REDIS_URL, {
  defaultJobOptions: {
    ...defaultJobOptions,
    timeout: 600000, // 10 minute timeout for report generation
  },
})

export const adsReportsQueue = new Queue('ads-reports-sync', REDIS_URL, {
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5,
    timeout: 7200000, // 2 hour timeout (Amazon reports can take 1+ hour)
  },
})

export const alertsQueue = new Queue('alerts-generation', REDIS_URL, {
  defaultJobOptions,
})

// All queues for easy iteration
export const allQueues = [
  ordersQueue,
  ordersReportQueue,
  financesQueue,
  inventoryQueue,
  productsQueue,
  reportsQueue,
  aggregationQueue,
  adsReportsQueue,
  alertsQueue,
]

// Queue name to queue map
export const queueMap: Record<string, Queue.Queue> = {
  orders: ordersQueue,
  'orders-report': ordersReportQueue,
  finances: financesQueue,
  inventory: inventoryQueue,
  products: productsQueue,
  reports: reportsQueue,
  aggregation: aggregationQueue,
  'ads-reports': adsReportsQueue,
  alerts: alertsQueue,
}

// Graceful shutdown
export async function closeQueues() {
  await Promise.all(allQueues.map(queue => queue.close()))
}

// Check if Redis is connected
export async function checkRedisConnection(): Promise<boolean> {
  try {
    const testQueue = new Queue('test-connection', REDIS_URL)
    await testQueue.isReady()
    await testQueue.close()
    return true
  } catch (error) {
    console.error('Redis connection failed:', error)
    return false
  }
}



