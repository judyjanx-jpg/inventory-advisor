// Investigate why our unit count differs from Amazon/Sellerboard
import { query } from '../lib/db'

async function investigate() {
  // Today's date range in PST (Dec 7, 2025)
  const todayStart = '2025-12-07T08:00:00.000Z'
  const todayEnd = '2025-12-08T07:59:59.999Z'

  console.log('\n=== Investigating Data Discrepancy ===\n')
  console.log('Date range (PST): Dec 7, 2025 00:00:00 - 23:59:59')
  console.log('Date range (UTC):', todayStart, 'to', todayEnd)

  // 1. Check for duplicate order IDs
  console.log('\n--- 1. Checking for Duplicate Orders ---')
  const duplicates = await query(`
    SELECT id, COUNT(*) as count
    FROM orders
    WHERE purchase_date >= $1 AND purchase_date <= $2
    GROUP BY id
    HAVING COUNT(*) > 1
  `, [todayStart, todayEnd])
  console.log('Duplicate order IDs found:', duplicates.length)
  if (duplicates.length > 0) {
    console.log('Sample duplicates:', duplicates.slice(0, 5))
  }

  // 2. Check order status breakdown
  console.log('\n--- 2. Order Status Breakdown ---')
  const statusBreakdown = await query(`
    SELECT
      status,
      COUNT(DISTINCT o.id) as orders,
      COALESCE(SUM(oi.quantity), 0) as units,
      COALESCE(SUM(oi.item_price), 0)::numeric(10,2) as revenue
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.purchase_date >= $1 AND o.purchase_date <= $2
    GROUP BY status
    ORDER BY units DESC
  `, [todayStart, todayEnd])
  let totalUnits = 0
  statusBreakdown.forEach((s: any) => {
    totalUnits += parseInt(s.units)
    console.log(`  ${s.status || 'NULL'}: ${s.orders} orders, ${s.units} units, $${s.revenue}`)
  })
  console.log(`  TOTAL: ${totalUnits} units`)

  // 3. Check fulfillment channel breakdown (FBA vs FBM vs unknown)
  console.log('\n--- 3. Fulfillment Channel Breakdown ---')
  const channelBreakdown = await query(`
    SELECT
      COALESCE(fulfillment_channel, 'Unknown') as channel,
      COUNT(DISTINCT o.id) as orders,
      COALESCE(SUM(oi.quantity), 0) as units
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.purchase_date >= $1 AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
    GROUP BY fulfillment_channel
    ORDER BY units DESC
  `, [todayStart, todayEnd])
  channelBreakdown.forEach((c: any) => {
    console.log(`  ${c.channel}: ${c.orders} orders, ${c.units} units`)
  })

  // 4. Check sales channel breakdown (Amazon.com, Amazon Business, etc)
  console.log('\n--- 4. Sales Channel Breakdown ---')
  const salesChannelBreakdown = await query(`
    SELECT
      COALESCE(sales_channel, 'Unknown') as channel,
      COUNT(DISTINCT o.id) as orders,
      COALESCE(SUM(oi.quantity), 0) as units
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.purchase_date >= $1 AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
    GROUP BY sales_channel
    ORDER BY units DESC
  `, [todayStart, todayEnd])
  salesChannelBreakdown.forEach((c: any) => {
    console.log(`  ${c.channel}: ${c.orders} orders, ${c.units} units`)
  })

  // 5. Check for orders with missing order items
  console.log('\n--- 5. Orders Missing Order Items ---')
  const missingItems = await query(`
    SELECT COUNT(*) as count
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.purchase_date >= $1 AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
      AND oi.id IS NULL
  `, [todayStart, todayEnd])
  console.log('Orders with no order items:', missingItems[0]?.count || 0)

  // 6. Check for order items with quantity > 1 (multi-unit orders)
  console.log('\n--- 6. Multi-Unit Order Items ---')
  const multiUnit = await query(`
    SELECT
      SUM(CASE WHEN oi.quantity = 1 THEN 1 ELSE 0 END) as single_unit_items,
      SUM(CASE WHEN oi.quantity > 1 THEN 1 ELSE 0 END) as multi_unit_items,
      SUM(CASE WHEN oi.quantity > 1 THEN oi.quantity ELSE 0 END) as units_from_multi
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.purchase_date >= $1 AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
  `, [todayStart, todayEnd])
  console.log('Single-unit items:', multiUnit[0]?.single_unit_items)
  console.log('Multi-unit items:', multiUnit[0]?.multi_unit_items)
  console.log('Total units from multi-unit items:', multiUnit[0]?.units_from_multi)

  // 7. Check timezone edge cases - orders right at midnight boundaries
  console.log('\n--- 7. Orders at Day Boundaries (potential timezone issues) ---')
  const boundaryOrders = await query(`
    SELECT
      purchase_date,
      COUNT(*) as count
    FROM orders
    WHERE purchase_date >= $1::timestamp - interval '1 hour'
      AND purchase_date <= $1::timestamp + interval '1 hour'
    GROUP BY purchase_date
    ORDER BY purchase_date
    LIMIT 10
  `, [todayStart])
  console.log('Orders around start of day (UTC 08:00):')
  boundaryOrders.forEach((b: any) => {
    console.log(`  ${b.purchase_date}: ${b.count} orders`)
  })

  process.exit(0)
}

investigate().catch(e => { console.error(e); process.exit(1) })
