import { prisma } from './lib/prisma';

async function checkRecentGaps() {
  const daily = await prisma.$queryRaw`
    SELECT 
      DATE(purchase_date) as day,
      COUNT(*)::int as orders
    FROM orders
    WHERE purchase_date >= '2025-11-25'
    GROUP BY DATE(purchase_date)
    ORDER BY day
  `;
  console.table(daily);
  
  await prisma.$disconnect();
}

checkRecentGaps();