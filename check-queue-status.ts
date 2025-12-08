import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function checkQueueStatus() {
  try {
    console.log('\n⏰ SCHEDULED SYNC STATUS\n')
    console.log('='.repeat(50))

    // Check if Redis is configured
    const redisUrl = process.env.REDIS_URL
    console.log(`\n🔌 Redis Configuration:`)
    console.log(`  REDIS_URL: ${redisUrl ? '✓ configured' : '✗ NOT SET'}`)
    
    if (!redisUrl) {
      console.log('\n⚠️  WARNING: Redis is not configured!')
      console.log('   Scheduled syncs require Redis to work.')
      console.log('   Add REDIS_URL to your .env file or environment variables.')
      console.log('   On Railway, add a Redis service to your project.')
      return
    }

    // Try to check queue status via API (if server is running)
    console.log('\n📊 Queue Status:')
    console.log('   (Note: This requires the server to be running)')
    console.log('   Check /api/sync/status in your browser for detailed queue information')
    
    // Check if worker process is needed
    console.log('\n⚙️  Worker Process:')
    console.log('   Scheduled syncs require a worker process to be running.')
    console.log('   Options:')
    console.log('   1. Run worker separately: npm run worker (or node worker.js)')
    console.log('   2. Or use the standalone worker: node lib/queues/standalone-worker.ts')
    console.log('   3. Or deploy worker as separate service (Dockerfile.worker)')

    // Check recent sync activity from logs
    console.log('\n📋 Recent Sync Activity (from logs):')
    try {
      const recentSyncs = await prisma.$queryRaw<any[]>`
        SELECT 
          sync_type as "syncType",
          status,
          MAX(started_at) as "lastRun",
          COUNT(*) as "runCount"
        FROM sync_logs
        WHERE started_at >= NOW() - INTERVAL '7 days'
        GROUP BY sync_type, status
        ORDER BY "lastRun" DESC
        LIMIT 20
      `

      if (recentSyncs.length === 0) {
        console.log('  ⚠️  No sync activity in the last 7 days')
      } else {
        recentSyncs.forEach((sync: any) => {
          const lastRun = sync.lastRun ? new Date(sync.lastRun).toLocaleString() : 'never'
          const statusIcon = sync.status === 'success' ? '✅' : sync.status === 'failed' ? '❌' : '🔄'
          console.log(`  ${statusIcon} ${sync.syncType}: ${sync.runCount} runs, last: ${lastRun}`)
        })
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query sync logs: ${e.message}`)
    }

    // Expected schedule
    console.log('\n📅 Expected Schedule:')
    console.log('  Orders Sync: Every 15 minutes (*/15 * * * *)')
    console.log('  Finances Sync: Every 2 hours (0 */2 * * *)')
    console.log('  Inventory Sync: Every hour (0 * * * *)')
    console.log('  Products Sync: Daily at 6am (0 6 * * *)')
    console.log('  Daily Reports: Daily at 7am (0 7 * * *)')
    console.log('  Daily Aggregation: Daily at 7:30am (30 7 * * *)')

  } catch (error: any) {
    console.error('Error checking queue status:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkQueueStatus()



