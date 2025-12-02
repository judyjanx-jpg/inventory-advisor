import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function checkSyncStatus() {
  try {
    console.log('\n📊 SYNC STATUS CHECK\n')
    console.log('='.repeat(50))

    // Check recent sync logs using raw SQL
    console.log('\n🔄 Recent Sync Logs:')
    try {
      const recentSyncs = await prisma.$queryRaw<any[]>`
        SELECT 
          id,
          sync_type as "syncType",
          status,
          started_at as "startedAt",
          completed_at as "completedAt",
          records_processed as "recordsProcessed",
          records_created as "recordsCreated",
          records_updated as "recordsUpdated",
          error_message as "errorMessage"
        FROM sync_logs 
        ORDER BY started_at DESC 
        LIMIT 10
      `

      if (recentSyncs.length === 0) {
        console.log('  ⚠️  No sync logs found')
      } else {
        recentSyncs.forEach((sync: any) => {
          const startedAt = sync.startedAt ? new Date(sync.startedAt) : null
          const completedAt = sync.completedAt ? new Date(sync.completedAt) : null
          const duration = completedAt && startedAt
            ? `${Math.round((completedAt.getTime() - startedAt.getTime()) / 1000 / 60)} min`
            : 'running...'
          console.log(`  ${sync.status === 'success' ? '✅' : sync.status === 'failed' ? '❌' : '🔄'} ${sync.syncType}`)
          if (startedAt) {
            console.log(`     Started: ${startedAt.toLocaleString()}`)
          }
          if (completedAt) {
            console.log(`     Completed: ${completedAt.toLocaleString()} (${duration})`)
          }
          console.log(`     Records: ${sync.recordsProcessed || 0} processed, ${sync.recordsCreated || 0} created, ${sync.recordsUpdated || 0} updated`)
          if (sync.errorMessage) {
            console.log(`     Error: ${sync.errorMessage.substring(0, 100)}`)
          }
          console.log('')
        })
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query sync logs: ${e.message}`)
    }

    // Check most recent orders using raw SQL
    console.log('\n📦 Most Recent Orders:')
    try {
      const recentOrders = await prisma.$queryRaw<any[]>`
        SELECT 
          id,
          purchase_date as "purchaseDate",
          status,
          fulfillment_channel as "fulfillmentChannel"
        FROM orders 
        ORDER BY purchase_date DESC 
        LIMIT 5
      `

      if (recentOrders.length === 0) {
        console.log('  ⚠️  No orders found')
      } else {
        recentOrders.forEach((order: any) => {
          const date = order.purchaseDate ? new Date(order.purchaseDate) : null
          console.log(`  ${order.id?.substring(0, 20) || 'N/A'}... | ${date?.toLocaleDateString() || 'N/A'} | ${order.status || 'N/A'} | ${order.fulfillmentChannel || 'N/A'}`)
        })
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query orders: ${e.message}`)
    }

    // Check order date range
    console.log('\n📅 Order Date Range:')
    try {
      const orderStats = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as total,
          MIN(purchase_date) as earliest,
          MAX(purchase_date) as latest
        FROM orders
      `

      if (orderStats && orderStats[0] && orderStats[0].total > 0) {
        const stats = orderStats[0]
        console.log(`  Total Orders: ${Number(stats.total).toLocaleString()}`)
        if (stats.earliest) {
          console.log(`  Earliest: ${new Date(stats.earliest).toLocaleDateString()}`)
        }
        if (stats.latest) {
          const latestDate = new Date(stats.latest)
          console.log(`  Latest: ${latestDate.toLocaleDateString()}`)
          
          const daysSinceLatest = Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24))
          console.log(`  Days since latest order: ${daysSinceLatest}`)
          if (daysSinceLatest > 2) {
            console.log(`  ⚠️  WARNING: Latest order is ${daysSinceLatest} days old - sync may not be running`)
          } else {
            console.log(`  ✅ Recent data looks good`)
          }
        }
      } else {
        console.log('  ⚠️  No orders in database')
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query order stats: ${e.message}`)
    }

    // Check product count
    console.log('\n🛍️  Product Sync Status:')
    try {
      const productStats = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as total,
          MAX(updated_at) as "lastUpdated"
        FROM products
      `
      if (productStats && productStats[0]) {
        const stats = productStats[0]
        console.log(`  Total Products: ${Number(stats.total).toLocaleString()}`)
        if (stats.lastUpdated) {
          const lastUpdate = new Date(stats.lastUpdated)
          const daysSinceUpdate = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24))
          console.log(`  Last Updated: ${lastUpdate.toLocaleString()} (${daysSinceUpdate} days ago)`)
        }
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query products: ${e.message}`)
    }

    // Check scheduled sync types
    console.log('\n⏰ Sync Types Summary:')
    try {
      const syncTypes = await prisma.$queryRaw<any[]>`
        SELECT 
          sync_type as "syncType",
          COUNT(*) as count,
          MAX(started_at) as "lastRun"
        FROM sync_logs
        GROUP BY sync_type
        ORDER BY count DESC
      `
      if (syncTypes && syncTypes.length > 0) {
        syncTypes.forEach((type: any) => {
          const lastRun = type.lastRun ? new Date(type.lastRun).toLocaleString() : 'never'
          console.log(`  ${type.syncType}: ${type.count} runs (last: ${lastRun})`)
        })
      }
    } catch (e: any) {
      console.log(`  ⚠️  Could not query sync types: ${e.message}`)
    }

  } catch (error: any) {
    console.error('Error checking sync status:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkSyncStatus()
