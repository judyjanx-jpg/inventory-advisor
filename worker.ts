/**
 * Standalone Worker
 * 
 * Run this separately from the main app to process sync jobs.
 * 
 * Usage:
 *   npx ts-node worker.ts
 *   # or
 *   npm run worker
 */

import 'dotenv/config'
import { startWorker } from './lib/queues/worker'
import { initializeScheduler } from './lib/queues/scheduler'
import { closeQueues } from './lib/queues'

async function main() {
  console.log('╔════════════════════════════════════════════╗')
  console.log('║   Amazon Sync Worker                       ║')
  console.log('╚════════════════════════════════════════════╝\n')

  console.log(`Redis URL: ${process.env.REDIS_URL ? '✓ configured' : '✗ not set'}`)
  console.log(`Database:  ${process.env.DATABASE_URL ? '✓ configured' : '✗ not set'}\n`)

  if (!process.env.REDIS_URL) {
    console.error('ERROR: REDIS_URL environment variable is required')
    console.log('\nTo set up Redis on Railway:')
    console.log('1. Go to your Railway project')
    console.log('2. Click "New Service" → "Database" → "Redis"')
    console.log('3. Copy REDIS_URL to your app\'s environment variables')
    process.exit(1)
  }

  try {
    // IMPORTANT: Start worker FIRST, then initialize scheduler
    // This ensures handlers are registered before any jobs are created
    console.log('🔧 Starting worker processors...')
    startWorker()
    console.log('✅ Worker processors registered\n')

    // Small delay to ensure processors are fully registered
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Initialize the scheduler (sets up recurring jobs)
    console.log('📅 Initializing scheduler...')
    await initializeScheduler()
    console.log('✅ Scheduler initialized\n')

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Worker is running and ready to process jobs!')
    console.log('   Waiting for jobs from queues...')
    console.log('   (Jobs can be triggered manually via API or scheduled)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // Keep process alive
    setInterval(() => {
      // Heartbeat every 5 minutes to show worker is alive
      const now = new Date().toISOString()
      console.log(`💓 Worker heartbeat: ${now} (still running)`)
    }, 5 * 60 * 1000)

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('\n⚠️  SIGTERM received, shutting down gracefully...')
      await closeQueues()
      console.log('👋 Worker stopped')
      process.exit(0)
    })

    process.on('SIGINT', async () => {
      console.log('\n⚠️  SIGINT received, shutting down gracefully...')
      await closeQueues()
      console.log('👋 Worker stopped')
      process.exit(0)
    })

  } catch (error: any) {
    console.error('❌ Failed to start worker:', error)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  }
}

main()


