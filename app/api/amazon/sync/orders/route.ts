import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials, updateSyncStatus, marketplaceToChannel } from '@/lib/amazon-sp-api'

export async function POST() {
  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'Amazon credentials not configured' },
        { status: 400 }
      )
    }

    await updateSyncStatus('running')

    const client = await createSpApiClient()
    if (!client) {
      throw new Error('Failed to create SP-API client')
    }

    const channel = marketplaceToChannel(credentials.marketplaceId)
    
    // Get orders from last 12 months
    const createdAfter = new Date()
    createdAfter.setMonth(createdAfter.getMonth() - 12)

    let nextToken: string | null = null
    let totalOrders = 0
    let totalItems = 0
    let created = 0
    let updated = 0

    do {
      const ordersResponse: any = await client.callAPI({
        operation: 'getOrders',
        endpoint: 'orders',
        query: {
          MarketplaceIds: [credentials.marketplaceId],
          CreatedAfter: createdAfter.toISOString(),
          OrderStatuses: ['Shipped', 'Unshipped', 'PartiallyShipped'],
          ...(nextToken ? { NextToken: nextToken } : {}),
        },
      })

      const orders = ordersResponse?.payload?.Orders || ordersResponse?.Orders || []
      nextToken = ordersResponse?.payload?.NextToken || ordersResponse?.NextToken || null

      for (const order of orders) {
        totalOrders++
        
        // Get order items
        let orderItems: any[] = []
        try {
          const itemsResponse = await client.callAPI({
            operation: 'getOrderItems',
            endpoint: 'orders',
            path: { orderId: order.AmazonOrderId },
          })
          orderItems = itemsResponse?.payload?.OrderItems || itemsResponse?.OrderItems || []
        } catch (err) {
          console.log(`Could not fetch items for order ${order.AmazonOrderId}`)
          continue
        }

        // Upsert order
        const orderData = {
          platform: 'amazon',
          platformOrderId: order.AmazonOrderId,
          orderDate: new Date(order.PurchaseDate),
          status: order.OrderStatus?.toLowerCase() || 'unknown',
          channel,
          totalAmount: parseFloat(order.OrderTotal?.Amount || '0'),
          currency: order.OrderTotal?.CurrencyCode || 'USD',
        }

        const existingOrder = await prisma.order.findFirst({
          where: {
            platform: 'amazon',
            platformOrderId: order.AmazonOrderId,
          },
        })

        let dbOrder
        if (existingOrder) {
          dbOrder = await prisma.order.update({
            where: { id: existingOrder.id },
            data: orderData,
          })
          updated++
        } else {
          dbOrder = await prisma.order.create({
            data: orderData,
          })
          created++
        }

        // Process order items
        for (const item of orderItems) {
          totalItems++
          const sku = item.SellerSKU

          // Find product
          const product = await prisma.product.findUnique({
            where: { sku },
          })

          if (!product) continue

          // Upsert order item
          const existingItem = await prisma.orderItem.findFirst({
            where: {
              orderId: dbOrder.id,
              productId: product.id,
            },
          })

          const itemData = {
            orderId: dbOrder.id,
            productId: product.id,
            quantity: item.QuantityOrdered || 1,
            price: parseFloat(item.ItemPrice?.Amount || '0') / (item.QuantityOrdered || 1),
            fees: parseFloat(item.ItemTax?.Amount || '0'),
          }

          if (!existingItem) {
            await prisma.orderItem.create({
              data: itemData,
            })
          } else {
            await prisma.orderItem.update({
              where: { id: existingItem.id },
              data: itemData,
            })
          }
        }
      }

      // Rate limiting - wait a bit between pages
      if (nextToken) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }

    } while (nextToken)

    // Update sales velocity for all products
    await updateSalesVelocity()

    await updateSyncStatus('success')

    return NextResponse.json({
      success: true,
      message: `Orders synced: ${created} created, ${updated} updated, ${totalItems} items processed`,
      created,
      updated,
      totalOrders,
      totalItems,
    })
  } catch (error: any) {
    console.error('Error syncing orders:', error)
    await updateSyncStatus('error', error.message)

    return NextResponse.json(
      { error: error.message || 'Failed to sync orders' },
      { status: 500 }
    )
  }
}

async function updateSalesVelocity() {
  const products = await prisma.product.findMany({
    include: { salesVelocity: true },
  })

  const now = new Date()
  const days7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const days90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  for (const product of products) {
    // Calculate units sold in each period
    const [sales7, sales30, sales90] = await Promise.all([
      prisma.orderItem.aggregate({
        where: {
          productId: product.id,
          order: { orderDate: { gte: days7 } },
        },
        _sum: { quantity: true },
      }),
      prisma.orderItem.aggregate({
        where: {
          productId: product.id,
          order: { orderDate: { gte: days30 } },
        },
        _sum: { quantity: true },
      }),
      prisma.orderItem.aggregate({
        where: {
          productId: product.id,
          order: { orderDate: { gte: days90 } },
        },
        _sum: { quantity: true },
      }),
    ])

    const velocity7d = (sales7._sum.quantity || 0) / 7
    const velocity30d = (sales30._sum.quantity || 0) / 30
    const velocity90d = (sales90._sum.quantity || 0) / 90

    if (product.salesVelocity) {
      await prisma.salesVelocity.update({
        where: { productId: product.id },
        data: {
          velocity7d,
          velocity30d,
          velocity90d,
          updatedAt: new Date(),
        },
      })
    } else {
      await prisma.salesVelocity.create({
        data: {
          productId: product.id,
          velocity7d,
          velocity30d,
          velocity90d,
        },
      })
    }
  }
}

