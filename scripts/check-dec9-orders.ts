// scripts/check-dec9-orders.ts
// Check December 9 orders - when were they actually placed?

import { prisma } from '../lib/prisma'

async function checkDec9Orders() {
  try {
    console.log('='.repeat(80))
    console.log('DECEMBER 9 ORDERS - Purchase Date Analysis')
    console.log('='.repeat(80))
    
    const results = await prisma.$queryRaw<Array<{
      amazon_order_id: string
      purchase_date: Date
      purchase_date_pst: Date
      synced_at: Date
    }>>`
      SELECT 
        o.id as amazon_order_id,
        o.purchase_date,
        (o.purchase_date AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles' as purchase_date_pst,
        o.created_at as synced_at
      FROM orders o
      WHERE DATE((o.purchase_date AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles') = '2025-12-09'
      LIMIT 5
    `
    
    if (results.length === 0) {
      console.log('No orders found for December 9, 2025')
    } else {
      console.log('\nOrder ID                    | Purchase Date (UTC)        | Purchase Date (PST)         | Synced At')
      console.log('-'.repeat(80))
      for (const row of results) {
        const orderId = row.amazon_order_id.substring(0, 25).padEnd(25)
        const purchaseDateUTC = new Date(row.purchase_date).toISOString().replace('T', ' ').substring(0, 19)
        const purchaseDatePST = new Date(row.purchase_date_pst).toISOString().replace('T', ' ').substring(0, 19)
        const syncedAt = new Date(row.synced_at).toISOString().replace('T', ' ').substring(0, 19)
        console.log(`${orderId} | ${purchaseDateUTC} | ${purchaseDatePST} | ${syncedAt}`)
      }
    }
    
    console.log('\n' + '='.repeat(80))
    
  } catch (error: any) {
    console.error('Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

checkDec9Orders()

