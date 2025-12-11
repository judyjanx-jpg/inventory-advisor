/**
 * Standalone Queue Worker
 *
 * This is the CANONICAL worker entrypoint for production (Railway) and development.
 *
 * Production (Railway):
 *   Dockerfile.worker runs: npx tsx lib/queues/standalone-worker.ts
 *
 * Development:
 *   npx tsx lib/queues/standalone-worker.ts
 *   OR: npm run worker:dev
 */

import 'dotenv/config'
import http from 'http'

// Health check server for Railway
const PORT = process.env.PORT || 3001
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    status: 'ok',
    service: 'worker',
    timestamp: new Date().toISOString()
  }))
}).listen(PORT, () => {
  console.log(`   Healthcheck server listening on port ${PORT}`)
})

async function main() {
  console.log('\n╔════════════════════════════════════════════╗')
  console.log('║   Amazon Sync Worker (TypeScript)          ║')
  console.log('╚════════════════════════════════════════════╝\n')

  const redisUrl = process.env.REDIS_URL
  const dbUrl = process.env.DATABASE_URL

  console.log(`   REDIS_URL:    ${redisUrl ? '✓ configured' : '✗ not set'}`)
  console.log(`   DATABASE_URL: ${dbUrl ? '✓ configured' : '✗ not set'}`)

  if (!redisUrl) {
    console.error('\n❌ REDIS_URL not set in environment')
    process.exit(1)
  }

  console.log('\n   Initializing...\n')

  try {
    // Import and start scheduler
    const { initializeScheduler } = await import('./scheduler')
    await initializeScheduler()

    // Import and start worker
    const { startWorker } = await import('./worker')
    startWorker()

    console.log('\n✅ Standalone worker running!')
    console.log('   Press Ctrl+C to stop\n')

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n👋 Shutting down worker...')
      try {
        const { allQueues } = await import('./index')
        await Promise.all(allQueues.map(q => q.close()))
        const { prisma } = await import('@/lib/prisma')
        await prisma.$disconnect()
      } catch (e) {
        // Ignore shutdown errors
      }
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Keep process alive
    setInterval(() => {}, 1000 * 60 * 60)

  } catch (error: any) {
    console.error('❌ Failed to start worker:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
