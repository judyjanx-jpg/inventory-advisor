import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWarrantyConfirmation } from '@/lib/email'

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
    const { orderId, sku, productName, claimType, customerEmail, shippingAddress, customerNotes } = body

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

    // Validate email if provided (using indexOf to avoid ReDoS)
    if (customerEmail) {
      const email = String(customerEmail)
      const atIndex = email.indexOf('@')
      const hasValidAt = atIndex > 0 && atIndex === email.lastIndexOf('@')
      const dotIndex = email.indexOf('.', atIndex)
      const hasValidDot = dotIndex > atIndex + 1 && dotIndex < email.length - 1
      const hasNoSpaces = !email.includes(' ')

      if (!hasValidAt || !hasValidDot || !hasNoSpaces) {
        return NextResponse.json(
          { error: 'Please provide a valid email address' },
          { status: 400 }
        )
      }
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
        customerEmail: customerEmail || '',
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

    console.log(`[Warranty] Created claim ${claimNumber} for order ${orderId}`)

    // Try to auto-generate return label if ShipStation is configured
    let labelInfo = null
    try {
      const { shipstation, getWarehouseAddress } = await import('@/lib/shipstation')
      
      if (shipstation.isConfigured() && shippingAddress?.street1) {
        const warehouseAddress = getWarehouseAddress()
        
        if (warehouseAddress.street1 && warehouseAddress.city) {
          const isTest = process.env.NODE_ENV !== 'production' || process.env.SHIPSTATION_TEST_MODE === 'true'
          
          const label = await shipstation.createReturnLabel({
            customerAddress: {
              name: shippingAddress.name || 'Customer',
              street1: shippingAddress.street1,
              street2: shippingAddress.street2 || '',
              city: shippingAddress.city,
              state: shippingAddress.state,
              postalCode: shippingAddress.zip,
              country: 'US',
            },
            warehouseAddress: {
              name: warehouseAddress.name,
              company: warehouseAddress.company,
              street1: warehouseAddress.street1,
              street2: warehouseAddress.street2 || '',
              city: warehouseAddress.city,
              state: warehouseAddress.state,
              postalCode: warehouseAddress.postalCode,
              country: 'US',
              phone: warehouseAddress.phone,
            },
            weight: { value: 8, units: 'ounces' },
            testLabel: isTest,
          })

          // Update claim with label info
          const labelDataUrl = `data:application/pdf;base64,${label.labelData}`
          await prisma.warrantyClaim.update({
            where: { claimNumber },
            data: {
              returnTrackingNumber: label.trackingNumber,
              returnLabelUrl: labelDataUrl,
              returnCarrier: 'USPS',
            }
          })

          labelInfo = {
            trackingNumber: label.trackingNumber,
            carrier: 'USPS',
          }

          console.log(`[Warranty] Auto-generated return label for ${claimNumber}: ${label.trackingNumber}`)
        }
      }
    } catch (labelError: any) {
      console.warn(`[Warranty] Could not auto-generate label for ${claimNumber}:`, labelError.message)
      // Continue without label - user can generate it manually
    }

    // Send confirmation email with return label (non-blocking)
    if (customerEmail) {
      // Get the label URL for email (either generated or claim status page)
      const updatedClaim = await prisma.warrantyClaim.findUnique({
        where: { claimNumber },
        select: { returnLabelUrl: true }
      })

      sendWarrantyConfirmation({
        to: customerEmail,
        customerName: shippingAddress?.name || '',
        claimNumber,
        claimType,
        productName: claim.productName || undefined,
        returnLabelUrl: updatedClaim?.returnLabelUrl || undefined,
      }).catch(err => console.error('[Warranty] Email failed:', err))
    }

    return NextResponse.json({
      success: true,
      claimNumber: claim.claimNumber,
      status: claim.status,
      labelGenerated: !!labelInfo,
      trackingNumber: labelInfo?.trackingNumber,
      carrier: labelInfo?.carrier,
      message: labelInfo 
        ? 'Your claim has been submitted and your return label is ready! Check the claim status page to download it.'
        : claimType === 'REFUND' 
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

