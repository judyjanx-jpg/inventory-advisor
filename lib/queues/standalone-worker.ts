/**
 * Standalone Queue Worker
 * 
 * Run this in a separate terminal during development:
 *   npx tsx lib/queues/standalone-worker.ts
 * 
 * This ensures the queue system runs independently of page navigation.
 */

import 'dotenv/config'

async function main() {
  console.log('\n🚀 Starting standalone queue worker...\n')
  
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    console.error('❌ REDIS_URL not set in environment')
    process.exit(1)
  }
  
  console.log('   REDIS_URL: ✓ configured')
  console.log('   Initializing...\n')
  
  try {
    // Import and start scheduler
    const { initializeScheduler } = await import('./scheduler')
    await initializeScheduler()
    
    // Import and start worker
    const { startWorker } = await import('./worker')
    startWorker()
    
    console.log('\n✅ Standalone worker running!')
    console.log('   Press Ctrl+C to stop\n')
    
    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down worker...')
      process.exit(0)
    })
    
    // Prevent exit
    setInterval(() => {}, 1000 * 60 * 60)
    
  } catch (error: any) {
    console.error('❌ Failed to start worker:', error.message)
    process.exit(1)
  }
}

main()
