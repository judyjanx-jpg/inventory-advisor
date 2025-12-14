import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { replacementId, orderId } = await request.json()

    if (!replacementId && !orderId) {
      return NextResponse.json(
        { error: 'Claim ID or Order ID is required' },
        { status: 400 }
      )
    }

    // Search for warranty claim by claim number or order ID
    const claim = await prisma.warrantyClaim.findFirst({
      where: replacementId
        ? {
            OR: [
              { claimNumber: replacementId },
              { claimNumber: { contains: replacementId.replace(/^WC-/i, '') } },
            ]
          }
        : {
            orderId: orderId
          },
    })

    if (!claim) {
      return NextResponse.json({
        success: false,
        error: 'Warranty claim not found. Please check your claim ID and try again.'
      }, { status: 404 })
    }

    // Get product info if we have a SKU
    let productName = claim.productName || claim.masterSku || 'Product'
    if (claim.masterSku) {
      const product = await prisma.product.findFirst({
        where: { sku: claim.masterSku },
        select: { title: true, displayName: true }
      })
      if (product) {
        productName = product.displayName || product.title
      }
    }

    return NextResponse.json({
      success: true,
      replacement: {
        replacementId: claim.claimNumber,
        originalOrderId: claim.orderId || 'N/A',
        requestDate: claim.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        status: mapClaimStatus(claim.status),
        reason: claim.customerNotes || 'Warranty claim',
        claimType: claim.claimType,
        // Return tracking info
        returnTrackingNumber: claim.returnTrackingNumber || undefined,
        returnCarrier: claim.returnCarrier || undefined,
        // Replacement tracking info
        newTrackingNumber: claim.replacementTracking || undefined,
        estimatedDelivery: undefined,
        items: [{
          name: productName,
          quantity: claim.quantity || 1,
          sku: claim.masterSku || 'N/A',
        }],
        timeline: buildClaimTimeline(claim),
        resolution: claim.status === 'COMPLETED' ? {
          type: claim.claimType,
          refundAmount: claim.refundAmount ? Number(claim.refundAmount) : undefined,
        } : undefined,
      }
    })

  } catch (error) {
    console.error('Track warranty claim error:', error)
    return NextResponse.json(
      { error: 'Unable to track claim. Please try again later.' },
      { status: 500 }
    )
  }
}

function mapClaimStatus(status: string): 'pending_approval' | 'approved' | 'processing' | 'shipped' | 'delivered' | 'denied' {
  const statusMap: Record<string, 'pending_approval' | 'approved' | 'processing' | 'shipped' | 'delivered' | 'denied'> = {
    'PENDING_RETURN': 'approved',
    'RETURN_SHIPPED': 'processing',
    'RETURN_DELIVERED': 'processing',
    'PROCESSING': 'processing',
    'COMPLETED': 'delivered',
    'CANCELLED': 'denied',
  }
  return statusMap[status] || 'pending_approval'
}

interface ClaimRecord {
  status: string
  createdAt: Date
  updatedAt: Date
  customerNotes?: string | null
  returnTrackingNumber?: string | null
  returnShippedAt?: Date | null
  returnDeliveredAt?: Date | null
  replacementTracking?: string | null
  replacementShippedAt?: Date | null
  refundProcessedAt?: Date | null
}

function buildClaimTimeline(claim: ClaimRecord): Array<{ status: string; date: string; note?: string }> {
  const timeline: Array<{ status: string; date: string; note?: string }> = []

  // Claim submitted
  timeline.push({
    status: 'Claim Submitted',
    date: claim.createdAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }),
    note: claim.customerNotes || undefined,
  })

  const status = claim.status

  // Return label sent (PENDING_RETURN means label was generated)
  if (['PENDING_RETURN', 'RETURN_SHIPPED', 'RETURN_DELIVERED', 'PROCESSING', 'COMPLETED'].includes(status)) {
    timeline.unshift({
      status: 'Return Label Sent',
      date: claim.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  // Return shipped
  if (['RETURN_SHIPPED', 'RETURN_DELIVERED', 'PROCESSING', 'COMPLETED'].includes(status)) {
    timeline.unshift({
      status: 'Return Shipped',
      date: (claim.returnShippedAt || claim.updatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      note: claim.returnTrackingNumber ? `Tracking: ${claim.returnTrackingNumber}` : undefined,
    })
  }

  // Return delivered
  if (['RETURN_DELIVERED', 'PROCESSING', 'COMPLETED'].includes(status)) {
    timeline.unshift({
      status: 'Return Received',
      date: (claim.returnDeliveredAt || claim.updatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  // Processing
  if (['PROCESSING', 'COMPLETED'].includes(status)) {
    timeline.unshift({
      status: 'Processing',
      date: claim.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  // Replacement shipped (if applicable)
  if (claim.replacementTracking && ['COMPLETED'].includes(status)) {
    timeline.unshift({
      status: 'Replacement Shipped',
      date: (claim.replacementShippedAt || claim.updatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      note: `Tracking: ${claim.replacementTracking}`,
    })
  }

  // Completed
  if (status === 'COMPLETED') {
    timeline.unshift({
      status: 'Claim Resolved',
      date: (claim.refundProcessedAt || claim.updatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  // Cancelled
  if (status === 'CANCELLED') {
    timeline.unshift({
      status: 'Claim Cancelled',
      date: claim.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  return timeline
}
