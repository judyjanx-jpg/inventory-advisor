import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials, updateSyncStatus } from '@/lib/amazon-sp-api'

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

    // Get orders from last 12 months
    const createdAfter = new Date()
    createdAfter.setMonth(createdAfter.getMonth() - 12)

    let nextToken: string | null = null
    let totalOrders = 0
    let totalItems = 0
    let created = 0
    let updated = 0

    // Get existing products for foreign key validation
    const existingProducts = await prisma.product.findMany({
      select: { sku: true },
    })
    const existingSkuSet = new Set(existingProducts.map(p => p.sku))

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
        const orderId = order.AmazonOrderId
        if (!orderId) continue

        // Get order items
        let orderItems: any[] = []
        try {
          const itemsResponse: any = await client.callAPI({
            operation: 'getOrderItems',
            endpoint: 'orders',
            path: { orderId },
          })
          orderItems = itemsResponse?.payload?.OrderItems || itemsResponse?.OrderItems || []
        } catch (err) {
          console.log(`Could not fetch items for order ${orderId}`)
          continue
        }

        // Calculate order total from items
        let orderTotal = 0
        for (const item of orderItems) {
          orderTotal += parseFloat(item.ItemPrice?.Amount || '0')
        }

        // Upsert order using the Amazon Order ID as the primary key
        const existingOrder = await prisma.order.findUnique({
          where: { id: orderId },
        })

        if (existingOrder) {
          await prisma.order.update({
            where: { id: orderId },
            data: {
              status: order.OrderStatus || 'Unknown',
              orderTotal,
              fulfillmentChannel: order.FulfillmentChannel || null,
              salesChannel: order.SalesChannel || null,
              shipCity: order.ShippingAddress?.City || null,
              shipState: order.ShippingAddress?.StateOrRegion || null,
              shipCountry: order.ShippingAddress?.CountryCode || null,
              shipPostalCode: order.ShippingAddress?.PostalCode || null,
            },
          })
          updated++
        } else {
          await prisma.order.create({
            data: {
              id: orderId,
              purchaseDate: new Date(order.PurchaseDate),
              status: order.OrderStatus || 'Unknown',
              orderTotal,
              currency: order.OrderTotal?.CurrencyCode || 'USD',
              fulfillmentChannel: order.FulfillmentChannel || null,
              salesChannel: order.SalesChannel || null,
              shipCity: order.ShippingAddress?.City || null,
              shipState: order.ShippingAddress?.StateOrRegion || null,
              shipCountry: order.ShippingAddress?.CountryCode || null,
              shipPostalCode: order.ShippingAddress?.PostalCode || null,
            },
          })
          created++
        }

        // Delete existing order items and re-create
        await prisma.orderItem.deleteMany({
          where: { orderId },
        })

        // Process order items
        for (const item of orderItems) {
          totalItems++
          const sku = item.SellerSKU
          if (!sku) continue

          // Skip items for products that don't exist (foreign key constraint)
          if (!existingSkuSet.has(sku)) {
            console.log(`Skipping item for unknown SKU: ${sku}`)
            continue
          }

          const itemPrice = parseFloat(item.ItemPrice?.Amount || '0')
          const itemTax = parseFloat(item.ItemTax?.Amount || '0')
          const shippingPrice = parseFloat(item.ShippingPrice?.Amount || '0')
          const shippingTax = parseFloat(item.ShippingTax?.Amount || '0')
          const promoDiscount = Math.abs(parseFloat(item.PromotionDiscount?.Amount || '0'))

          await prisma.orderItem.create({
            data: {
              orderId,
              masterSku: sku,
              asin: item.ASIN || null,
              quantity: item.QuantityOrdered || 1,
              itemPrice,
              itemTax,
              shippingPrice,
              shippingTax,
              promoDiscount,
              grossRevenue: itemPrice + shippingPrice,
            },
          })
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
    select: { sku: true },
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
          masterSku: product.sku,
          order: { purchaseDate: { gte: days7 } },
        },
        _sum: { quantity: true },
      }),
      prisma.orderItem.aggregate({
        where: {
          masterSku: product.sku,
          order: { purchaseDate: { gte: days30 } },
        },
        _sum: { quantity: true },
      }),
      prisma.orderItem.aggregate({
        where: {
          masterSku: product.sku,
          order: { purchaseDate: { gte: days90 } },
        },
        _sum: { quantity: true },
      }),
    ])

    const velocity7d = (sales7._sum.quantity || 0) / 7
    const velocity30d = (sales30._sum.quantity || 0) / 30
    const velocity90d = (sales90._sum.quantity || 0) / 90

    await prisma.salesVelocity.upsert({
      where: { masterSku: product.sku },
      update: {
        velocity7d,
        velocity30d,
        velocity90d,
      },
      create: {
        masterSku: product.sku,
        velocity7d,
        velocity30d,
        velocity90d,
      },
    })
  }
}
