require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    // Use raw SQL to check orders
    const orderStats = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total,
        MIN(purchase_date) as earliest,
        MAX(purchase_date) as latest
      FROM orders
    `;
    
    const returnStats = await prisma.$queryRaw`
      SELECT COUNT(*) as total, MIN(return_date) as earliest FROM returns
    `;
    
    console.log('📊 SYNC DATA RANGE CHECK');
    console.log('========================');
    console.log(`Orders: ${orderStats[0].total} total`);
    if (orderStats[0].earliest) console.log(`  Earliest: ${new Date(orderStats[0].earliest).toISOString().split('T')[0]}`);
    if (orderStats[0].latest) console.log(`  Latest: ${new Date(orderStats[0].latest).toISOString().split('T')[0]}`);
    console.log(`Returns: ${returnStats[0].total} total`);
    if (returnStats[0].earliest) console.log(`  Earliest: ${new Date(returnStats[0].earliest).toISOString().split('T')[0]}`);
    
    // Determine sync type
    if (orderStats[0].earliest) {
      const daysBack = Math.floor((new Date() - new Date(orderStats[0].earliest)) / (1000 * 60 * 60 * 24));
      console.log(`\n📅 Data spans ~${daysBack} days`);
      if (daysBack > 60) {
        console.log('✅ This appears to be the FULL 2-YEAR sync');
      } else {
        console.log('📝 This appears to be a 30-DAY test sync');
      }
    }
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();

