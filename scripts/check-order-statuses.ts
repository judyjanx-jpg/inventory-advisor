import { query } from '../lib/db'

async function checkStatuses() {
  // Get status breakdown for today (PST boundaries)
  const result = await query(`
    SELECT
      o.status,
      COUNT(DISTINCT o.id) as order_count,
      COALESCE(SUM(oi.quantity), 0) as unit_count
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.purchase_date >= '2025-12-07T08:00:00.000Z'
      AND o.purchase_date <= '2025-12-08T07:59:59.999Z'
    GROUP BY o.status
    ORDER BY unit_count DESC
  `)

  console.log('\n=== Today Order Status Breakdown (Dec 7 PST) ===')
  let totalUnits = 0
  let shippedUnits = 0
  result.forEach((r: any) => {
    const units = parseInt(r.unit_count)
    totalUnits += units
    if (r.status === 'Shipped' || r.status === 'PartiallyShipped') {
      shippedUnits += units
    }
    console.log(`${r.status}: ${r.order_count} orders, ${units} units`)
  })
  console.log(`\nTotal: ${totalUnits} units`)
  console.log(`Shipped only: ${shippedUnits} units`)
  console.log(`Excluded (Pending/Unshipped): ${totalUnits - shippedUnits} units`)

  process.exit(0)
}

checkStatuses().catch(e => { console.error(e); process.exit(1) })
