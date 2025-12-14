import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/shipments/:id/ship
 * Mark shipment as shipped and decrement inventory
 *
 * Body:
 * - trackingNumber: Optional tracking number (for non-Amazon shipments)
 * - carrier: Optional carrier name
 * - skipAmazonValidation: boolean - Skip validation that shipment was submitted to Amazon
 * - splitTrackingNumbers: Array of { amazonShipmentId, trackingNumber } for per-split tracking
 */
export async function POST(
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
      trackingNumber,
      carrier,
      skipAmazonValidation = false,
      splitTrackingNumbers = [],
    } = body

    // Get the shipment with items, boxes, and Amazon splits
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        items: true,
        boxes: {
          include: {
            items: true,
          },
        },
        amazonSplits: true,
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (shipment.status === 'shipped') {
      return NextResponse.json({ error: 'Shipment already shipped' }, { status: 400 })
    }

    // Validate Amazon submission if shipment has an inbound plan
    if (shipment.amazonInboundPlanId && !skipAmazonValidation) {
      const validSteps = ['labels_ready', 'transport_confirmed']
      if (!validSteps.includes(shipment.amazonWorkflowStep || '')) {
        return NextResponse.json({
          error: 'Shipment must complete Amazon submission workflow before shipping',
          currentStep: shipment.amazonWorkflowStep,
          requiredSteps: validSteps,
          hint: 'Use skipAmazonValidation: true to override (not recommended)',
        }, { status: 400 })
      }
    }

    // Validate all items are assigned to boxes
    for (const item of shipment.items) {
      const boxTotal = shipment.boxes.reduce((sum: any, box: any) => {
        const boxItem = box.items.find((bi: any) => bi.masterSku === item.masterSku)
        return sum + (boxItem?.quantity || 0)
      }, 0)

      if (boxTotal !== item.adjustedQty) {
        return NextResponse.json({
          error: `Item ${item.masterSku}: ${boxTotal} assigned to boxes, but ${item.adjustedQty} required`,
        }, { status: 400 })
      }
    }

    // Validate all boxes have dimensions
    for (const box of shipment.boxes) {
      if (!box.lengthInches || !box.widthInches || !box.heightInches || !box.weightLbs) {
        return NextResponse.json({
          error: `Box ${box.boxNumber} is missing dimensions or weight`,
        }, { status: 400 })
      }
    }

    // Decrement warehouse inventory
    const fromLocationId = shipment.fromLocationId
    if (fromLocationId) {
      for (const item of shipment.items) {
        // Decrement warehouse inventory
        const warehouseInventory = await prisma.warehouseInventory.findUnique({
          where: {
            warehouseId_masterSku: {
              warehouseId: fromLocationId,
              masterSku: item.masterSku,
            },
          },
        })

        if (warehouseInventory) {
          const newAvailable = Math.max(0, warehouseInventory.available - item.adjustedQty)
          await prisma.warehouseInventory.update({
            where: { id: warehouseInventory.id },
            data: { available: newAvailable },
          })
        }

        // Also update the aggregated inventory level
        const inventoryLevel = await prisma.inventoryLevel.findUnique({
          where: { masterSku: item.masterSku },
        })

        if (inventoryLevel) {
          const newWarehouseAvailable = Math.max(0, inventoryLevel.warehouseAvailable - item.adjustedQty)
          await prisma.inventoryLevel.update({
            where: { masterSku: item.masterSku },
            data: { warehouseAvailable: newWarehouseAvailable },
          })
        }

        // Create inventory adjustment record
        await prisma.inventoryAdjustment.create({
          data: {
            masterSku: item.masterSku,
            location: 'warehouse',
            adjustmentType: 'fba_shipment',
            quantityChange: -item.adjustedQty,
            quantityBefore: warehouseInventory?.available || 0,
            quantityAfter: Math.max(0, (warehouseInventory?.available || 0) - item.adjustedQty),
            reason: `FBA Shipment ${shipment.internalId || `#${shipment.id}`}`,
            reference: shipment.internalId || `SHP-${shipment.id}`,
          },
        })
      }
    }

    // Update Amazon shipment splits if they exist
    if (shipment.amazonSplits.length > 0) {
      for (const split of shipment.amazonSplits) {
        // Find tracking number for this split
        const splitTracking = splitTrackingNumbers.find(
          (st: any) => st.amazonShipmentId === split.amazonShipmentId
        )

        await prisma.amazonShipmentSplit.update({
          where: { id: split.id },
          data: {
            status: 'shipped',
            trackingNumber: splitTracking?.trackingNumber || trackingNumber || split.trackingNumber,
            carrier: carrier || split.carrier,
          },
        })
      }
    }

    // Update shipment status
    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        status: 'shipped',
        shippedAt: new Date(),
        carrier: carrier || null,
        trackingNumber: trackingNumber || null,
        amazonWorkflowStep: shipment.amazonInboundPlanId ? 'shipped' : shipment.amazonWorkflowStep,
      },
      include: {
        fromLocation: true,
        toLocation: true,
        items: true,
        boxes: {
          include: {
            items: true,
          },
        },
        amazonSplits: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Shipment marked as shipped. Inventory has been decremented.',
      shipment: updatedShipment,
      amazonSplits: updatedShipment.amazonSplits?.map((split: { amazonShipmentId: string; destinationFc: string | null; status: string; carrier: string | null; trackingNumber: string | null }) => ({
        amazonShipmentId: split.amazonShipmentId,
        destinationFc: split.destinationFc,
        status: split.status,
        carrier: split.carrier,
        trackingNumber: split.trackingNumber,
      })),
    })
  } catch (error: any) {
    console.error('Error marking shipment as shipped:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to mark shipment as shipped' },
      { status: 500 }
    )
  }
}






