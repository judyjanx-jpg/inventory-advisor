/**
 * Standalone Worker (JavaScript entry point)
 * 
 * Run this to process sync jobs.
 * Usage: node worker.js
 */

require('dotenv').config()

const http = require('http')
const { PrismaClient } = require('@prisma/client')
const Queue = require('bull')

// Minimal HTTP server for Railway healthcheck
const PORT = process.env.PORT || 3001
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', service: 'worker' }))
}).listen(PORT, () => {
  console.log(`Healthcheck server listening on port ${PORT}`)
})

// Redis URL
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

console.log('╔════════════════════════════════════════════╗')
console.log('║   Amazon Sync Worker                       ║')
console.log('╚════════════════════════════════════════════╝\n')

console.log(`Redis URL: ${REDIS_URL ? '✓ configured' : '✗ not set'}`)
console.log(`Database:  ${process.env.DATABASE_URL ? '✓ configured' : '✗ not set'}\n`)

if (!REDIS_URL) {
  console.error('ERROR: REDIS_URL environment variable is required')
  process.exit(1)
}

// Initialize Prisma
const prisma = new PrismaClient()

// Queue configuration
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 200,
}

// Create queues
const ordersQueue = new Queue('orders-sync', REDIS_URL, { defaultJobOptions })
const ordersReportQueue = new Queue('orders-report-sync', REDIS_URL, { 
  defaultJobOptions: {
    ...defaultJobOptions,
    timeout: 600000, // 10 minute timeout for report generation
  }
})
const financesQueue = new Queue('finances-sync', REDIS_URL, { defaultJobOptions })
const inventoryQueue = new Queue('inventory-sync', REDIS_URL, { defaultJobOptions })
const productsQueue = new Queue('products-sync', REDIS_URL, { defaultJobOptions })
const reportsQueue = new Queue('reports-sync', REDIS_URL, { defaultJobOptions })
const aggregationQueue = new Queue('aggregation', REDIS_URL, { defaultJobOptions })
const adsReportsQueue = new Queue('ads-reports-sync', REDIS_URL, { defaultJobOptions })
const alertsQueue = new Queue('alerts-generation', REDIS_URL, { defaultJobOptions })

const allQueues = [ordersQueue, ordersReportQueue, financesQueue, inventoryQueue, productsQueue, reportsQueue, aggregationQueue, adsReportsQueue, alertsQueue]

// Schedule configuration
const schedules = [
  // NEW: Orders Report sync - gets pending order items (like Sellerboard)
  { queue: ordersReportQueue, name: 'orders-report-sync', cron: '*/30 * * * *', description: 'Sync orders via Report API (includes pending orders)' },
  
  // Existing schedules
  { queue: ordersQueue, name: 'orders-sync', cron: '*/15 * * * *', description: 'Sync recent orders' },
  { queue: financesQueue, name: 'finances-sync', cron: '0 */2 * * *', description: 'Sync financial events' },
  { queue: inventoryQueue, name: 'inventory-sync', cron: '0 * * * *', description: 'Sync FBA inventory' },
  { queue: productsQueue, name: 'products-sync', cron: '0 6 * * *', description: 'Sync product catalog' },
  { queue: reportsQueue, name: 'daily-reports', cron: '0 7 * * *', description: 'Generate daily reports' },
  { queue: aggregationQueue, name: 'daily-aggregation', cron: '30 7 * * *', description: 'Calculate profit summaries' },
  { queue: adsReportsQueue, name: 'ads-reports-sync', cron: '0 */3 * * *', description: 'Sync Amazon Ads reports' },
  { queue: alertsQueue, name: 'alerts-generation', cron: '0 8 * * *', description: 'Generate inventory alerts' },
]

