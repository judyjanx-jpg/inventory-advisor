import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const orderNumber = formData.get('orderNumber') as string
    const email = formData.get('email') as string
    const name = formData.get('name') as string
    const phone = formData.get('phone') as string
    const productSku = formData.get('productSku') as string
    const purchaseDate = formData.get('purchaseDate') as string
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

    // Try to find the order
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { amazonOrderId: orderNumber },
          { amazonOrderId: { contains: orderNumber } },
        ]
      }
    })

    // Try to find product by SKU
    let product = null
    if (productSku) {
      product = await prisma.product.findFirst({
        where: {
          OR: [
            { sku: productSku },
            { sku: { contains: productSku } },
          ]
        }
      })
    }

    // Create a return/warranty claim record
    const warrantyClaim = await prisma.return.create({
      data: {
        amazonOrderId: order?.amazonOrderId || orderNumber,
        amazonReturnId: claimId,
        masterSku: product?.sku || productSku || 'UNKNOWN',
        productId: product?.id || null,
        quantity: 1,
        reason: `${issueType}: ${issueDescription}`,
        status: 'Pending Review',
        returnDate: new Date(),
        // Store additional claim info in a JSON field if available, otherwise use reason
      }
    })

    // Log the warranty claim for processing
    console.log('Warranty claim submitted:', {
      claimId,
      orderNumber,
      email,
      name,
      phone,
      productSku,
      purchaseDate,
      issueType,
      issueDescription,
      preferredResolution,
      recordId: warrantyClaim.id,
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
