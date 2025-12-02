/**
 * Queue Initialization
 * 
 * This file auto-initializes when imported.
 * Import in layout.tsx: import '@/lib/queues/init'
 */

// Use global to prevent multiple initializations during hot reload
const globalForQueues = globalThis as unknown as {
  queuesInitialized: boolean
}

if (!globalForQueues.queuesInitialized && typeof window === 'undefined') {
  globalForQueues.queuesInitialized = true
  
  console.log('\n📦 Loading queue system...')
  
  const redisUrl = process.env.REDIS_URL
  console.log(`   REDIS_URL: ${redisUrl ? '✓ configured' : '✗ NOT SET'}`)
  
  if (!redisUrl) {
    console.log('   ⚠️ Skipping queue initialization (no Redis)\n')
  } else {
    // Initialize asynchronously to not block app startup
    ;(async () => {
      try {
        console.log('   Initializing scheduler and worker...')
        
        const { initializeScheduler } = await import('./scheduler')
        const { startWorker } = await import('./worker')
        
        await initializeScheduler()
        startWorker()
        
        console.log('   ✅ Queue system ready!\n')
      } catch (error: any) {
        console.error('   ❌ Queue init failed:', error.message)
        // Reset so it can try again on next hot reload
        globalForQueues.queuesInitialized = false
      }
    })()
  }
}

export {}
