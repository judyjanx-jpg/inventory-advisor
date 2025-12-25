import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    })

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(purchaseOrder)
  } catch (error: any) {
    console.error('Error fetching purchase order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch purchase order' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const {
      status,
      createdDate,
      orderDate,
      confirmedDate,
      expectedShipDate,
      expectedArrivalDate,
      actualShipDate,
      actualArrivalDate,
      carrier,
      trackingNumber,
      paymentStatus,
      paymentDate,
      paymentMethod,
      paymentReference,
      notes,
      shippingCost,
      tax,
      otherCosts,
      total,
    } = body

    const updateData: any = {}

    if (status !== undefined) {
      updateData.status = status
      
      if (status === 'sent' && !body.sentDate) {
        updateData.sentDate = new Date()
      }
      if (status === 'confirmed' && !body.confirmedDate) {
        updateData.confirmedDate = new Date()
      }
      if (status === 'shipped' && !actualShipDate) {
        updateData.actualShipDate = new Date()
      }
      if (status === 'received' && !actualArrivalDate) {
        updateData.actualArrivalDate = new Date()
      }
    }

    // Handle leadTimeDays calculation
    if (body.leadTimeDays !== undefined) {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: parseInt(params.id) },
        select: { orderDate: true, createdDate: true },
      })
      if (po && (po.orderDate || po.createdDate)) {
        const baseDate = po.orderDate || po.createdDate
        const newExpectedDate = new Date(baseDate)
        newExpectedDate.setDate(newExpectedDate.getDate() + Number(body.leadTimeDays))
        updateData.expectedArrivalDate = newExpectedDate
      }
    }

    if (createdDate !== undefined) {
      updateData.createdDate = createdDate ? new Date(createdDate) : new Date()
    }
    if (orderDate !== undefined) {
      updateData.orderDate = new Date(orderDate)
      // Recalculate expected date if lead time should be maintained
      if (body.leadTimeDays !== undefined) {
        const newExpectedDate = new Date(orderDate)
        newExpectedDate.setDate(newExpectedDate.getDate() + Number(body.leadTimeDays))
        updateData.expectedArrivalDate = newExpectedDate
      }
    }
    if (confirmedDate !== undefined) {
      updateData.confirmedDate = confirmedDate ? new Date(confirmedDate) : null
    }
    if (expectedShipDate !== undefined) updateData.expectedShipDate = new Date(expectedShipDate)
    if (expectedArrivalDate !== undefined) {
      updateData.expectedArrivalDate = expectedArrivalDate ? new Date(expectedArrivalDate) : null
    }
    if (actualShipDate !== undefined) updateData.actualShipDate = new Date(actualShipDate)
    if (actualArrivalDate !== undefined) updateData.actualArrivalDate = new Date(actualArrivalDate)
    if (carrier !== undefined) updateData.carrier = carrier
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus
    if (paymentDate !== undefined) updateData.paymentDate = new Date(paymentDate)
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod
    if (paymentReference !== undefined) updateData.paymentReference = paymentReference
    if (notes !== undefined) updateData.notes = notes
    if (shippingCost !== undefined) updateData.shippingCost = shippingCost
    if (tax !== undefined) updateData.tax = tax
    if (otherCosts !== undefined) updateData.otherCosts = otherCosts
    
    // Get current PO to recalculate total
    const currentPO = await prisma.purchaseOrder.findUnique({
      where: { id: parseInt(params.id) },
      select: { subtotal: true, shippingCost: true, tax: true, otherCosts: true },
    })

    if (currentPO) {
      const newShipping = shippingCost !== undefined ? shippingCost : Number(currentPO.shippingCost || 0)
      const newTax = tax !== undefined ? tax : Number(currentPO.tax || 0)
      const newOther = otherCosts !== undefined ? otherCosts : Number(currentPO.otherCosts || 0)
      updateData.total = Number(currentPO.subtotal) + Number(newShipping) + Number(newTax) + Number(newOther)
    } else if (total !== undefined) {
      updateData.total = total
    }

    const purchaseOrder = await prisma.purchaseOrder.update({
      where: { id: parseInt(params.id) },
      data: updateData,
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    })

    // If marked as received, update supplier performance
    if (status === 'received' && purchaseOrder.expectedArrivalDate && purchaseOrder.actualArrivalDate) {
      const expected = new Date(purchaseOrder.expectedArrivalDate)
      const actual = new Date(purchaseOrder.actualArrivalDate)
      const actualLeadTime = Math.round((actual.getTime() - new Date(purchaseOrder.createdDate).getTime()) / (1000 * 60 * 60 * 24))
      
      // Update supplier's average lead time
      await prisma.supplier.update({
        where: { id: purchaseOrder.supplierId },
        data: {
          avgActualLeadTime: actualLeadTime,
        },
      })
    }

    return NextResponse.json(purchaseOrder)
  } catch (error: any) {
    console.error('Error updating purchase order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update purchase order' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}))
    const { deductInventory } = body

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: parseInt(params.id) },
      include: { items: true },
    })

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      )
    }

    // If we need to deduct inventory (for received POs)
    if (deductInventory) {
      for (const item of purchaseOrder.items) {
        if (item.quantityReceived > 0) {
          await prisma.inventoryLevel.update({
            where: { masterSku: item.masterSku },
            data: {
              warehouseAvailable: {
                decrement: item.quantityReceived,
              },
            },
          }).catch(() => {
            // Inventory might not exist, that's ok
          })
        }
      }

      // Reset supplier performance data (simplified - in production you'd recalculate)
      await prisma.supplier.update({
        where: { id: purchaseOrder.supplierId },
        data: {
          avgActualLeadTime: null,
        },
      }).catch(() => {})
    }

    // Delete items first
    await prisma.purchaseOrderItem.deleteMany({
      where: { poId: parseInt(params.id) },
    })

    // Delete the PO
    await prisma.purchaseOrder.delete({
      where: { id: parseInt(params.id) },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting purchase order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete purchase order' },
      { status: 500 }
    )
  }
}
