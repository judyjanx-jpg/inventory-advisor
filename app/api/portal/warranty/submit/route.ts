import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Map form claim type to database claim type
const claimTypeMap: Record<string, string> = {
  'Replacement': 'REPLACEMENT',
  'Refund': 'REFUND',
  'Repair': 'REPLACEMENT', // Treat repair as replacement
  'Exchange for different product': 'REPLACEMENT',
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

    // Generate claim number
    const claimNumber = `WC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    // Try to find the order to get product SKU and name if not provided
    let resolvedProductSku = productSku
    let productName: string | null = null
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
            include: {
              product: {
                select: { title: true, displayName: true }
              }
            }
          }
        }
      })
      if (order?.orderItems?.[0]) {
        resolvedProductSku = order.orderItems[0].masterSku
        productName = order.orderItems[0].product?.displayName || order.orderItems[0].product?.title || null
      }
    }

    // Combine issue type and description for notes
    const customerNotes = `Issue Type: ${issueType}\nPhone: ${phone || 'Not provided'}\n\n${issueDescription}`

    // Create warranty claim record
    const warrantyClaim = await prisma.warrantyClaim.create({
      data: {
        claimNumber,
        orderId: orderNumber,
        masterSku: resolvedProductSku || null,
        productName: productName,
        customerName: name,
        customerEmail: email,
        claimType: claimTypeMap[preferredResolution] || 'REPLACEMENT',
        status: 'PENDING_RETURN',
        customerNotes,
      }
    })

    // Log the warranty claim for processing
    console.log('Warranty claim created:', {
      claimNumber,
      recordId: warrantyClaim.id,
      orderNumber,
      email,
      name,
      issueType,
      preferredResolution,
    })

    return NextResponse.json({
      success: true,
      claimId: claimNumber,
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
