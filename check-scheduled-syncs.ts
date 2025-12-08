import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function checkScheduledSyncs() {
  try {
    console.log('\n⏰ SCHEDULED SYNC STATUS CHECK\n')
    console.log('='.repeat(60))

    // Check if queue-based syncs are running (they log with different sync types)
    console.log('\n📋 Queue-Based Sync Activity:')
    console.log('   (Looking for scheduled-* sync types)')
    
    try {
      const queueSyncs = await prisma.$queryRaw<any[]>`
        SELECT 
          sync_type as "syncType",
          status,
          MAX(started_at) as "lastRun",
          COUNT(*) as "runCount"
        FROM sync_logs
        WHERE sync_type LIKE 'scheduled-%'
        GROUP BY sync_type, status
        ORDER BY "lastRun" DESC
        LIMIT 20
      `

      if (queueSyncs.length === 0) {
        console.log('  ⚠️  No scheduled sync activity found')
        console.log('  This could mean:')
        console.log('    1. Worker process is not running')
        console.log('    2. Scheduler was not initialized')
        console.log('    3. Syncs are running but not logging to sync_logs')
      } else {
        queueSyncs.forEach((sync: any) => {
          const lastRun = sync.lastRun ? new Date(sync.lastRun).toLocaleString() : 'never'
          const statusIcon = sync.status === 'success' ? '✅' : sync.status === 'failed' ? '❌' : '🔄'
          console.log(`  ${statusIcon} ${sync.syncType}: ${sync.runCount} runs, last: ${lastRun}`)
        })
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query queue syncs: ${e.message}`)
    }

    // Check all sync types to see what's actually running
    console.log('\n📊 All Sync Types (Last 7 Days):')
    try {
      const allSyncs = await prisma.$queryRaw<any[]>`
        SELECT 
          sync_type as "syncType",
          status,
          MAX(started_at) as "lastRun",
          COUNT(*) as "runCount",
          SUM(records_processed) as "totalProcessed"
        FROM sync_logs
        WHERE started_at >= NOW() - INTERVAL '7 days'
        GROUP BY sync_type, status
        ORDER BY "lastRun" DESC
      `

      if (allSyncs.length === 0) {
        console.log('  ⚠️  No sync activity in the last 7 days')
      } else {
        allSyncs.forEach((sync: any) => {
          const lastRun = sync.lastRun ? new Date(sync.lastRun).toLocaleString() : 'never'
          const statusIcon = sync.status === 'success' ? '✅' : sync.status === 'failed' ? '❌' : '🔄'
          const processed = sync.totalProcessed ? Number(sync.totalProcessed).toLocaleString() : '0'
          console.log(`  ${statusIcon} ${sync.syncType}`)
          console.log(`     Runs: ${sync.runCount}, Last: ${lastRun}, Processed: ${processed} records`)
        })
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query syncs: ${e.message}`)
    }

    // Check most recent orders to see if they're being updated
    console.log('\n📦 Order Data Freshness:')
    try {
      const orderStats = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as total,
          MAX(purchase_date) as "latestOrder",
          COUNT(CASE WHEN purchase_date >= NOW() - INTERVAL '24 hours' THEN 1 END) as "last24h",
          COUNT(CASE WHEN purchase_date >= NOW() - INTERVAL '7 days' THEN 1 END) as "last7d"
        FROM orders
      `

      if (orderStats && orderStats[0]) {
        const stats = orderStats[0]
        const latest = stats.latestOrder ? new Date(stats.latestOrder) : null
        const hoursSinceLatest = latest ? Math.round((Date.now() - latest.getTime()) / (1000 * 60 * 60)) : null
        
        console.log(`  Total Orders: ${Number(stats.total).toLocaleString()}`)
        if (latest) {
          console.log(`  Latest Order: ${latest.toLocaleString()}`)
          console.log(`  Hours Since Latest: ${hoursSinceLatest}`)
          
          if (hoursSinceLatest !== null) {
            if (hoursSinceLatest <= 24) {
              console.log(`  ✅ Orders are being updated (within 24 hours)`)
            } else if (hoursSinceLatest <= 48) {
              console.log(`  ⚠️  Orders may not be syncing regularly (${hoursSinceLatest} hours old)`)
            } else {
              console.log(`  ❌ Orders are stale (${hoursSinceLatest} hours old) - syncs may not be running`)
            }
          }
        }
        console.log(`  Orders Last 24h: ${Number(stats.last24h || 0).toLocaleString()}`)
        console.log(`  Orders Last 7d: ${Number(stats.last7d || 0).toLocaleString()}`)
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query order stats: ${e.message}`)
    }

    // Expected schedule reminder
    console.log('\n📅 Expected Schedule (if worker is running):')
    console.log('  Orders: Every 15 minutes')
    console.log('  Finances: Every 2 hours')
    console.log('  Inventory: Every hour')
    console.log('  Products: Daily at 6am')
    console.log('  Reports: Daily at 7am')
    console.log('  Aggregation: Daily at 7:30am')

    console.log('\n💡 To check queue status:')
    console.log('   Visit: http://localhost:3000/api/sync/status')
    console.log('   Or check: http://localhost:3000/api/admin/queues')

  } catch (error: any) {
    console.error('Error checking scheduled syncs:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkScheduledSyncs()



