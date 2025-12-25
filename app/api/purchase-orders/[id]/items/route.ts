import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Add items to an existing purchase order
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const poId = parseInt(params.id)
    const body = await request.json()
    const { items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      )
    }

    // Verify PO exists and is in a state that allows adding items
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    })

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      )
    }

    if (!['draft', 'pending'].includes(purchaseOrder.status)) {
      return NextResponse.json(
        { error: 'Cannot add items to a PO that is not in draft or pending status' },
        { status: 400 }
      )
    }

    // Validate that all SKUs exist
    const skus = items.map((item: any) => item.masterSku).filter(Boolean)
    if (skus.length === 0) {
      return NextResponse.json(
        { error: 'All items must have a valid SKU' },
        { status: 400 }
      )
    }

    const existingProducts = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { sku: true, cost: true },
    })
    const existingSkuMap = new Map(existingProducts.map((p: any) => [p.sku, p]))
    const missingSkus = skus.filter((sku: string) => !existingSkuMap.has(sku))

    if (missingSkus.length > 0) {
      return NextResponse.json(
        {
          error: `The following SKUs do not exist: ${missingSkus.join(', ')}`,
          missingSkus,
        },
        { status: 400 }
      )
    }

    // Check for duplicate SKUs already in the PO
    const existingPoSkus = new Set(purchaseOrder.items.map((item: any) => item.masterSku))
    const duplicateSkus = skus.filter((sku: string) => existingPoSkus.has(sku))

    if (duplicateSkus.length > 0) {
      return NextResponse.json(
        {
          error: `The following SKUs are already in this PO: ${duplicateSkus.join(', ')}. Update quantities instead.`,
          duplicateSkus,
        },
        { status: 400 }
      )
    }

    // Create PO items
    const itemsToCreate = items.map((item: any) => ({
      poId,
      masterSku: item.masterSku,
      quantityOrdered: item.quantityOrdered || 1,
      quantityReceived: 0,
      quantityDamaged: 0,
      unitCost: item.unitCost || existingSkuMap.get(item.masterSku)?.cost || 0,
    }))

    await prisma.purchaseOrderItem.createMany({
      data: itemsToCreate,
    })

    // Recalculate PO totals
    const allItems = await prisma.purchaseOrderItem.findMany({
      where: { poId },
    })

    const newSubtotal = allItems.reduce(
      (sum: number, item: any) => sum + Number(item.unitCost) * item.quantityOrdered,
      0
    )

    const updatedPO = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        subtotal: newSubtotal,
        total: newSubtotal + Number(purchaseOrder.shippingCost || 0) + Number(purchaseOrder.tax || 0) + Number(purchaseOrder.otherCosts || 0),
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: `Added ${items.length} item(s) to PO`,
      purchaseOrder: updatedPO,
    })
  } catch (error: any) {
    console.error('Error adding items to PO:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add items to purchase order' },
      { status: 500 }
    )
  }
}

// DELETE - Remove items from a purchase order
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const poId = parseInt(params.id)
    const body = await request.json()
    const { itemIds } = body

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json(
        { error: 'itemIds array is required' },
        { status: 400 }
      )
    }

    // Verify PO exists and is in a state that allows removing items
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    })

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      )
    }

    if (!['draft', 'pending'].includes(purchaseOrder.status)) {
      return NextResponse.json(
        { error: 'Cannot remove items from a PO that is not in draft or pending status' },
        { status: 400 }
      )
    }

    // Verify all itemIds belong to this PO
    const poItemIds = new Set(purchaseOrder.items.map((item: any) => item.id))
    const invalidIds = itemIds.filter((id: number) => !poItemIds.has(id))

    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Item IDs ${invalidIds.join(', ')} do not belong to this PO` },
        { status: 400 }
      )
    }

    // Delete the items
    await prisma.purchaseOrderItem.deleteMany({
      where: {
        id: { in: itemIds },
        poId,
      },
    })

    // Recalculate PO totals
    const remainingItems = await prisma.purchaseOrderItem.findMany({
      where: { poId },
    })

    const newSubtotal = remainingItems.reduce(
      (sum: number, item: any) => sum + Number(item.unitCost) * item.quantityOrdered,
      0
    )

    const updatedPO = await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        subtotal: newSubtotal,
        total: newSubtotal + Number(purchaseOrder.shippingCost || 0) + Number(purchaseOrder.tax || 0) + Number(purchaseOrder.otherCosts || 0),
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: `Removed ${itemIds.length} item(s) from PO`,
      purchaseOrder: updatedPO,
    })
  } catch (error: any) {
    console.error('Error removing items from PO:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to remove items from purchase order' },
      { status: 500 }
    )
  }
}
