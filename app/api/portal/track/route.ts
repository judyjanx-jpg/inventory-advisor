import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { orderNumber, email } = await request.json()

    if (!orderNumber) {
      return NextResponse.json(
        { error: 'Order number is required' },
        { status: 400 }
      )
    }

    // Search for order by Amazon order ID (Order.id is the Amazon order ID)
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: orderNumber },
          { id: { contains: orderNumber } },
        ]
      },
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                title: true,
                sku: true,
              }
            }
          }
        }
      }
    })

    if (!order) {
      // Try to find in FBA shipments
      const fbaShipment = await prisma.fbaShipment.findFirst({
        where: {
          OR: [
            { shipmentId: orderNumber },
            { internalId: { contains: orderNumber } },
          ]
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  title: true,
                  sku: true,
                }
              }
            }
          }
        }
      })

      if (!fbaShipment) {
        return NextResponse.json({
          success: false,
          error: 'Order not found. Please check your order number and try again.'
        }, { status: 404 })
      }

      // Return FBA shipment tracking info
      return NextResponse.json({
        success: true,
        order: {
          orderId: fbaShipment.shipmentId || fbaShipment.internalId || `FBA-${fbaShipment.id}`,
          orderDate: fbaShipment.createdDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          status: mapFbaStatus(fbaShipment.status),
          carrier: fbaShipment.carrier || undefined,
          trackingNumber: fbaShipment.trackingNumbers || undefined,
          estimatedDelivery: fbaShipment.estimatedArrival
            ? fbaShipment.estimatedArrival.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })
            : undefined,
          items: fbaShipment.items.map((item: { product?: { title?: string } | null; masterSku: string; quantityShipped: number }) => ({
            name: item.product?.title || item.masterSku,
            quantity: item.quantityShipped,
            sku: item.masterSku,
          })),
          timeline: buildFbaTimeline(fbaShipment),
        }
      })
    }

    // Return customer order tracking info
    const status = mapOrderStatus(order.status)

    return NextResponse.json({
      success: true,
      order: {
        orderId: order.id,
        orderDate: order.purchaseDate
          ? new Date(order.purchaseDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
          : 'Unknown',
        status,
        carrier: order.fulfillmentChannel || undefined,
        trackingNumber: undefined, // Would need to be stored separately
        estimatedDelivery: undefined, // Not stored in Order model
        deliveredDate: status === 'delivered' && order.shipDate
          ? new Date(order.shipDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
          : undefined,
        items: order.orderItems.map((item: { product?: { title?: string } | null; masterSku: string; quantity: number }) => ({
          name: item.product?.title || item.masterSku,
          quantity: item.quantity,
          sku: item.masterSku,
        })),
        timeline: buildOrderTimeline(order),
        shippingAddress: order.shipCity && order.shipState && order.shipPostalCode
          ? {
              city: order.shipCity,
              state: order.shipState,
              zip: order.shipPostalCode,
            }
          : undefined,
      }
    })

  } catch (error) {
    console.error('Track order error:', error)
    return NextResponse.json(
      { error: 'Unable to track order. Please try again later.' },
      { status: 500 }
    )
  }
}

function mapOrderStatus(status: string | null): 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned' {
  if (!status) return 'processing'

  const s = status.toLowerCase()
  if (s.includes('pending') || s.includes('unshipped')) return 'processing'
  if (s.includes('shipped')) return 'shipped'
  if (s.includes('canceled') || s.includes('returned')) return 'returned'
  return 'delivered'
}

function mapFbaStatus(status: string | null): 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned' {
  if (!status) return 'processing'

  const s = status.toLowerCase()
  if (s.includes('working') || s.includes('draft')) return 'processing'
  if (s.includes('shipped') || s.includes('in_transit')) return 'in_transit'
  if (s.includes('delivered') || s.includes('closed') || s.includes('receiving')) return 'delivered'
  if (s.includes('cancelled') || s.includes('error')) return 'returned'
  return 'shipped'
}

function buildOrderTimeline(order: { purchaseDate: Date; shipDate?: Date | null; status: string; shipCity?: string | null; shipState?: string | null }): Array<{ status: string; date: string; location?: string }> {
  const timeline: Array<{ status: string; date: string; location?: string }> = []

  // Add events based on available dates
  if (order.purchaseDate) {
    timeline.push({
      status: 'Order Placed',
      date: new Date(order.purchaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
    })
  }

  if (order.shipDate) {
    timeline.push({
      status: 'Order Shipped',
      date: new Date(order.shipDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
    })
  }

  // If status indicates delivered
  if (order.status?.toLowerCase().includes('delivered') || order.status?.toLowerCase().includes('shipped')) {
    timeline.unshift({
      status: 'Delivered',
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      location: order.shipCity && order.shipState ? `${order.shipCity}, ${order.shipState}` : undefined,
    })
  }

  return timeline.reverse()
}

function buildFbaTimeline(shipment: { createdDate: Date; updatedAt: Date; status?: string | null; destinationFc?: string | null }): Array<{ status: string; date: string; location?: string }> {
  const timeline: Array<{ status: string; date: string; location?: string }> = []

  timeline.push({
    status: 'Shipment Created',
    date: shipment.createdDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }),
  })

  if (shipment.status?.toLowerCase().includes('shipped') || shipment.status?.toLowerCase().includes('in_transit')) {
    timeline.unshift({
      status: 'Shipped to Fulfillment Center',
      date: shipment.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      location: shipment.destinationFc || undefined,
    })
  }

  if (shipment.status?.toLowerCase().includes('receiving') || shipment.status?.toLowerCase().includes('closed')) {
    timeline.unshift({
      status: 'Received at Fulfillment Center',
      date: shipment.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      location: shipment.destinationFc || undefined,
    })
  }

  return timeline
}
