import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * PUT /api/shipments/:id/items/:itemId
 * Update shipment item
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const itemId = parseInt(params.itemId)
    if (isNaN(itemId)) {
      return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 })
    }

    const body = await request.json()
    const { requestedQty, adjustedQty, pickStatus } = body

    // Verify shipment is editable
    const shipment = await prisma.shipment.findUnique({
      where: { id: parseInt(params.id) },
      select: { status: true },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (!['draft', 'ready'].includes(shipment.status) && !pickStatus) {
      return NextResponse.json(
        { error: 'Cannot edit items in shipment with current status' },
        { status: 400 }
      )
    }

    const updateData: any = {}
    if (requestedQty !== undefined) updateData.requestedQty = requestedQty
    if (adjustedQty !== undefined) updateData.adjustedQty = adjustedQty
    if (pickStatus !== undefined) {
      updateData.pickStatus = pickStatus
      if (pickStatus === 'picked') {
        updateData.pickedAt = new Date()
      }
    }

    const item = await prisma.shipmentItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        product: {
          select: {
            sku: true,
            title: true,
            fnsku: true,
          },
        },
      },
    })

    return NextResponse.json({ item })
  } catch (error: any) {
    console.error('Error updating shipment item:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update item' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/shipments/:id/items/:itemId
 * Remove item from shipment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const itemId = parseInt(params.itemId)
    if (isNaN(itemId)) {
      return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 })
    }

    // Verify shipment is editable
    const shipment = await prisma.shipment.findUnique({
      where: { id: parseInt(params.id) },
      select: { status: true },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (!['draft', 'ready'].includes(shipment.status)) {
      return NextResponse.json(
        { error: 'Cannot remove items from shipment in current status' },
        { status: 400 }
      )
    }

    await prisma.shipmentItem.delete({
      where: { id: itemId },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error removing item from shipment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to remove item' },
      { status: 500 }
    )
  }
}

