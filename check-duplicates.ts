import { prisma } from './lib/prisma';

async function checkBadOrders() {
  // Count how many NULL orders have purchase_date ≈ created_at (within 1 minute)
  const badOrders = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM orders
    WHERE sales_channel IS NULL
    AND ABS(EXTRACT(EPOCH FROM (purchase_date - created_at))) < 60
  `;
  console.log('Orders where purchase_date ≈ created_at (bad data):');
  console.table(badOrders);

  // Total NULL channel orders
  const totalNull = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM orders
    WHERE sales_channel IS NULL
  `;
  console.log('\nTotal NULL channel orders:');
  console.table(totalNull);

  // Total good orders (Amazon.com channel)
  const totalGood = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM orders
    WHERE sales_channel = 'Amazon.com'
  `;
  console.log('\nTotal Amazon.com channel orders:');
  console.table(totalGood);

  await prisma.$disconnect();
}

checkBadOrders();