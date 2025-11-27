import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { sku, newQty, reason, warehouseId, adjustedBy, shipmentId } = body

    if (!sku || newQty === undefined) {
      return NextResponse.json(
        { error: 'SKU and newQty are required' },
        { status: 400 }
      )
    }

    // Find the product
    const product = await prisma.product.findUnique({
      where: { sku },
    })

    if (!product) {
      return NextResponse.json(
        { error: `Product with SKU ${sku} not found` },
        { status: 404 }
      )
    }

    // Find existing inventory level
    const existingInventory = await prisma.inventoryLevel.findFirst({
      where: {
        masterSku: sku,
        ...(warehouseId && { warehouseId }),
      },
    })

    const oldQty = existingInventory?.quantity || 0
    const adjustment = newQty - oldQty

    if (existingInventory) {
      // Update existing inventory level
      await prisma.inventoryLevel.update({
        where: { id: existingInventory.id },
        data: { 
          quantity: newQty,
          updatedAt: new Date(),
        },
      })
    } else if (warehouseId) {
      // Create new inventory level
      await prisma.inventoryLevel.create({
        data: {
          masterSku: sku,
          warehouseId,
          quantity: newQty,
          channel: 'warehouse',
        },
      })
    }

    // Log the adjustment (optional - if you have an adjustment log table)
    console.log('Inventory adjustment:', {
      sku,
      oldQty,
      newQty,
      adjustment,
      reason,
      adjustedBy,
      shipmentId,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      sku,
      oldQty,
      newQty,
      adjustment,
      reason,
    })
  } catch (error) {
    console.error('Error adjusting inventory:', error)
    return NextResponse.json(
      { error: 'Failed to adjust inventory' },
      { status: 500 }
    )
  }
}

