import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { strictRateLimit } from '@/lib/rate-limit'

// Public API - no auth required but rate limited
export async function GET(request: NextRequest) {
  // Rate limit: 5 requests per minute per IP
  const rateLimitError = strictRateLimit(request)
  if (rateLimitError) return rateLimitError

  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')?.trim()
    const zip = searchParams.get('zip')?.trim()

    if (!orderId || !zip) {
      return NextResponse.json(
        { error: 'Order ID and ZIP code are required' },
        { status: 400 }
      )
    }

    // Look up order in database
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                sku: true,
                title: true,
                displayName: true,
                price: true,
                isWarrantied: true,
                asin: true,
              }
            }
          }
        }
      }
    })

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found. Please check your order number.' },
        { status: 404 }
      )
    }

    // Verify ZIP code matches (basic verification)
    // ZIP can have format "12345" or "12345-6789"
    const orderZip = order.shipPostalCode?.replace(/\D/g, '').substring(0, 5)
    const inputZip = zip.replace(/\D/g, '').substring(0, 5)
    
    if (orderZip && inputZip && orderZip !== inputZip) {
      return NextResponse.json(
        { error: 'ZIP code does not match the order. Please verify your information.' },
        { status: 400 }
      )
    }

    // Check for existing warranty claims on this order
    const existingClaim = await prisma.warrantyClaim.findFirst({
      where: {
        orderId: orderId,
        status: {
          notIn: ['CANCELLED']
        }
      }
    })

    // Format response
    const formattedOrder = {
      orderId: order.id,
      purchaseDate: order.purchaseDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      deliveryDate: order.shipDate?.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      status: order.status,
      items: order.orderItems.map(item => ({
        sku: item.masterSku,
        name: item.product.displayName || item.product.title,
        quantity: item.quantity,
        price: Number(item.itemPrice),
        isWarrantied: item.product.isWarrantied,
        imageUrl: item.product.asin 
          ? `https://m.media-amazon.com/images/P/${item.product.asin}.jpg`
          : null,
      })),
      shippingAddress: {
        city: order.shipCity,
        state: order.shipState,
        zip: order.shipPostalCode,
      },
      hasExistingClaim: !!existingClaim,
    }

    return NextResponse.json({ order: formattedOrder })
  } catch (error) {
    console.error('Order lookup error:', error)
    return NextResponse.json(
      { error: 'Unable to look up order. Please try again.' },
      { status: 500 }
    )
  }
}

