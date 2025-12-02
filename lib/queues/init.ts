/**
 * Queue Initialization (App-side only)
 * 
 * This file is imported by the Next.js app but does NOT initialize the worker.
 * The worker runs separately via Railway worker service (worker.ts).
 * 
 * The app can still trigger manual syncs via the API, but scheduled jobs
 * and job processing happen in the separate worker service.
 * 
 * Import in layout.tsx: import '@/lib/queues/init'
 */

// Note: We don't initialize scheduler or worker here because:
// 1. The worker service (worker.ts) handles both scheduling and processing
// 2. The app can still trigger manual syncs via /api/sync/trigger
// 3. This avoids conflicts and ensures jobs are processed by the dedicated worker

if (typeof window === 'undefined') {
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    console.log('\n📦 Queue system: Worker runs separately (Railway worker service)')
    console.log('   ✅ App can trigger manual syncs via API\n')
  }
}

export {}
