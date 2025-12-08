// scripts/diagnose-profit-issue.ts
// Diagnostic queries to help pinpoint profit calculation issues

import 'dotenv/config'
import { query } from '../lib/db'

async function runDiagnostics() {
  console.log('\n=== DIAGNOSTIC QUERIES FOR PROFIT CALCULATION ISSUES ===\n')

  try {
    // Query 1: Check what order statuses exist and their counts
    console.log('1. Order Statuses (last 24 hours):')
    console.log('-----------------------------------')
    const statusCounts = await query(`
      SELECT status, COUNT(*) as order_count 
      FROM orders 
      WHERE purchase_date >= NOW() - INTERVAL '1 day'
      GROUP BY status
      ORDER BY order_count DESC
    `)
    statusCounts.forEach((row: any) => {
      console.log(`  ${row.status || 'NULL'}: ${row.order_count} orders`)
    })
    console.log('')

    // Query 2: Check if item_price is per-unit or line total
    console.log('2. Sample Order Items (checking if item_price is per-unit or total):')
    console.log('----------------------------------------------------------------------')
    const sampleItems = await query(`
      SELECT 
        master_sku,
        quantity,
        item_price,
        item_price / NULLIF(quantity, 0) as price_per_unit_if_total,
        shipping_price,
        gift_wrap_price,
        gross_revenue
      FROM order_items 
      ORDER BY id DESC
      LIMIT 10
    `)
    sampleItems.forEach((item: any) => {
      console.log(`  SKU: ${item.master_sku}`)
      console.log(`    Quantity: ${item.quantity}`)
      console.log(`    Item Price: $${item.item_price}`)
      console.log(`    Price per unit (if total): $${item.price_per_unit_if_total}`)
      console.log(`    Shipping: $${item.shipping_price || 0}`)
      console.log(`    Gift Wrap: $${item.gift_wrap_price || 0}`)
      console.log(`    Gross Revenue: $${item.gross_revenue || 0}`)
      console.log('')
    })

    // Query 3: Compare totals with and without status filter (yesterday)
    console.log('3. Yesterday Totals Comparison:')
    console.log('--------------------------------')
    const yesterdayTotals = await query(`
      SELECT 
        COUNT(DISTINCT o.id) as orders,
        SUM(oi.quantity) as units,
        SUM(oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)) as sales_current_calc,
        SUM(COALESCE(oi.gross_revenue, oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0))) as sales_with_gross_revenue,
        SUM((oi.item_price * oi.quantity) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)) as sales_if_per_unit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
    `)
    
    const totals = yesterdayTotals[0] as any
    console.log(`  Orders: ${totals.orders}`)
    console.log(`  Units: ${totals.units}`)
    console.log(`  Sales (current calc): $${Number(totals.sales_current_calc || 0).toFixed(2)}`)
    console.log(`  Sales (with gross_revenue): $${Number(totals.sales_with_gross_revenue || 0).toFixed(2)}`)
    console.log(`  Sales (if item_price is per-unit): $${Number(totals.sales_if_per_unit || 0).toFixed(2)}`)
    console.log('')

    // Query 4: Check orders by status for yesterday
    console.log('4. Yesterday Orders by Status:')
    console.log('-------------------------------')
    const yesterdayByStatus = await query(`
      SELECT 
        o.status,
        COUNT(DISTINCT o.id) as orders,
        SUM(oi.quantity) as units,
        SUM(COALESCE(oi.gross_revenue, oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0))) as sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
      GROUP BY o.status
      ORDER BY orders DESC
    `)
    yesterdayByStatus.forEach((row: any) => {
      console.log(`  ${row.status || 'NULL'}: ${row.orders} orders, ${row.units} units, $${Number(row.sales || 0).toFixed(2)}`)
    })
    console.log('')

    // Query 5: Check for orders without items
    console.log('5. Orders without items (yesterday):')
    console.log('------------------------------------')
    const ordersWithoutItems = await query(`
      SELECT 
        COUNT(*) as order_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
        AND oi.id IS NULL
    `)
    console.log(`  Orders without items: ${(ordersWithoutItems[0] as any)?.order_count || 0}`)
    console.log('')

    // Query 6: Check for items with NULL or 0 gross_revenue
    console.log('6. Items with NULL or 0 gross_revenue (yesterday):')
    console.log('---------------------------------------------------')
    const itemsWithoutGrossRevenue = await query(`
      SELECT 
        COUNT(*) as item_count,
        SUM(oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)) as calculated_sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
        AND (oi.gross_revenue IS NULL OR oi.gross_revenue = 0)
    `)
    const itemsWithoutGross = itemsWithoutGrossRevenue[0] as any
    console.log(`  Items without gross_revenue: ${itemsWithoutGross?.item_count || 0}`)
    console.log(`  Calculated sales for these items: $${Number(itemsWithoutGross?.calculated_sales || 0).toFixed(2)}`)
    console.log('')

    console.log('=== DIAGNOSTICS COMPLETE ===\n')

  } catch (error: any) {
    console.error('Error running diagnostics:', error.message)
    console.error(error.stack)
  } finally {
    process.exit(0)
  }
}

runDiagnostics()

