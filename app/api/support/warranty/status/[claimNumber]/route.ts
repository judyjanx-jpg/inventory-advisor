import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Public API - Get warranty claim status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ claimNumber: string }> }
) {
  try {
    const { claimNumber } = await params

    if (!claimNumber) {
      return NextResponse.json(
        { error: 'Claim number is required' },
        { status: 400 }
      )
    }

    const claim = await prisma.warrantyClaim.findUnique({
      where: { claimNumber }
    })

    if (!claim) {
      return NextResponse.json(
        { error: 'Warranty claim not found' },
        { status: 404 }
      )
    }

    // Build timeline of events
    const timeline: Array<{
      status: string
      label: string
      date: Date | null
      completed: boolean
      current: boolean
    }> = []

    const statusOrder = [
      { status: 'PENDING_RETURN', label: 'Claim Submitted' },
      { status: 'RETURN_SHIPPED', label: 'Return Shipped' },
      { status: 'RETURN_DELIVERED', label: 'Return Received' },
      { status: 'PROCESSING', label: 'Processing' },
      { status: 'COMPLETED', label: claim.claimType === 'REFUND' ? 'Refund Issued' : 'Replacement Shipped' },
    ]

    const currentStatusIndex = statusOrder.findIndex(s => s.status === claim.status)

    for (let i = 0; i < statusOrder.length; i++) {
      const step = statusOrder[i]
      let date: Date | null = null

      // Assign dates based on status
      if (step.status === 'PENDING_RETURN') date = claim.createdAt
      if (step.status === 'RETURN_SHIPPED') date = claim.returnShippedAt
      if (step.status === 'RETURN_DELIVERED') date = claim.returnDeliveredAt
      if (step.status === 'PROCESSING') date = claim.returnDeliveredAt // Same as delivery
      if (step.status === 'COMPLETED') {
        date = claim.claimType === 'REFUND' ? claim.refundProcessedAt : claim.replacementShippedAt
      }

      timeline.push({
        status: step.status,
        label: step.label,
        date,
        completed: i < currentStatusIndex || (i === currentStatusIndex && claim.status === 'COMPLETED'),
        current: i === currentStatusIndex && claim.status !== 'COMPLETED',
      })
    }

    // Parse shipping address
    let shippingAddress = null
    try {
      shippingAddress = claim.shippingAddress ? JSON.parse(claim.shippingAddress) : null
    } catch {
      // Ignore parsing errors
    }

    return NextResponse.json({
      claimNumber: claim.claimNumber,
      orderId: claim.orderId,
      claimType: claim.claimType,
      status: claim.status,
      productName: claim.productName,
      createdAt: claim.createdAt,
      
      // Return shipping
      returnTracking: claim.returnTrackingNumber,
      returnCarrier: claim.returnCarrier,
      returnLabelUrl: claim.returnLabelUrl,
      returnShippedAt: claim.returnShippedAt,
      returnDeliveredAt: claim.returnDeliveredAt,

      // Replacement (if applicable)
      replacementTracking: claim.replacementTracking,
      replacementShippedAt: claim.replacementShippedAt,

      // Refund (if applicable)
      refundAmount: claim.refundAmount ? Number(claim.refundAmount) : null,
      refundProcessedAt: claim.refundProcessedAt,

      // Address
      shippingAddress,

      // Timeline
      timeline,
    })
  } catch (error) {
    console.error('[Warranty Status] Error:', error)
    return NextResponse.json(
      { error: 'Unable to get claim status' },
      { status: 500 }
    )
  }
}

