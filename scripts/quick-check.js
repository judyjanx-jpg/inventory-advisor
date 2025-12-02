const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const sept2025 = await prisma.order.count({
    where: { purchaseDate: { gte: new Date('2025-09-01'), lt: new Date('2025-10-01') } }
  })
  console.log('Sept 2025 orders:', sept2025)
  
  const sept1_15 = await prisma.order.count({
    where: { purchaseDate: { gte: new Date('2025-09-01'), lt: new Date('2025-09-16') } }
  })
  console.log('Sept 1-15 orders:', sept1_15)
  
  const sept16_30 = await prisma.order.count({
    where: { purchaseDate: { gte: new Date('2025-09-16'), lt: new Date('2025-10-01') } }
  })
  console.log('Sept 16-30 orders:', sept16_30)
  
  await prisma.$disconnect()
}
main()
