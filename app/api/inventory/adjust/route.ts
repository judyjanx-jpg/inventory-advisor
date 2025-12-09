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

    let oldQty = 0

    if (warehouseId) {
      // Update warehouse-specific inventory
      const existingWarehouseInv = await prisma.warehouseInventory.findUnique({
        where: {
          warehouseId_masterSku: {
            warehouseId: warehouseId,
            masterSku: sku,
          },
        },
      })

      oldQty = existingWarehouseInv?.available || 0

      await prisma.warehouseInventory.upsert({
        where: {
          warehouseId_masterSku: {
            warehouseId: warehouseId,
            masterSku: sku,
          },
        },
        update: {
          available: newQty,
          lastSynced: new Date(),
        },
        create: {
          warehouseId: warehouseId,
          masterSku: sku,
          available: newQty,
          reserved: 0,
          lastSynced: new Date(),
        },
      })
    } else {
      // Update general inventory level (warehouseAvailable)
      const existingInventory = await prisma.inventoryLevel.findUnique({
        where: { masterSku: sku },
      })

      oldQty = existingInventory?.warehouseAvailable || 0

      await prisma.inventoryLevel.upsert({
        where: { masterSku: sku },
        update: {
          warehouseAvailable: newQty,
          warehouseLastSync: new Date(),
        },
        create: {
          masterSku: sku,
          warehouseAvailable: newQty,
          warehouseLastSync: new Date(),
        },
      })
    }

    const adjustment = newQty - oldQty

    // Log the adjustment
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





