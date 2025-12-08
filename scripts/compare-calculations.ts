// Compare profit tool calculation vs raw counts
import { query } from '../lib/db'

async function compareCalculations() {
  const todayStart = '2025-12-07T08:00:00.000Z'
  const todayEnd = '2025-12-08T07:59:59.999Z'

  console.log('\n=== Comparing Profit Tool vs Raw Data ===\n')

  // 1. Raw count using SUM(quantity) - what investigation script does
  const rawCount = await query(`
    SELECT
      COUNT(oi.id) as item_rows,
      COALESCE(SUM(oi.quantity), 0) as total_units,
      COALESCE(SUM(oi.item_price), 0)::numeric(10,2) as total_revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.purchase_date >= $1
      AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
  `, [todayStart, todayEnd])
  console.log('Method 1 - SUM(quantity):')
  console.log('  Item rows:', rawCount[0]?.item_rows)
  console.log('  Total units:', rawCount[0]?.total_units)
  console.log('  Total revenue: $' + rawCount[0]?.total_revenue)

  // 2. Check for NULL quantities that might default to 1
  const nullQuantities = await query(`
    SELECT COUNT(*) as count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.purchase_date >= $1
      AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
      AND (oi.quantity IS NULL OR oi.quantity = 0)
  `, [todayStart, todayEnd])
  console.log('\nItems with NULL or 0 quantity:', nullQuantities[0]?.count)

  // 3. Check for duplicate order_item rows (same order_id + master_sku)
  const duplicateItems = await query(`
    SELECT order_id, master_sku, COUNT(*) as count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.purchase_date >= $1
      AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
    GROUP BY order_id, master_sku
    HAVING COUNT(*) > 1
  `, [todayStart, todayEnd])
  console.log('Duplicate order_item rows (same order+sku):', duplicateItems.length)
  if (duplicateItems.length > 0) {
    console.log('Sample duplicates:', duplicateItems.slice(0, 5))
  }

  // 4. Simulate profit tool's loop calculation
  const orderItems = await query(`
    SELECT
      oi.quantity::text,
      oi.item_price::text
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.purchase_date >= $1
      AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
  `, [todayStart, todayEnd])

  let totalUnitsLoop = 0
  let totalRevenueLoop = 0
  for (const item of orderItems) {
    // This is exactly what the profit tool does
    const quantity = parseInt(item.quantity || '1', 10)
    const itemPrice = parseFloat(item.item_price || '0')
    totalUnitsLoop += quantity
    totalRevenueLoop += itemPrice
  }
  console.log('\nMethod 2 - Loop (profit tool method):')
  console.log('  Total units:', totalUnitsLoop)
  console.log('  Total revenue: $' + totalRevenueLoop.toFixed(2))

  // 5. Check quantity distribution
  const quantityDist = await query(`
    SELECT
      oi.quantity,
      COUNT(*) as count
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.purchase_date >= $1
      AND o.purchase_date <= $2
      AND o.status != 'Cancelled'
    GROUP BY oi.quantity
    ORDER BY oi.quantity
  `, [todayStart, todayEnd])
  console.log('\nQuantity distribution:')
  quantityDist.forEach((q: any) => {
    console.log(`  quantity=${q.quantity}: ${q.count} items`)
  })

  process.exit(0)
}

compareCalculations().catch(e => { console.error(e); process.exit(1) })
