import { prisma } from './lib/prisma';

async function fullSeptemberCheck() {
  // Total September orders
  const totalOrders = await prisma.order.count({
    where: {
      purchaseDate: {
        gte: new Date('2025-09-01'),
        lt: new Date('2025-10-01')
      }
    }
  });
  console.log('Total September orders:', totalOrders);

  // Orders WITH items
  const withItems = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT o.id)::int as count
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    WHERE o.purchase_date >= '2025-09-01' 
    AND o.purchase_date < '2025-10-01'
  `;
  console.log('September orders WITH items:', withItems);

  // Daily breakdown for early Sept
  const daily = await prisma.$queryRaw`
    SELECT 
      DATE(purchase_date) as day,
      COUNT(*)::int as orders
    FROM orders
    WHERE purchase_date >= '2025-09-01' 
    AND purchase_date < '2025-09-10'
    GROUP BY DATE(purchase_date)
    ORDER BY day
  `;
  console.log('Early September daily orders:');
  console.table(daily);

  await prisma.$disconnect();
}

fullSeptemberCheck();