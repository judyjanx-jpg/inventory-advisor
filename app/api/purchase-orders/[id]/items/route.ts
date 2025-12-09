import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Add item to PO
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { masterSku, quantityOrdered, unitCost, lineTotal } = body

    if (!masterSku) {
      return NextResponse.json(
        { error: 'SKU is required' },
        { status: 400 }
      )
    }

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { sku: masterSku },
    })

    if (!product) {
      return NextResponse.json(
        { error: `Product with SKU ${masterSku} not found` },
        { status: 404 }
      )
    }

    // Create item
    const item = await prisma.purchaseOrderItem.create({
      data: {
        poId: parseInt(params.id),
        masterSku,
        quantityOrdered: quantityOrdered || 0,
        unitCost: unitCost || 0,
        lineTotal: lineTotal || (quantityOrdered || 0) * (unitCost || 0),
      },
      include: {
        product: true,
      },
    })

    // Recalculate PO totals
    await recalculatePOTotals(parseInt(params.id))

    return NextResponse.json(item)
  } catch (error: any) {
    console.error('Error adding item:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add item' },
      { status: 500 }
    )
  }
}

// DELETE - Delete items from PO
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { itemIds } = body

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json(
        { error: 'itemIds array is required' },
        { status: 400 }
      )
    }

    await prisma.purchaseOrderItem.deleteMany({
      where: {
        poId: parseInt(params.id),
        id: { in: itemIds.map((id: any) => parseInt(id)) },
      },
    })

    // Recalculate PO totals
    await recalculatePOTotals(parseInt(params.id))

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting items:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete items' },
      { status: 500 }
    )
  }
}

async function recalculatePOTotals(poId: number) {
  const items = await prisma.purchaseOrderItem.findMany({
    where: { poId },
  })

  const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal), 0)

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { shippingCost: true, tax: true, otherCosts: true },
  })

  const total = subtotal + Number(po?.shippingCost || 0) + Number(po?.tax || 0) + Number(po?.otherCosts || 0)

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: {
      subtotal,
      total,
    },
  })
}

