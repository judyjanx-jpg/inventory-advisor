// scripts/check-daily-stats.ts
// Check daily order statistics for last 3 days

import { prisma } from '../lib/prisma'

async function checkDailyStats() {
  try {
    console.log('='.repeat(60))
    console.log('DAILY ORDER STATISTICS (Last 3 Days)')
    console.log('='.repeat(60))
    
    const results = await prisma.$queryRaw<Array<{
      order_date: Date
      units: bigint | null
      line_items: bigint
    }>>`
      SELECT 
        DATE((o.purchase_date AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles') as order_date,
        SUM(oi.quantity) as units,
        COUNT(oi.id) as line_items
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= NOW() - INTERVAL '3 days'
        AND o.status NOT IN ('Cancelled', 'Canceled')
      GROUP BY DATE((o.purchase_date AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles')
      ORDER BY order_date DESC
    `
    
    if (results.length === 0) {
      console.log('No data found for the last 3 days')
    } else {
      console.log('\nDate          | Units    | Line Items')
      console.log('-'.repeat(60))
      for (const row of results) {
        const date = new Date(row.order_date).toISOString().split('T')[0]
        const units = Number(row.units || 0).toLocaleString()
        const lineItems = Number(row.line_items).toLocaleString()
        console.log(`${date} | ${units.padStart(8)} | ${lineItems.padStart(10)}`)
      }
      
      const totalUnits = results.reduce((sum, r) => sum + Number(r.units || 0), 0)
      const totalLineItems = results.reduce((sum, r) => sum + Number(r.line_items), 0)
      console.log('-'.repeat(60))
      console.log(`Total         | ${totalUnits.toLocaleString().padStart(8)} | ${totalLineItems.toLocaleString().padStart(10)}`)
    }
    
    console.log('\n' + '='.repeat(60))
    
  } catch (error: any) {
    console.error('Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

checkDailyStats()

