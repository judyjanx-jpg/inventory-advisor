import { prisma } from './lib/prisma';

async function checkForBadOrders() {
  // Check if any NULL channel orders exist now
  const nullOrders = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM orders
    WHERE sales_channel IS NULL
  `;
  console.log('Current NULL channel orders:');
  console.table(nullOrders);

  // Check orders created in the last hour
  const recentOrders = await prisma.$queryRaw`
    SELECT 
      sales_channel,
      COUNT(*)::int as count
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '1 hour'
    GROUP BY sales_channel
  `;
  console.log('\nOrders created in last hour (by channel):');
  console.table(recentOrders);

  await prisma.$disconnect();
}

checkForBadOrders();