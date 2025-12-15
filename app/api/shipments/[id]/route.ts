import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/shipments/:id
 * Get shipment details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid shipment ID' }, { status: 400 })
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        fromLocation: true,
        toLocation: true,
        items: {
          include: {
            product: {
              select: {
                sku: true,
                title: true,
                fnsku: true,
                upc: true,
                transparencyEnabled: true,
                warehouseLocation: true,
                labelType: true,
                prepOwner: true,
                labelOwner: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        boxes: {
          include: {
            items: true,
          },
          orderBy: {
            boxNumber: 'asc',
          },
        },
        transparencyCodes: true,
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    return NextResponse.json({ shipment })
  } catch (error: any) {
    console.error('Error fetching shipment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch shipment' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/shipments/:id
 * Update shipment
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid shipment ID' }, { status: 400 })
    }

    const body = await request.json()
    const {
      fromLocationId,
      toLocationId,
      status,
      optimalPlacementEnabled,
      carrier,
      trackingNumber,
      amazonShipmentId,
      amazonInboundPlanId,
      destinationFc,
      destinationName,
      submittedAt,
      shippedAt,
      receivedAt,
      items,
      boxes,
    } = body

    const updateData: any = {}
    if (fromLocationId !== undefined) updateData.fromLocationId = fromLocationId
    if (toLocationId !== undefined) updateData.toLocationId = toLocationId
    if (status !== undefined) updateData.status = status
    if (optimalPlacementEnabled !== undefined)
      updateData.optimalPlacementEnabled = optimalPlacementEnabled
    if (carrier !== undefined) updateData.carrier = carrier
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber
    if (amazonShipmentId !== undefined)
      updateData.amazonShipmentId = amazonShipmentId
    if (amazonInboundPlanId !== undefined)
      updateData.amazonInboundPlanId = amazonInboundPlanId
    if (destinationFc !== undefined) updateData.destinationFc = destinationFc
    if (destinationName !== undefined) updateData.destinationName = destinationName
    if (submittedAt !== undefined)
      updateData.submittedAt = submittedAt ? new Date(submittedAt) : null
    if (shippedAt !== undefined)
      updateData.shippedAt = shippedAt ? new Date(shippedAt) : null
    if (receivedAt !== undefined)
      updateData.receivedAt = receivedAt ? new Date(receivedAt) : null

    // Update items if provided
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.id) {
          const updateItemData: any = {}
          
          // Update pick status
          if (item.pickStatus !== undefined) {
            updateItemData.pickStatus = item.pickStatus
            updateItemData.pickedAt = item.pickStatus === 'picked' ? new Date() : null
          }
          
          // Update quantities
          if (item.adjustedQty !== undefined) {
            updateItemData.adjustedQty = item.adjustedQty
          }
          if (item.requestedQty !== undefined) {
            updateItemData.requestedQty = item.requestedQty
          }
          
          if (Object.keys(updateItemData).length > 0) {
            await prisma.shipmentItem.update({
              where: { id: item.id },
              data: updateItemData,
            })
          }
        }
      }
      
      // Handle deleted items (items in DB but not in request)
      const existingItems = await prisma.shipmentItem.findMany({
        where: { shipmentId: id },
        select: { id: true },
      })
      const requestItemIds = items.map((i: any) => i.id).filter(Boolean)
      const deletedItemIds = existingItems
        .map((i: any) => i.id)
        .filter((id: any) => !requestItemIds.includes(id))
      
      if (deletedItemIds.length > 0) {
        await prisma.shipmentItem.deleteMany({
          where: { id: { in: deletedItemIds } },
        })
      }
    }

    // Update boxes if provided
    if (boxes && Array.isArray(boxes)) {
      // Delete existing boxes and recreate
      await prisma.shipmentBoxItem.deleteMany({
        where: {
          shipmentBox: { shipmentId: id },
        },
      })
      await prisma.shipmentBox.deleteMany({
        where: { shipmentId: id },
      })

      // Create new boxes
      for (const box of boxes) {
        const createdBox = await prisma.shipmentBox.create({
          data: {
            shipmentId: id,
            boxNumber: box.boxNumber,
            lengthInches: box.lengthInches || null,
            widthInches: box.widthInches || null,
            heightInches: box.heightInches || null,
            weightLbs: box.weightLbs || null,
          },
        })

        // Create box items
        if (box.items && Array.isArray(box.items)) {
          for (const item of box.items) {
            if (item.quantity > 0) {
              await prisma.shipmentBoxItem.create({
                data: {
                  shipmentBoxId: createdBox.id,
                  masterSku: item.sku,
                  quantity: item.quantity,
                },
              })
            }
          }
        }
      }
    }

    const shipment = await prisma.shipment.update({
      where: { id },
      data: updateData,
      include: {
        fromLocation: true,
        toLocation: true,
        items: {
          include: {
            product: {
              select: {
                sku: true,
                title: true,
                fnsku: true,
              },
            },
          },
        },
        boxes: {
          include: {
            items: true,
          },
        },
      },
    })

    return NextResponse.json(shipment)
  } catch (error: any) {
    console.error('Error updating shipment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update shipment' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/shipments/:id
 * Delete draft shipment
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid shipment ID' }, { status: 400 })
    }

    // Only allow deletion of draft shipments
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: { status: true },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (shipment.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft shipments can be deleted' },
        { status: 400 }
      )
    }

    await prisma.shipment.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting shipment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete shipment' },
      { status: 500 }
    )
  }
}

