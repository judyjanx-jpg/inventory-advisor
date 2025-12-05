// app/api/debug/profit/route.ts
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { startOfDay, subDays } from 'date-fns'

export async function GET() {
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = startOfDay(subDays(now, 1))

  try {
    // 1. Order counts
    const todayOrderCount = await prisma.order.count({
      where: { purchaseDate: { gte: today } }
    })

    const yesterdayOrderCount = await prisma.order.count({
      where: { 
        purchaseDate: { gte: yesterday, lt: today } 
      }
    })

    // 2. Get a few today's order IDs
    const todayOrders = await prisma.order.findMany({
      where: { purchaseDate: { gte: today } },
      select: { id: true, purchaseDate: true, status: true, orderTotal: true },
      take: 5
    })

    // 3. Check if those order IDs have any items
    const todayOrderIds = todayOrders.map(o => o.id)
    const itemsForTodayOrders = await prisma.orderItem.count({
      where: { orderId: { in: todayOrderIds } }
    })

    // 4. Get the most recent order items (by created_at)
    const recentOrderItems = await prisma.$queryRaw`
      SELECT oi.order_id, oi.master_sku, oi.quantity, oi.item_price, oi.created_at,
             o.purchase_date, o.status
      FROM order_items oi
      LEFT JOIN orders o ON oi.order_id = o.id
      ORDER BY oi.created_at DESC
      LIMIT 10
    `

    // 5. Check total order_items count
    const totalOrderItems = await prisma.orderItem.count()

    // 6. Check order items created in last 7 days
    const recentItemsCount = await prisma.$queryRaw`
      SELECT 
        DATE(created_at) as date,
        COUNT(*)::int as count
      FROM order_items
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `

    // 7. Check if there are orphaned order items (no matching order)
    const orphanedItems = await prisma.$queryRaw`
      SELECT COUNT(*)::int as orphan_count
      FROM order_items oi
      LEFT JOIN orders o ON oi.order_id = o.id
      WHERE o.id IS NULL
    `

    // 8. Last month items for comparison
    const lastMonthItems = await prisma.orderItem.aggregate({
      where: {
        order: { 
          purchaseDate: { 
            gte: new Date('2025-11-01'), 
            lt: new Date('2025-12-01') 
          } 
        }
      },
      _sum: { itemPrice: true, quantity: true },
      _count: true
    })

    return NextResponse.json({
      serverTime: now.toISOString(),
      todayStart: today.toISOString(),
      
      orderCounts: {
        today: todayOrderCount,
        yesterday: yesterdayOrderCount
      },

      todaySampleOrders: todayOrders,
      itemsForTodaySampleOrders: itemsForTodayOrders,

      totalOrderItems,
      recentOrderItems,
      recentItemsCountByDate: recentItemsCount,
      orphanedItems,

      lastMonthItems
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 })
  }
}
