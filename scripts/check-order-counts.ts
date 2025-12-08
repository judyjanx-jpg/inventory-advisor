// scripts/check-order-counts.ts
// Compare distinct orders vs order line items

import { prisma } from '../lib/prisma'

async function checkOrderCounts() {
  try {
    console.log('='.repeat(60))
    console.log('ORDER COUNT COMPARISON')
    console.log('='.repeat(60))
    
    // Query 1: Yesterday
    console.log('\n📅 YESTERDAY:')
    console.log('-'.repeat(60))
    const yesterdayResults = await prisma.$queryRaw<Array<{
      unique_orders: bigint
      order_line_items: bigint
      total_units: bigint | null
    }>>`
      SELECT 
        COUNT(DISTINCT o.id)::bigint as unique_orders,
        COUNT(oi.id)::bigint as order_line_items,
        SUM(oi.quantity)::bigint as total_units
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
    `
    
    const yesterday = yesterdayResults[0]
    if (yesterday) {
      console.log(`Unique Orders (DISTINCT o.id):        ${Number(yesterday.unique_orders).toLocaleString()}`)
      console.log(`Order Line Items (COUNT oi.id):       ${Number(yesterday.order_line_items).toLocaleString()}`)
      console.log(`Total Units:                         ${Number(yesterday.total_units || 0).toLocaleString()}`)
      console.log(`\n💡 SellerBoard counts: ${Number(yesterday.order_line_items).toLocaleString()} (line items)`)
      console.log(`   Your app counts: ${Number(yesterday.unique_orders).toLocaleString()} (distinct orders)`)
      console.log(`   Difference: ${Number(yesterday.order_line_items) - Number(yesterday.unique_orders)}`)
    }

    // Query 2: 30 Days
    console.log('\n📅 LAST 30 DAYS:')
    console.log('-'.repeat(60))
    const thirtyDayResults = await prisma.$queryRaw<Array<{
      unique_orders: bigint
      order_line_items: bigint
      total_units: bigint | null
    }>>`
      SELECT 
        COUNT(DISTINCT o.id)::bigint as unique_orders,
        COUNT(oi.id)::bigint as order_line_items,
        SUM(oi.quantity)::bigint as total_units
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '30 days'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
    `
    
    const thirtyDay = thirtyDayResults[0]
    if (thirtyDay) {
      console.log(`Unique Orders (DISTINCT o.id):        ${Number(thirtyDay.unique_orders).toLocaleString()}`)
      console.log(`Order Line Items (COUNT oi.id):       ${Number(thirtyDay.order_line_items).toLocaleString()}`)
      console.log(`Total Units:                         ${Number(thirtyDay.total_units || 0).toLocaleString()}`)
      console.log(`\n💡 SellerBoard counts: ${Number(thirtyDay.order_line_items).toLocaleString()} (line items)`)
      console.log(`   Your app counts: ${Number(thirtyDay.unique_orders).toLocaleString()} (distinct orders)`)
      console.log(`   Difference: ${Number(thirtyDay.order_line_items) - Number(thirtyDay.unique_orders)}`)
    }

    console.log('\n' + '='.repeat(60))
    console.log('CONCLUSION:')
    console.log('SellerBoard counts ORDER LINE ITEMS, not distinct orders.')
    console.log('To match SellerBoard, change COUNT(DISTINCT o.id) to COUNT(oi.id)')
    console.log('='.repeat(60))
    
  } catch (error: any) {
    console.error('Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

checkOrderCounts()

