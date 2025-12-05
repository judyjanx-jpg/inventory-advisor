import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get date range (last 30 days)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    // First, check if DailySummary has data
    let dailySummaries = await prisma.dailySummary.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    })

    let totalRevenue = 0
    let totalProfit = 0
    let totalUnitsSold = 0
    let totalOrders = 0
    let totalFees = 0
    let totalCogs = 0

    if (dailySummaries.length > 0) {
      // Use DailySummary data
      totalRevenue = dailySummaries.reduce((sum: any, day: any) => sum + Number(day.totalRevenue), 0)
      totalProfit = dailySummaries.reduce((sum: any, day: any) => sum + Number(day.totalProfit), 0)
      totalUnitsSold = dailySummaries.reduce((sum: any, day: any) => sum + day.unitsSold, 0)
      totalOrders = dailySummaries.reduce((sum: any, day: any) => sum + day.ordersCount, 0)
    } else {
      // Fallback: Calculate directly from orders and order items
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

      totalOrders = orders.length
      
      for (const order of orders) {
        // Calculate revenue from order items (more reliable than orderTotal)
        for (const item of order.orderItems) {
          const quantity = item.quantity || 1
          const itemPrice = Number(item.itemPrice || 0)
          const itemRevenue = itemPrice * quantity
          
          totalRevenue += itemRevenue
          totalUnitsSold += quantity
          
          // Calculate costs
          const cost = Number(item.product?.cost || 0) * quantity
          const fees = Number(item.amazonFees || 0)
          
          totalCogs += cost
          totalFees += fees
          totalProfit += itemRevenue - cost - fees
        }
        
        // Fallback: if no items, use orderTotal
        if (order.orderItems.length === 0 && order.orderTotal) {
          totalRevenue += Number(order.orderTotal)
        }
      }
    }

    const profitMargin = totalRevenue > 0 
      ? (totalProfit / totalRevenue) * 100 
      : 0

    // Get low stock products with velocity data for "days left" calculation
    const lowStockData = await prisma.inventoryLevel.findMany({
      where: {
        OR: [
          { fbaAvailable: { lt: 50 } },
          { warehouseAvailable: { lt: 100 } },
        ],
      },
      include: {
        product: {
          include: {
            salesVelocity: true,
          },
        },
      },
      take: 10,
    })

    // Transform to match frontend expected format
    const lowStockProducts = lowStockData.map((item: any) => {
      const totalStock = (item.fbaAvailable || 0) + (item.warehouseAvailable || 0)
      const velocity30d = Number(item.product?.salesVelocity?.velocity30d || 0)
      const dailyVelocity = velocity30d / 30
      const daysLeft = dailyVelocity > 0 ? Math.round(totalStock / dailyVelocity) : 999
      
      return {
        sku: item.masterSku,
        title: item.product?.name || item.product?.title || item.masterSku,
        stock: totalStock,
        daysLeft: daysLeft > 999 ? 999 : daysLeft,
      }
    })

    // Get pending purchase orders count
    const pendingPOs = await prisma.purchaseOrder.count({
      where: {
        status: {
          in: ['draft', 'sent', 'confirmed', 'shipped', 'partial'],
        },
      },
    })

    // Get inbound shipments count
    const inboundShipments = await prisma.shipment.count({
      where: {
        status: {
          in: ['submitted', 'shipped', 'in_transit', 'receiving'],
        },
      },
    })

    // Get recent orders for activity feed
    const recentOrders = await prisma.order.findMany({
      orderBy: { purchaseDate: 'desc' },
      take: 5,
      include: {
        orderItems: true,
      },
    })

    // Format recent activity to match frontend expected format
    const recentActivity = recentOrders.map((order: any) => {
      // Calculate order total from items if orderTotal is 0
      let amount = Number(order.orderTotal || 0)
      if (amount === 0) {
        amount = order.orderItems.reduce((sum: any, item: any) => {
          return sum + (Number(item.itemPrice || 0) * (item.quantity || 1))
        }, 0)
      }
      
      return {
        id: order.id,
        type: 'order',
        description: `Order ${order.id}`,
        amount,
        date: order.purchaseDate,
        itemCount: order.orderItems.length,
      }
    })

    return NextResponse.json({
      stats: {
        totalRevenue,
        totalProfit,
        profitMargin: Number(profitMargin.toFixed(2)),
        unitsSold: totalUnitsSold,
        ordersCount: totalOrders,
        lowStockItems: lowStockProducts.length,
        pendingPOs,
        inboundShipments,
      },
      lowStockProducts,
      recentActivity,
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
