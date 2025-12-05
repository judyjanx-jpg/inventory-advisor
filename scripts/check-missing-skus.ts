import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('\n=== Missing SKU Analysis ===\n')
  
  // Sample SKUs from the user's report
  const reportSkus = [
    'MJ925CURG0508B',
    'MJ925BCG118',
    'MJNASHLEY',
    'MJ925FIGG0307',
    'MJ925CURG3507',
    'MJNMEGAN',
    'MJ925CCS1618B',
  ]

  // Check which exist in products table
  const existingProducts = await prisma.product.findMany({
    where: { sku: { in: reportSkus } },
    select: { sku: true },
  })
  
  const existingSkus = new Set(existingProducts.map((p: any) => p.sku))
  
  console.log('SKUs from report:')
  for (const sku of reportSkus) {
    const exists = existingSkus.has(sku) ? '✓ EXISTS' : '❌ MISSING'
    console.log(`  ${sku}: ${exists}`)
  }
  
  // Count total products
  const totalProducts = await prisma.product.count()
  console.log(`\nTotal products in database: ${totalProducts}`)
  
  // Count September 2025 orders
  const septOrders = await prisma.order.count({
    where: {
      purchaseDate: { 
        gte: new Date('2025-09-01'), 
        lt: new Date('2025-10-01') 
      }
    }
  })
  console.log(`September 2025 orders: ${septOrders}`)
  
  // Count Sept 1-15 orders
  const sept1_15 = await prisma.order.count({
    where: {
      purchaseDate: { 
        gte: new Date('2025-09-01'), 
        lt: new Date('2025-09-16') 
      }
    }
  })
  console.log(`Sept 1-15 orders: ${sept1_15}`)
  
  // Orders WITHOUT any items
  const ordersNoItems = await prisma.order.count({
    where: {
      purchaseDate: { 
        gte: new Date('2025-09-01'), 
        lt: new Date('2025-09-16') 
      },
      orderItems: { none: {} }
    }
  })
  console.log(`Sept 1-15 orders with NO items: ${ordersNoItems}`)
  
  // Sample some order IDs from Sept 1-15
  console.log('\nSample Sept 1-15 order IDs:')
  const sampleOrders = await prisma.order.findMany({
    where: {
      purchaseDate: { 
        gte: new Date('2025-09-01'), 
        lt: new Date('2025-09-05') 
      }
    },
    select: { id: true, purchaseDate: true },
    take: 10,
    orderBy: { purchaseDate: 'asc' }
  })
  
  for (const order of sampleOrders) {
    console.log(`  ${order.id} - ${order.purchaseDate}`)
  }
  
  await prisma.$disconnect()
}

main()

