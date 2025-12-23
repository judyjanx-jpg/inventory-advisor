// Check if worker is running and processing jobs

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function checkWorkerStatus() {
  try {
    console.log('\n🔍 WORKER STATUS CHECK\n')
    console.log('='.repeat(50))

    // Check if server is running
    const port = process.env.PORT || 3000
    const statusUrl = `http://localhost:${port}/api/sync/status`
    
    console.log(`\n📡 Checking queue status at: ${statusUrl}`)
    try {
      const response = await fetch(statusUrl)
      const data = await response.json()
      
      if (data.success) {
        console.log('✅ Queue API is responding')
        console.log(`   Redis connected: ${data.redisConnected ? '✅' : '❌'}`)
        
        if (data.queues && Array.isArray(data.queues)) {
          console.log('\n📊 Queue Status:')
          data.queues.forEach((queue: any) => {
            console.log(`\n  ${queue.name}:`)
            console.log(`    Schedule: ${queue.cron || 'N/A'}`)
            console.log(`    Counts: waiting=${queue.counts?.waiting || 0}, active=${queue.counts?.active || 0}, completed=${queue.counts?.completed || 0}, failed=${queue.counts?.failed || 0}`)
            
            if (queue.lastCompleted) {
              const lastRun = new Date(queue.lastCompleted.finishedOn)
              console.log(`    Last Completed: ${lastRun.toLocaleString()}`)
            }
            
            if (queue.lastFailed) {
              console.log(`    Last Failed: ${queue.lastFailed.failedReason}`)
            }
            
            if (queue.counts?.active > 0 || queue.counts?.waiting > 0) {
              console.log(`    ⚠️  Has pending/active jobs!`)
            }
          })
        }
      } else {
        console.log('❌ Queue API returned error:', data.error)
        if (data.message) {
          console.log('   Message:', data.message)
        }
      }
    } catch (e: any) {
      console.log(`\n❌ Could not reach queue API: ${e.message}`)
      console.log('   Make sure the dev server is running!')
    }

    // Check recent sync logs
    console.log('\n📋 Recent Sync Logs (Last 5):')
    try {
      const recentSyncs = await prisma.$queryRaw<any[]>`
        SELECT 
          sync_type as "syncType", 
          status, 
          "started_at" as "startedAt", 
          "completed_at" as "completedAt",
          "records_processed" as "recordsProcessed",
          "error_message" as "errorMessage"
        FROM sync_logs
        ORDER BY "started_at" DESC
        LIMIT 5
      `
      if (recentSyncs.length === 0) {
        console.log('  No sync logs found.')
      } else {
        recentSyncs.forEach((log: any) => {
          const statusIcon = log.status === 'success' ? '✅' : log.status === 'failed' ? '❌' : '🔄'
          console.log(`  ${statusIcon} ${log.syncType} (${log.status})`)
          if (log.startedAt) {
            console.log(`     Started: ${new Date(log.startedAt).toLocaleString()}`)
          }
          if (log.completedAt) {
            const duration = Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)
            console.log(`     Completed: ${new Date(log.completedAt).toLocaleString()} (${duration}s)`)
          }
          if (log.recordsProcessed) {
            console.log(`     Records: ${log.recordsProcessed}`)
          }
          if (log.errorMessage) {
            console.log(`     Error: ${log.errorMessage}`)
          }
        })
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query sync logs: ${e.message}`)
    }

    console.log('\n💡 What to look for in server console:')
    console.log('   1. "📦 Loading queue system..."')
    console.log('   2. "🔧 Starting sync worker..."')
    console.log('   3. "✅ Worker started and listening for jobs!"')
    console.log('   4. When you click Sync: "🚀 Triggering manual sync..."')
    console.log('   5. Then: "🔄 Job ... is now active"')
    console.log('   6. Finally: "✅ Job ... completed"')

  } finally {
    await prisma.$disconnect()
  }
}

checkWorkerStatus()





