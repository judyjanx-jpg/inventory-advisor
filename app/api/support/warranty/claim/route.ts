import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Generate a unique claim number
function generateClaimNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 900000) + 100000 // 6-digit random
  return `WC-${year}-${random}`
}

// Public API - Submit warranty claim
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, sku, productName, claimType, shippingAddress, customerNotes } = body

    // Validate required fields
    if (!orderId || !claimType) {
      return NextResponse.json(
        { error: 'Order ID and claim type are required' },
        { status: 400 }
      )
    }

    if (!['REFUND', 'REPLACEMENT'].includes(claimType)) {
      return NextResponse.json(
        { error: 'Invalid claim type. Must be REFUND or REPLACEMENT.' },
        { status: 400 }
      )
    }

    // Verify order exists
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
                isWarrantied: true,
              }
            }
          }
        }
      }
    })

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // If SKU provided, verify it exists in order and is warranted
    if (sku) {
      const item = order.orderItems.find(i => i.masterSku === sku)
      if (!item) {
        return NextResponse.json(
          { error: 'Item not found in this order' },
          { status: 400 }
        )
      }
      if (!item.product.isWarrantied) {
        return NextResponse.json(
          { error: 'This item is not covered by warranty' },
          { status: 400 }
        )
      }
    }

    // Check for existing active claim on this order
    const existingClaim = await prisma.warrantyClaim.findFirst({
      where: {
        orderId: orderId,
        status: {
          notIn: ['CANCELLED', 'COMPLETED']
        }
      }
    })

    if (existingClaim) {
      return NextResponse.json(
        { 
          error: 'A warranty claim already exists for this order',
          existingClaimNumber: existingClaim.claimNumber 
        },
        { status: 409 }
      )
    }

    // Generate unique claim number
    let claimNumber = generateClaimNumber()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.warrantyClaim.findUnique({
        where: { claimNumber }
      })
      if (!existing) break
      claimNumber = generateClaimNumber()
      attempts++
    }

    // Create the warranty claim
    const claim = await prisma.warrantyClaim.create({
      data: {
        claimNumber,
        orderId,
        customerEmail: '', // Will be populated via separate email collection or Amazon data
        customerName: shippingAddress?.name || null,
        claimType,
        status: 'PENDING_RETURN',
        masterSku: sku || null,
        productName: productName || (sku ? order.orderItems.find(i => i.masterSku === sku)?.product.title : null),
        quantity: 1,
        shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : null,
        customerNotes: customerNotes || null,
      }
    })

    // TODO: Integrate with shipping API to generate return label
    // TODO: Send email notification with return label

    console.log(`[Warranty] Created claim ${claimNumber} for order ${orderId}`)

    return NextResponse.json({
      success: true,
      claimNumber: claim.claimNumber,
      status: claim.status,
      message: claimType === 'REFUND' 
        ? 'Your refund claim has been submitted. We will email you a prepaid return label within 24 hours.'
        : 'Your replacement claim has been submitted. We will email you a prepaid return label within 24 hours.'
    })
  } catch (error) {
    console.error('Warranty claim error:', error)
    return NextResponse.json(
      { error: 'Unable to submit warranty claim. Please try again.' },
      { status: 500 }
    )
  }
}

