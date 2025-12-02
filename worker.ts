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
    // Initialize the scheduler (sets up recurring jobs)
    await initializeScheduler()

    // Start the worker (processes jobs)
    startWorker()

    console.log('Worker is running. Press Ctrl+C to stop.\n')

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('\nSIGTERM received, shutting down gracefully...')
      await closeQueues()
      process.exit(0)
    })

    process.on('SIGINT', async () => {
      console.log('\nSIGINT received, shutting down gracefully...')
      await closeQueues()
      process.exit(0)
    })

  } catch (error) {
    console.error('Failed to start worker:', error)
    process.exit(1)
  }
}

main()


