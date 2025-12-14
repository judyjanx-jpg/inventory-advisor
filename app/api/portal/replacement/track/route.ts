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
    // Return model uses: returnId (unique), orderId, masterSku, disposition
    const returnRecord = await prisma.return.findFirst({
      where: replacementId
        ? {
            OR: [
              { id: parseInt(replacementId.replace(/\D/g, '')) || -1 },
              { returnId: replacementId },
            ]
          }
        : {
            orderId: orderId
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
      // Try to find in backorders as replacement (for PO-related backorders)
      const backorder = await prisma.backorder.findFirst({
        where: {
          OR: [
            { id: parseInt((replacementId || orderId)?.replace(/\D/g, '') || '0') || -1 },
            { poNumber: orderId || '' },
          ]
        }
      })

      if (!backorder) {
        return NextResponse.json({
          success: false,
          error: 'Replacement request not found. Please check your ID and try again.'
        }, { status: 404 })
      }

      // Get product info separately
      const product = await prisma.product.findFirst({
        where: { sku: backorder.masterSku },
        select: { title: true, sku: true }
      })

      // Return backorder as replacement info
      return NextResponse.json({
        success: true,
        replacement: {
          replacementId: `RPL-${backorder.id}`,
          originalOrderId: backorder.poNumber || 'N/A',
          requestDate: backorder.createdAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          status: mapBackorderStatus(backorder.status),
          reason: 'Backorder replacement',
          items: [{
            name: product?.title || backorder.masterSku,
            quantity: backorder.quantity,
            sku: backorder.masterSku,
          }],
          timeline: buildBackorderTimeline(backorder),
        }
      })
    }

    // Return replacement/return info
    // Note: Return model uses 'disposition' instead of 'status'
    return NextResponse.json({
      success: true,
      replacement: {
        replacementId: returnRecord.returnId || `RPL-${returnRecord.id}`,
        originalOrderId: returnRecord.orderId || 'N/A',
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
        status: mapReturnStatus(returnRecord.disposition),
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

function mapReturnStatus(disposition: string | null): 'pending_approval' | 'approved' | 'processing' | 'shipped' | 'delivered' | 'denied' {
  if (!disposition) return 'pending_approval'

  const d = disposition.toLowerCase()
  // disposition values: sellable, damaged, customer_damaged, defective
  if (d.includes('sellable')) return 'delivered'
  if (d.includes('damaged') || d.includes('defective')) return 'processing'
  return 'processing'
}

function mapBackorderStatus(status: string | null): 'pending_approval' | 'approved' | 'processing' | 'shipped' | 'delivered' | 'denied' {
  if (!status) return 'pending_approval'

  const s = status.toLowerCase()
  if (s.includes('pending')) return 'pending_approval'
  if (s.includes('received')) return 'delivered'
  if (s.includes('cancelled')) return 'denied'
  return 'processing'
}

function buildReturnTimeline(record: { returnDate: Date; createdAt: Date; updatedAt: Date; reason?: string | null; disposition: string }): Array<{ status: string; date: string; note?: string }> {
  const timeline: Array<{ status: string; date: string; note?: string }> = []

  timeline.push({
    status: 'Return Initiated',
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

  const status = mapReturnStatus(record.disposition)

  if (['processing', 'shipped', 'delivered'].includes(status)) {
    timeline.unshift({
      status: 'Return Received',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  if (status === 'delivered') {
    timeline.unshift({
      status: 'Return Processed',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      note: `Disposition: ${record.disposition}`,
    })
  }

  return timeline
}

function buildBackorderTimeline(record: { createdAt: Date; updatedAt: Date; status: string; expectedDate?: Date | null; receivedDate?: Date | null }): Array<{ status: string; date: string; note?: string }> {
  const timeline: Array<{ status: string; date: string; note?: string }> = []

  timeline.push({
    status: 'Backorder Created',
    date: record.createdAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }),
  })

  if (record.expectedDate) {
    timeline.unshift({
      status: 'Expected Arrival',
      date: record.expectedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  const status = mapBackorderStatus(record.status)

  if (status === 'delivered' && record.receivedDate) {
    timeline.unshift({
      status: 'Received',
      date: record.receivedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  if (status === 'denied') {
    timeline.unshift({
      status: 'Cancelled',
      date: record.updatedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
    })
  }

  return timeline
}
