import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT - Update item
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const body = await request.json()
    const { quantityOrdered, unitCost, lineTotal } = body

    const updateData: any = {}

    if (quantityOrdered !== undefined) updateData.quantityOrdered = quantityOrdered
    if (unitCost !== undefined) updateData.unitCost = unitCost
    if (lineTotal !== undefined) {
      updateData.lineTotal = lineTotal
    } else if (quantityOrdered !== undefined || unitCost !== undefined) {
      // Recalculate line total
      const item = await prisma.purchaseOrderItem.findUnique({
        where: { id: parseInt(params.itemId) },
      })
      if (item) {
        const qty = quantityOrdered !== undefined ? quantityOrdered : item.quantityOrdered
        const cost = unitCost !== undefined ? unitCost : Number(item.unitCost)
        updateData.lineTotal = qty * cost
      }
    }

    const updatedItem = await prisma.purchaseOrderItem.update({
      where: { id: parseInt(params.itemId) },
      data: updateData,
      include: {
        product: true,
      },
    })

    // Recalculate PO totals
    const items = await prisma.purchaseOrderItem.findMany({
      where: { poId: parseInt(params.id) },
    })

    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal), 0)

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: parseInt(params.id) },
      select: { shippingCost: true, tax: true, otherCosts: true },
    })

    const total = subtotal + Number(po?.shippingCost || 0) + Number(po?.tax || 0) + Number(po?.otherCosts || 0)

    await prisma.purchaseOrder.update({
      where: { id: parseInt(params.id) },
      data: {
        subtotal,
        total,
      },
    })

    return NextResponse.json(updatedItem)
  } catch (error: any) {
    console.error('Error updating item:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update item' },
      { status: 500 }
    )
  }
}

// DELETE - Delete single item
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    await prisma.purchaseOrderItem.delete({
      where: { id: parseInt(params.itemId) },
    })

    // Recalculate PO totals
    const items = await prisma.purchaseOrderItem.findMany({
      where: { poId: parseInt(params.id) },
    })

    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal), 0)

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: parseInt(params.id) },
      select: { shippingCost: true, tax: true, otherCosts: true },
    })

    const total = subtotal + Number(po?.shippingCost || 0) + Number(po?.tax || 0) + Number(po?.otherCosts || 0)

    await prisma.purchaseOrder.update({
      where: { id: parseInt(params.id) },
      data: {
        subtotal,
        total,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting item:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete item' },
      { status: 500 }
    )
  }
}

