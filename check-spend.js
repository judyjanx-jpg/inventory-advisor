const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== CHECKING AD SPEND DATA ===\n');
  
  // Check advertising_daily
  console.log('advertising_daily (Dec 21-22):');
  const daily = await prisma.advertisingDaily.findMany({
    where: {
      campaignType: 'SP',
      date: { gte: new Date('2025-12-21'), lt: new Date('2025-12-23') }
    },
    orderBy: { date: 'desc' }
  });
  daily.forEach(d => {
    console.log(`  ${d.date.toISOString().split('T')[0]}: $${Number(d.spend || 0).toFixed(2)} | ${d.impressions} impr | ${d.clicks} clicks`);
  });
  
  // Check ad_product_spend totals
  console.log('\nad_product_spend totals by date:');
  const productTotals = await prisma.$queryRaw`
    SELECT 
      DATE(start_date) as date,
      SUM(spend)::numeric as total_spend,
      COUNT(*) as sku_count
    FROM ad_product_spend
    WHERE start_date >= '2025-12-21' AND start_date < '2025-12-23'
    GROUP BY DATE(start_date)
    ORDER BY date DESC
  `;
  productTotals.forEach(t => {
    console.log(`  ${t.date.toISOString().split('T')[0]}: $${Number(t.total_spend || 0).toFixed(2)} from ${t.sku_count} SKUs`);
  });
  
  // Check AdCampaign totals
  console.log('\nAdCampaign totals (snapshot, not by date):');
  const campaignTotal = await prisma.adCampaign.aggregate({
    _sum: { spend: true },
    _count: true
  });
  console.log(`  Total campaigns: ${campaignTotal._count}`);
  console.log(`  Total spend: $${Number(campaignTotal._sum.spend || 0).toFixed(2)}`);
  
  // Check top campaigns by spend
  console.log('\nTop 10 campaigns by spend:');
  const topCampaigns = await prisma.adCampaign.findMany({
    orderBy: { spend: 'desc' },
    take: 10
  });
  topCampaigns.forEach(c => {
    console.log(`  $${Number(c.spend || 0).toFixed(2).padStart(10)} | ${(c.campaignName || '').substring(0, 50)}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);

