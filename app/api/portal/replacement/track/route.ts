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

    // Search for warranty claim by claim ID or order ID
    const claim = await prisma.warrantyClaim.findFirst({
      where: replacementId
        ? {
            OR: [
              { claimId: replacementId },
              { claimId: { contains: replacementId.replace(/^WC-/i, '') } },
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
    let productName = claim.productSku || 'Product'
    if (claim.productSku) {
      const product = await prisma.product.findFirst({
        where: { sku: claim.productSku },
        select: { title: true }
      })
      if (product?.title) {
        productName = product.title
      }
    }

    return NextResponse.json({
      success: true,
      replacement: {
        replacementId: claim.claimId,
        originalOrderId: claim.orderId || 'N/A',
        requestDate: claim.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        status: mapClaimStatus(claim.status),
        reason: `${claim.issueType}: ${claim.description.substring(0, 100)}${claim.description.length > 100 ? '...' : ''}`,
        claimType: claim.claimType,
        // Return tracking info
        returnTrackingNumber: claim.returnTrackingNumber || undefined,
        returnCarrier: claim.returnCarrier || undefined,
        // Replacement tracking info
        newTrackingNumber: claim.replacementTrackingNumber || undefined,
        estimatedDelivery: undefined, // Would need to be added if tracking integration exists
        items: [{
          name: productName,
          quantity: 1,
          sku: claim.productSku || 'N/A',
        }],
        timeline: buildClaimTimeline(claim),
        resolution: claim.resolutionType ? {
          type: claim.resolutionType,
          notes: claim.resolutionNotes,
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
    'PENDING_REVIEW': 'pending_approval',
    'APPROVED': 'approved',
    'RETURN_LABEL_SENT': 'approved',
    'RETURN_SHIPPED': 'processing',
    'RETURN_DELIVERED': 'processing',
    'PROCESSING': 'processing',
    'REPLACEMENT_SHIPPED': 'shipped',
    'COMPLETED': 'delivered',
    'DENIED': 'denied',
  }
  return statusMap[status] || 'pending_approval'
}

interface ClaimRecord {
  status: string
  createdAt: Date
  updatedAt: Date
  issueType: string
  returnTrackingNumber?: string | null
  returnShippedAt?: Date | null
  returnDeliveredAt?: Date | null
  replacementTrackingNumber?: string | null
  resolvedAt?: Date | null
  resolutionType?: string | null
  resolutionNotes?: string | null
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
    note: claim.issueType,
  })

  const status = claim.status

  // Approved
  if (['APPROVED', 'RETURN_LABEL_SENT', 'RETURN_SHIPPED', 'RETURN_DELIVERED', 'PROCESSING', 'REPLACEMENT_SHIPPED', 'COMPLETED'].includes(status)) {
    timeline.unshift({
      status: 'Claim Approved',
      date: claim.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  // Return label sent
  if (['RETURN_LABEL_SENT', 'RETURN_SHIPPED', 'RETURN_DELIVERED', 'PROCESSING', 'REPLACEMENT_SHIPPED', 'COMPLETED'].includes(status)) {
    timeline.unshift({
      status: 'Return Label Sent',
      date: claim.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  // Return shipped
  if (['RETURN_SHIPPED', 'RETURN_DELIVERED', 'PROCESSING', 'REPLACEMENT_SHIPPED', 'COMPLETED'].includes(status)) {
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
  if (['RETURN_DELIVERED', 'PROCESSING', 'REPLACEMENT_SHIPPED', 'COMPLETED'].includes(status)) {
    timeline.unshift({
      status: 'Return Received',
      date: (claim.returnDeliveredAt || claim.updatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  // Replacement shipped
  if (['REPLACEMENT_SHIPPED', 'COMPLETED'].includes(status)) {
    timeline.unshift({
      status: 'Replacement Shipped',
      date: claim.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      note: claim.replacementTrackingNumber ? `Tracking: ${claim.replacementTrackingNumber}` : undefined,
    })
  }

  // Completed
  if (status === 'COMPLETED') {
    timeline.unshift({
      status: 'Claim Resolved',
      date: (claim.resolvedAt || claim.updatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      note: claim.resolutionNotes || undefined,
    })
  }

  // Denied
  if (status === 'DENIED') {
    timeline.unshift({
      status: 'Claim Denied',
      date: claim.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      note: claim.resolutionNotes || undefined,
    })
  }

  return timeline
}