// Initialize scheduler
async function initializeScheduler() {
  console.log('🕐 Initializing job scheduler...')

  for (const schedule of schedules) {
    try {
      // Remove existing repeatable jobs
      const existingJobs = await schedule.queue.getRepeatableJobs()
      for (const job of existingJobs) {
        if (job.name === schedule.name) {
          await schedule.queue.removeRepeatableByKey(job.key)
        }
      }

      // Add scheduled job
      await schedule.queue.add(
        schedule.name,
        { scheduled: true, createdAt: new Date().toISOString() },
        { repeat: { cron: schedule.cron }, jobId: schedule.name }
      )

      console.log(`  ✓ ${schedule.name}: ${schedule.cron}`)
    } catch (error) {
      console.error(`  ✗ ${schedule.name}: ${error.message}`)
    }
  }

  console.log('Scheduler initialized!\n')
}

// ============================================
// NEW: Orders Report Sync (Report API)
// ============================================
async function processOrdersReportSync(job) {
  console.log(`[orders-report] Processing job ${job.id}...`)
  
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const days = job.data?.days || 2
    
    const response = await fetch(`${baseUrl}/api/sync/orders-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    })
    
    const data = await response.json()
    
    if (data.success) {
      console.log(`[orders-report] Completed: ${data.stats?.ordersProcessed || 0} orders, ${data.stats?.itemsCreated || 0} items`)
    } else {
      console.log(`[orders-report] Error:`, data.error)
    }
    
    return data
  } catch (error) {
    console.error(`[orders-report] Failed:`, error.message)
    throw error
  }
}

// Job processors
async function processOrdersSync(job) {
  console.log(`[orders] Processing job ${job.id}...`)
  
  // Call the API endpoint
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/amazon/sync/scheduled?schedule=quick`, {
      method: 'POST',
    })
    const data = await response.json()
    console.log(`[orders] Completed:`, data.success ? 'success' : data.error)
    return data
  } catch (error) {
    console.error(`[orders] Failed:`, error.message)
    throw error
  }
}

async function processFinancesSync(job) {
  console.log(`[finances] Processing job ${job.id}...`)
  
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/amazon/sync/financial-events?days=7`, {
      method: 'POST',
    })
    const data = await response.json()
    console.log(`[finances] Completed:`, data.success ? 'success' : data.error)
    return data
  } catch (error) {
    console.error(`[finances] Failed:`, error.message)
    throw error
  }
}

async function processInventorySync(job) {
  console.log(`[inventory] Processing job ${job.id}...`)
  
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/amazon/sync/inventory`, {
      method: 'POST',
    })
    const data = await response.json()
    console.log(`[inventory] Completed:`, data.success ? 'success' : data.error)
    return data
  } catch (error) {
    console.error(`[inventory] Failed:`, error.message)
    throw error
  }
}

async function processProductsSync(job) {
  console.log(`[products] Processing job ${job.id}...`)
  
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/amazon/sync/products`, {
      method: 'POST',
    })
    const data = await response.json()
    console.log(`[products] Completed:`, data.success ? 'success' : data.error)
    return data
  } catch (error) {
    console.error(`[products] Failed:`, error.message)
    throw error
  }
}

async function processReportsSync(job) {
  console.log(`[reports] Processing job ${job.id}...`)
  
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/amazon/sync/scheduled?schedule=daily`, {
      method: 'POST',
    })
    const data = await response.json()
    console.log(`[reports] Completed:`, data.success ? 'success' : data.error)
    return data
  } catch (error) {
    console.error(`[reports] Failed:`, error.message)
    throw error
  }
}

