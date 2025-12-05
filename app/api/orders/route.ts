import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const sortOrder = searchParams.get('sort') || 'desc' // 'asc' or 'desc'
    const dateFilter = searchParams.get('dateFilter') || 'all' // today, yesterday, 3d, 7d, 30d, ytd, 365d, custom, all
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Build date filter
    let dateCondition: any = {}
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    switch (dateFilter) {
      case 'today':
        dateCondition = {
          purchaseDate: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
          }
        }
        break
      case 'yesterday':
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
        dateCondition = {
          purchaseDate: {
            gte: yesterday,
            lt: today
          }
        }
        break
      case '3d':
        dateCondition = {
          purchaseDate: {
            gte: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)
          }
        }
        break
      case '7d':
        dateCondition = {
          purchaseDate: {
            gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
          }
        }
        break
      case '30d':
        dateCondition = {
          purchaseDate: {
            gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
          }
        }
        break
      case 'ytd':
        const startOfYear = new Date(now.getFullYear(), 0, 1)
        dateCondition = {
          purchaseDate: {
            gte: startOfYear
          }
        }
        break
      case '365d':
        dateCondition = {
          purchaseDate: {
            gte: new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000)
          }
        }
        break
      case 'custom':
        if (startDate && endDate) {
          dateCondition = {
            purchaseDate: {
              gte: new Date(startDate),
              lte: new Date(endDate + 'T23:59:59.999Z')
            }
          }
        }
        break
      case 'all':
      default:
        // No date filter
        break
    }

    // Get total count for pagination
    const totalCount = await prisma.order.count({
      where: dateCondition
    })

    const orders = await prisma.order.findMany({
      where: dateCondition,
      take: limit,
      skip: offset,
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                title: true,
                sku: true,
              },
            },
          },
        },
      },
      orderBy: {
        purchaseDate: sortOrder === 'asc' ? 'asc' : 'desc',
      },
    })

    // Helper to convert Prisma Decimal to number
    const toNumber = (val: any): number => {
      if (val === null || val === undefined) return 0
      if (typeof val === 'number') return val
      if (typeof val === 'string') return parseFloat(val) || 0
      if (typeof val === 'object' && val.toNumber) return val.toNumber()
      if (typeof val === 'object' && val.toString) return parseFloat(val.toString()) || 0
      return 0
    }

    // Helper to get order total - use orderTotal if > 0, else calculate from items
    const getOrderTotal = (order: any): number => {
      const orderTotal = toNumber(order.orderTotal)
      if (orderTotal > 0) return orderTotal
      
      // Calculate from items
      if (!order.orderItems || order.orderItems.length === 0) return 0
      return order.orderItems.reduce((sum: number, item: any) => {
        const price = toNumber(item.itemPrice)
        const qty = toNumber(item.quantity)
        return sum + (price * qty)
      }, 0)
    }

    // Transform orders to ensure numeric values are properly converted
    const transformedOrders = orders.map((order: any) => {
      const orderItems = order.orderItems.map((item: any) => ({
        ...item,
        quantity: toNumber(item.quantity),
        itemPrice: toNumber(item.itemPrice),
        itemTax: toNumber(item.itemTax),
        shippingPrice: toNumber(item.shippingPrice),
        shippingTax: toNumber(item.shippingTax),
        giftWrapPrice: toNumber(item.giftWrapPrice),
        giftWrapTax: toNumber(item.giftWrapTax),
        promoDiscount: toNumber(item.promoDiscount),
        shipPromoDiscount: toNumber(item.shipPromoDiscount),
      }))
      
      // Calculate the total (use orderTotal if > 0, else sum from items)
      const calculatedTotal = getOrderTotal({ ...order, orderItems })
      
      return {
        ...order,
        orderTotal: calculatedTotal,
        orderItems,
      }
    })

    // Calculate summary stats for the filtered period
    const summary = {
      totalOrders: totalCount,
      totalRevenue: transformedOrders.reduce((sum: any, order: any) => sum + order.orderTotal, 0),
      totalItems: transformedOrders.reduce((sum: any, order: any) =>
        sum + order.orderItems.reduce((itemSum: any, item: any) => itemSum + item.quantity, 0), 0),
      totalFees: 0, // No amazonFees field in schema
    }

    return NextResponse.json({
      orders: transformedOrders,
      summary,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    })
  } catch (error: any) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}
