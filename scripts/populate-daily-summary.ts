// Script to populate DailySummary from orders
// Run with: npx ts-node scripts/populate-daily-summary.ts
// Or add to package.json: "populate-summary": "ts-node scripts/populate-daily-summary.ts"

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function populateDailySummary() {
  console.log('=== Populating Daily Summary from Orders ===\n')

  try {
    // Get date range from orders
    const oldestOrder = await prisma.order.findFirst({
      orderBy: { purchaseDate: 'asc' },
    })
    
    const newestOrder = await prisma.order.findFirst({
      orderBy: { purchaseDate: 'desc' },
    })

    if (!oldestOrder || !newestOrder) {
      console.log('No orders found in database.')
      return
    }

    const startDate = new Date(oldestOrder.purchaseDate)
    startDate.setHours(0, 0, 0, 0)
    
    const endDate = new Date(newestOrder.purchaseDate)
    endDate.setHours(23, 59, 59, 999)

    console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)

    // Get all orders with items and product costs
    const orders = await prisma.order.findMany({
      where: {
        purchaseDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    })

    console.log(`Found ${orders.length} orders to process\n`)

    // Group by date
    const dailyData: Map<string, {
      date: Date
      totalRevenue: number
      totalFees: number
      totalCogs: number
      totalProfit: number
      unitsSold: number
      ordersCount: number
    }> = new Map()

    for (const order of orders) {
      const dateKey = order.purchaseDate.toISOString().split('T')[0]
      const dateObj = new Date(dateKey + 'T00:00:00.000Z')
      
      if (!dailyData.has(dateKey)) {
        dailyData.set(dateKey, {
          date: dateObj,
          totalRevenue: 0,
          totalFees: 0,
          totalCogs: 0,
          totalProfit: 0,
          unitsSold: 0,
          ordersCount: 0,
        })
      }

      const day = dailyData.get(dateKey)!
      day.ordersCount += 1
      day.totalRevenue += Number(order.orderTotal)

      for (const item of order.orderItems) {
        day.unitsSold += item.quantity
        
        const itemRevenue = Number(item.itemPrice) * item.quantity
        const itemCogs = Number(item.product?.cost || 0) * item.quantity
        const itemFees = Number(item.amazonFees || 0)
        
        day.totalFees += itemFees
        day.totalCogs += itemCogs
        day.totalProfit += itemRevenue - itemCogs - itemFees
      }
    }

    console.log(`Grouped into ${dailyData.size} days\n`)

    // Upsert daily summaries
    let created = 0
    let updated = 0

    for (const [dateKey, data] of dailyData) {
      const result = await prisma.dailySummary.upsert({
        where: { date: data.date },
        create: {
          date: data.date,
          totalRevenue: data.totalRevenue,
          totalFees: data.totalFees,
          totalCogs: data.totalCogs,
          totalProfit: data.totalProfit,
          unitsSold: data.unitsSold,
          ordersCount: data.ordersCount,
        },
        update: {
          totalRevenue: data.totalRevenue,
          totalFees: data.totalFees,
          totalCogs: data.totalCogs,
          totalProfit: data.totalProfit,
          unitsSold: data.unitsSold,
          ordersCount: data.ordersCount,
        },
      })

      // Check if it was created or updated (rough check)
      const existing = await prisma.dailySummary.findUnique({
        where: { date: data.date },
      })
      if (existing?.createdAt.getTime() === existing?.updatedAt.getTime()) {
        created++
      } else {
        updated++
      }
    }

    console.log(`✅ Done! Created: ${created}, Updated: ${updated}`)

    // Show summary
    const totalRevenue = Array.from(dailyData.values()).reduce((sum, d) => sum + d.totalRevenue, 0)
    const totalProfit = Array.from(dailyData.values()).reduce((sum, d) => sum + d.totalProfit, 0)
    const totalUnits = Array.from(dailyData.values()).reduce((sum, d) => sum + d.unitsSold, 0)

    console.log(`\n=== Summary ===`)
    console.log(`Total Revenue: $${totalRevenue.toLocaleString()}`)
    console.log(`Total Profit: $${totalProfit.toLocaleString()}`)
    console.log(`Total Units: ${totalUnits.toLocaleString()}`)
    console.log(`Profit Margin: ${((totalProfit / totalRevenue) * 100).toFixed(1)}%`)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

populateDailySummary()
