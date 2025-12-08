// scripts/check-yesterday-stats.ts
// Check yesterday's order statistics

import { prisma } from '../lib/prisma'

async function checkYesterdayStats() {
  try {
    console.log('='.repeat(60))
    console.log('YESTERDAY ORDER STATISTICS')
    console.log('='.repeat(60))
    
    const results = await prisma.$queryRaw<Array<{
      total_units: bigint | null
      line_items: bigint
      unique_orders: bigint
    }>>`
      SELECT 
        SUM(oi.quantity) as total_units,
        COUNT(oi.id) as line_items,
        COUNT(DISTINCT o.id) as unique_orders
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
    `
    
    const result = results[0]
    if (result) {
      console.log(`\nTotal Units:        ${Number(result.total_units || 0).toLocaleString()}`)
      console.log(`Line Items:         ${Number(result.line_items).toLocaleString()}`)
      console.log(`Unique Orders:       ${Number(result.unique_orders).toLocaleString()}`)
      console.log(`\n💡 SellerBoard counts: ${Number(result.line_items).toLocaleString()} (line items)`)
      console.log(`   Difference: ${Number(result.line_items) - Number(result.unique_orders)} line items`)
    } else {
      console.log('No data found for yesterday')
    }
    
    console.log('\n' + '='.repeat(60))
    
  } catch (error: any) {
    console.error('Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

checkYesterdayStats()

