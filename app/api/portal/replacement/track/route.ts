import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { replacementId, orderId } = await request.json()

    if (!replacementId && !orderId) {
      return NextResponse.json(
        { error: 'Replacement ID or Order ID is required' },
        { status: 400 }
      )
    }

    // Search for replacement/return by ID
    const returnRecord = await prisma.return.findFirst({
      where: replacementId
        ? {
            OR: [
              { id: parseInt(replacementId.replace(/\D/g, '')) || -1 },
              { amazonReturnId: replacementId },
            ]
          }
        : {
            amazonOrderId: orderId
          },
      include: {
        product: {
          select: {
            title: true,
            sku: true,
          }
        }
      }
    })

    if (!returnRecord) {
      // Try to find in backorders as replacement
      const backorder = await prisma.backorder.findFirst({
        where: orderId
          ? { amazonOrderId: orderId }
          : { id: parseInt(replacementId?.replace(/\D/g, '') || '0') || -1 },
        include: {
          product: {
            select: {
              title: true,
              sku: true,
            }
          }
        }
      })

      if (!backorder) {
        return NextResponse.json({
          success: false,
          error: 'Replacement request not found. Please check your ID and try again.'
        }, { status: 404 })
      }

      // Return backorder as replacement info
      return NextResponse.json({
        success: true,
        replacement: {
          replacementId: `RPL-${backorder.id}`,
          originalOrderId: backorder.amazonOrderId || 'N/A',
          requestDate: backorder.createdAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          status: mapBackorderStatus(backorder.status),
          reason: 'Replacement requested',
          items: [{
            name: backorder.product?.title || backorder.masterSku,
            quantity: backorder.quantity,
            sku: backorder.masterSku,
          }],
          timeline: buildBackorderTimeline(backorder),
        }
      })
    }

    // Return replacement/return info
    return NextResponse.json({
      success: true,
      replacement: {
        replacementId: returnRecord.amazonReturnId || `RPL-${returnRecord.id}`,
        originalOrderId: returnRecord.amazonOrderId || 'N/A',
        requestDate: returnRecord.returnDate
          ? new Date(returnRecord.returnDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })
          : returnRecord.createdAt.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }),
        status: mapReturnStatus(returnRecord.status),
        reason: returnRecord.reason || 'Customer requested replacement',
        items: [{
          name: returnRecord.product?.title || returnRecord.masterSku,
          quantity: returnRecord.quantity,
          sku: returnRecord.masterSku,
        }],
        timeline: buildReturnTimeline(returnRecord),
      }
    })

  } catch (error) {
    console.error('Track replacement error:', error)
    return NextResponse.json(
      { error: 'Unable to track replacement. Please try again later.' },
      { status: 500 }
    )
  }
}

function mapReturnStatus(status: string | null): 'pending_approval' | 'approved' | 'processing' | 'shipped' | 'delivered' | 'denied' {
  if (!status) return 'pending_approval'

  const s = status.toLowerCase()
  if (s.includes('pending')) return 'pending_approval'
  if (s.includes('approved') || s.includes('authorized')) return 'approved'
  if (s.includes('processing') || s.includes('received')) return 'processing'
  if (s.includes('shipped') || s.includes('sent')) return 'shipped'
  if (s.includes('complete') || s.includes('closed') || s.includes('refunded')) return 'delivered'
  if (s.includes('denied') || s.includes('rejected')) return 'denied'
  return 'processing'
}

function mapBackorderStatus(status: string | null): 'pending_approval' | 'approved' | 'processing' | 'shipped' | 'delivered' | 'denied' {
  if (!status) return 'pending_approval'

  const s = status.toLowerCase()
  if (s.includes('pending')) return 'pending_approval'
  if (s.includes('ordered') || s.includes('awaiting')) return 'approved'
  if (s.includes('shipped')) return 'shipped'
  if (s.includes('fulfilled') || s.includes('complete')) return 'delivered'
  if (s.includes('cancelled')) return 'denied'
  return 'processing'
}

function buildReturnTimeline(record: any): Array<{ status: string; date: string; note?: string }> {
  const timeline: Array<{ status: string; date: string; note?: string }> = []

  timeline.push({
    status: 'Replacement Requested',
    date: record.returnDate
      ? new Date(record.returnDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      : record.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
    note: record.reason || undefined,
  })

  const status = mapReturnStatus(record.status)

  if (['approved', 'processing', 'shipped', 'delivered'].includes(status)) {
    timeline.unshift({
      status: 'Request Approved',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  if (['processing', 'shipped', 'delivered'].includes(status)) {
    timeline.unshift({
      status: 'Replacement Being Processed',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  if (['shipped', 'delivered'].includes(status)) {
    timeline.unshift({
      status: 'Replacement Shipped',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  if (status === 'delivered') {
    timeline.unshift({
      status: 'Replacement Completed',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  if (status === 'denied') {
    timeline.unshift({
      status: 'Request Denied',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  return timeline
}

function buildBackorderTimeline(record: any): Array<{ status: string; date: string; note?: string }> {
  const timeline: Array<{ status: string; date: string; note?: string }> = []

  timeline.push({
    status: 'Backorder Created',
    date: record.createdAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }),
  })

  const status = mapBackorderStatus(record.status)

  if (['approved', 'processing', 'shipped', 'delivered'].includes(status)) {
    timeline.unshift({
      status: 'Stock Ordered',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  if (['shipped', 'delivered'].includes(status)) {
    timeline.unshift({
      status: 'Replacement Shipped',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  if (status === 'delivered') {
    timeline.unshift({
      status: 'Fulfilled',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  return timeline
}