async function processAggregation(job) {
  console.log(`[aggregation] Processing job ${job.id}...`)
  
  // Calculate daily profits
  const daysBack = 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  try {
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: { purchaseDate: { gte: startDate } },
      },
      include: {
        order: { select: { purchaseDate: true } },
        product: { select: { cost: true } },
      },
    })

    const dailyMap = new Map()

    for (const item of orderItems) {
      const date = new Date(item.order.purchaseDate)
      date.setHours(0, 0, 0, 0)
      const key = `${date.toISOString().split('T')[0]}|${item.masterSku}`

      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          date,
          masterSku: item.masterSku,
          unitsSold: 0,
          revenue: 0,
          amazonFees: 0,
          cogs: 0,
        })
      }

      const daily = dailyMap.get(key)
      daily.unitsSold += item.quantity
      daily.revenue += Number(item.grossRevenue || 0)
      daily.amazonFees += Number(item.amazonFees || 0)
      daily.cogs += item.quantity * Number(item.product?.cost || 0)
    }

    let updated = 0
    for (const [_, daily] of dailyMap) {
      const grossProfit = daily.revenue - daily.amazonFees
      const netProfit = grossProfit - daily.cogs

      await prisma.dailyProfit.upsert({
        where: {
          date_masterSku: { date: daily.date, masterSku: daily.masterSku },
        },
        update: {
          unitsSold: daily.unitsSold,
          revenue: daily.revenue,
          amazonFees: daily.amazonFees,
          cogs: daily.cogs,
          grossProfit,
          netProfit,
          profitMargin: daily.revenue > 0 ? (netProfit / daily.revenue) * 100 : 0,
        },
        create: {
          date: daily.date,
          masterSku: daily.masterSku,
          unitsSold: daily.unitsSold,
          revenue: daily.revenue,
          amazonFees: daily.amazonFees,
          cogs: daily.cogs,
          grossProfit,
          netProfit,
          profitMargin: daily.revenue > 0 ? (netProfit / daily.revenue) * 100 : 0,
        },
      })
      updated++
    }

    console.log(`[aggregation] Updated ${updated} daily records`)
    return { dailyRecordsUpdated: updated }
  } catch (error) {
    console.error(`[aggregation] Failed:`, error.message)
    throw error
  }
}

async function processAdsReportsSync(job) {
  console.log(`[ads-reports] Processing job ${job.id}...`)

  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/amazon-ads/sync`, {
      method: 'POST',
    })
    const data = await response.json()
    console.log(`[ads-reports] Completed:`, data.success ? 'success' : (data.error || 'unknown error'))
    return data
  } catch (error) {
    console.error(`[ads-reports] Failed:`, error.message)
    throw error
  }
}

async function processAlertsGeneration(job) {
  console.log(`[alerts] Processing job ${job.id}...`)

  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/inventory/alerts/generate`, {
      method: 'POST',
    })
    const data = await response.json()
    console.log(`[alerts] Completed:`, data.success ? `${data.alertsGenerated || 0} alerts generated` : (data.error || 'unknown error'))
    return data
  } catch (error) {
    console.error(`[alerts] Failed:`, error.message)
    throw error
  }
}

// Start worker
function startWorker() {
  console.log('🔧 Starting sync worker...\n')

  // Register processors
  ordersReportQueue.process('orders-report-sync', 1, processOrdersReportSync)
  ordersQueue.process('orders-sync', 1, processOrdersSync)
  financesQueue.process('finances-sync', 1, processFinancesSync)
  inventoryQueue.process('inventory-sync', 1, processInventorySync)
  productsQueue.process('products-sync', 1, processProductsSync)
  reportsQueue.process('daily-reports', 1, processReportsSync)
  aggregationQueue.process('daily-aggregation', 1, processAggregation)
  adsReportsQueue.process('ads-reports-sync', 1, processAdsReportsSync)
  alertsQueue.process('alerts-generation', 1, processAlertsGeneration)

  // Event handlers
  allQueues.forEach(queue => {
    queue.on('failed', (job, err) => {
      console.error(`❌ Job ${job.id} in ${queue.name} failed:`, err.message)
    })

    queue.on('completed', (job) => {
      console.log(`✅ Job ${job.id} in ${queue.name} completed`)
    })
  })

  console.log('Worker started and listening for jobs!\n')
}

// Main
async function main() {
  try {
    await initializeScheduler()
    startWorker()
    console.log('Worker is running. Press Ctrl+C to stop.\n')
  } catch (error) {
    console.error('Failed to start worker:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nShutting down...')
  await Promise.all(allQueues.map(q => q.close()))
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  await Promise.all(allQueues.map(q => q.close()))
  await prisma.$disconnect()
  process.exit(0)
})

main()
