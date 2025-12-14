import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Map form claim type to database claim type
const claimTypeMap: Record<string, string> = {
  'Replacement': 'REPLACEMENT',
  'Refund': 'REFUND',
  'Repair': 'REPAIR',
  'Exchange for different product': 'EXCHANGE',
  'Store credit': 'REFUND',
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const orderNumber = formData.get('orderNumber') as string
    const email = formData.get('email') as string
    const name = formData.get('name') as string
    const phone = formData.get('phone') as string
    const productSku = formData.get('productSku') as string
    const issueType = formData.get('issueType') as string
    const issueDescription = formData.get('issueDescription') as string
    const preferredResolution = formData.get('preferredResolution') as string

    // Validate required fields
    if (!orderNumber || !email || !name || !issueType || !issueDescription || !preferredResolution) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Generate claim ID
    const claimId = `WC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    // Try to find the order to get product SKU if not provided
    let resolvedProductSku = productSku
    if (!resolvedProductSku) {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { id: orderNumber },
            { id: { contains: orderNumber } },
          ]
        },
        include: {
          orderItems: {
            take: 1,
            select: { masterSku: true }
          }
        }
      })
      if (order?.orderItems?.[0]) {
        resolvedProductSku = order.orderItems[0].masterSku
      }
    }

    // Create warranty claim record
    const warrantyClaim = await prisma.warrantyClaim.create({
      data: {
        claimId,
        orderId: orderNumber,
        productSku: resolvedProductSku || null,
        customerName: name,
        customerEmail: email,
        customerPhone: phone || null,
        claimType: claimTypeMap[preferredResolution] || 'REPLACEMENT',
        issueType: issueType,
        description: issueDescription,
        status: 'PENDING_REVIEW',
      }
    })

    // Log the warranty claim for processing
    console.log('Warranty claim created:', {
      claimId,
      recordId: warrantyClaim.id,
      orderNumber,
      email,
      name,
      issueType,
      preferredResolution,
    })

    return NextResponse.json({
      success: true,
      claimId,
      message: 'Your warranty claim has been submitted successfully. We will review it and contact you within 1-2 business days.',
    })

  } catch (error) {
    console.error('Warranty claim submission error:', error)
    return NextResponse.json(
      { error: 'Failed to submit warranty claim. Please try again later.' },
      { status: 500 }
    )
  }
}
