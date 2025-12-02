import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('\n=== September Order Analysis ===\n')
  
  // Total September orders
  const septTotal = await prisma.order.count({ 
    where: { 
      purchaseDate: { gte: new Date('2025-09-01'), lt: new Date('2025-10-01') }
    }
  })
  
  // Sept 1-15 orders
  const sept1_15 = await prisma.order.count({ 
    where: { 
      purchaseDate: { gte: new Date('2025-09-01'), lt: new Date('2025-09-16') }
    }
  })
  
  // Sept 1-15 orders WITH items
  const sept1_15_withItems = await prisma.order.count({ 
    where: { 
      purchaseDate: { gte: new Date('2025-09-01'), lt: new Date('2025-09-16') }, 
      orderItems: { some: {} }
    }
  })
  
  // Sept 1-15 orders WITHOUT items
  const sept1_15_noItems = await prisma.order.count({ 
    where: { 
      purchaseDate: { gte: new Date('2025-09-01'), lt: new Date('2025-09-16') }, 
      orderItems: { none: {} }
    }
  })
  
  // Total order items for Sept 1-15
  const sept1_15_items = await prisma.orderItem.count({ 
    where: { 
      order: { 
        purchaseDate: { gte: new Date('2025-09-01'), lt: new Date('2025-09-16') }
      }
    }
  })
  
  // Sample orders without items
  const ordersWithoutItems = await prisma.order.findMany({
    where: { 
      purchaseDate: { gte: new Date('2025-09-01'), lt: new Date('2025-09-16') }, 
      orderItems: { none: {} }
    },
    take: 5,
    select: { id: true, purchaseDate: true, status: true }
  })
  
  console.log('September total orders:', septTotal)
  console.log('')
  console.log('Sept 1-15 orders:', sept1_15)
  console.log('  - WITH items:', sept1_15_withItems)
  console.log('  - WITHOUT items:', sept1_15_noItems)
  console.log('  - Total order items:', sept1_15_items)
  console.log('')
  
  if (ordersWithoutItems.length > 0) {
    console.log('Sample orders WITHOUT items:')
    ordersWithoutItems.forEach(o => {
      console.log(`  ${o.id} - ${o.purchaseDate?.toISOString().split('T')[0]} - ${o.status}`)
    })
  }
  
  await prisma.$disconnect()
}

main()

