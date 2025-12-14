import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public API - Check warranty eligibility
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')?.trim()
    const sku = searchParams.get('sku')?.trim()

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      )
    }

    // Check if order exists
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                sku: true,
                isWarrantied: true,
              }
            }
          },
          where: sku ? { masterSku: sku } : undefined
        }
      }
    })

    if (!order) {
      return NextResponse.json({
        eligible: false,
        reason: 'ORDER_NOT_FOUND',
        message: 'Order not found in our system.'
      })
    }

    // Check for existing warranty claims
    const existingClaim = await prisma.warrantyClaim.findFirst({
      where: {
        orderId: orderId,
        ...(sku ? { masterSku: sku } : {}),
        status: {
          notIn: ['CANCELLED']
        }
      }
    })

    if (existingClaim) {
      return NextResponse.json({
        eligible: false,
        reason: 'EXISTING_CLAIM',
        message: 'A warranty claim already exists for this order.',
        existingClaimNumber: existingClaim.claimNumber,
      })
    }

    // Check if specific item is warranted
    if (sku) {
      const item = order.orderItems.find(i => i.masterSku === sku)
      if (!item) {
        return NextResponse.json({
          eligible: false,
          reason: 'ITEM_NOT_FOUND',
          message: 'Item not found in this order.'
        })
      }

      if (!item.product.isWarrantied) {
        return NextResponse.json({
          eligible: false,
          reason: 'NOT_WARRANTIED',
          message: 'This item is not covered by our warranty program.'
        })
      }
    }

    // Check if any items in order are warranted
    const warrantedItems = order.orderItems.filter(i => i.product.isWarrantied)
    if (warrantedItems.length === 0) {
      return NextResponse.json({
        eligible: false,
        reason: 'NO_WARRANTIED_ITEMS',
        message: 'No items in this order are covered by warranty.'
      })
    }

    return NextResponse.json({
      eligible: true,
      warrantedItemCount: warrantedItems.length,
      message: 'This order is eligible for a warranty claim.'
    })
  } catch (error) {
    console.error('Warranty check error:', error)
    return NextResponse.json(
      { error: 'Unable to check eligibility. Please try again.' },
      { status: 500 }
    )
  }
}

