import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { sku, newQty, notes } = body

    if (!sku || newQty === undefined) {
      return NextResponse.json(
        { error: 'sku and newQty are required' },
        { status: 400 }
      )
    }

    // Get audit session
    const session = await prisma.auditSession.findUnique({
      where: { id: parseInt(params.id) },
      include: { warehouse: true },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Audit session not found' },
        { status: 404 }
      )
    }

    // Get current warehouse inventory
    const warehouseInventory = await prisma.warehouseInventory.findUnique({
      where: {
        warehouseId_masterSku: {
          warehouseId: session.warehouseId,
          masterSku: sku,
        },
      },
    })

    const previousQty = warehouseInventory?.available || 0
    const variance = newQty - previousQty

    // Check if this is a large discrepancy (flag it)
    const threshold = 10 // Default: 10 units or 20%
    const percentageThreshold = previousQty > 0 ? (previousQty * 0.2) : 0
    const isFlagged = Math.abs(variance) > threshold || Math.abs(variance) > percentageThreshold

    // Get parent SKU if exists
    const product = await prisma.product.findUnique({
      where: { sku },
      select: { parentSku: true },
    })

    // Create or update audit entry
    const existingEntry = await prisma.auditEntry.findFirst({
      where: {
        auditSessionId: parseInt(params.id),
        sku,
      },
    })

    let entry
    if (existingEntry) {
      entry = await prisma.auditEntry.update({
        where: { id: existingEntry.id },
        data: {
          newQty,
          variance,
          isFlagged,
          notes,
          auditedAt: new Date(),
        },
      })
    } else {
      entry = await prisma.auditEntry.create({
        data: {
          auditSessionId: parseInt(params.id),
          sku,
          parentSku: product?.parentSku || null,
          previousQty,
          newQty,
          variance,
          isFlagged,
          notes,
        },
      })

      // Increment audited count
      await prisma.auditSession.update({
        where: { id: parseInt(params.id) },
        data: {
          auditedCount: { increment: 1 },
        },
      })
    }

    // Update warehouse inventory immediately
    await prisma.warehouseInventory.upsert({
      where: {
        warehouseId_masterSku: {
          warehouseId: session.warehouseId,
          masterSku: sku,
        },
      },
      update: {
        available: newQty,
        lastSynced: new Date(),
      },
      create: {
        warehouseId: session.warehouseId,
        masterSku: sku,
        available: newQty,
        reserved: 0,
        lastSynced: new Date(),
      },
    })

    // Update aggregated inventory level
    const inventoryLevel = await prisma.inventoryLevel.findUnique({
      where: { masterSku: sku },
    })

    if (inventoryLevel) {
      // Recalculate warehouseAvailable from all warehouses
      const allWarehouseInventory = await prisma.warehouseInventory.findMany({
        where: { masterSku: sku },
        select: { available: true },
      })
      const totalWarehouseAvailable = allWarehouseInventory.reduce(
        (sum: number, inv: any) => sum + inv.available,
        0
      )

      await prisma.inventoryLevel.update({
        where: { masterSku: sku },
        data: {
          warehouseAvailable: totalWarehouseAvailable,
          warehouseLastSync: new Date(),
        },
      })
    }

    return NextResponse.json({ entry, success: true })
  } catch (error: any) {
    console.error('Error saving audit entry:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save audit entry' },
      { status: 500 }
    )
  }
}

