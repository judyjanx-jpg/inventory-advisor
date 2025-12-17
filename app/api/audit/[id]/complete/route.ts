import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}))
    const { endEarly = false, applyChanges = true } = body

    // Get the session with all entries
    const session = await prisma.auditSession.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        entries: true,
        warehouse: true,
      },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Audit session not found' },
        { status: 404 }
      )
    }

    // If ending early WITHOUT applying changes, revert all inventory updates
    if (endEarly && !applyChanges) {
      // Revert each entry's inventory change
      for (const entry of session.entries) {
        // Restore previous inventory quantity
        await prisma.warehouseInventory.upsert({
          where: {
            warehouseId_masterSku: {
              warehouseId: session.warehouseId,
              masterSku: entry.sku,
            },
          },
          update: {
            available: entry.previousQty,
            lastSynced: new Date(),
          },
          create: {
            warehouseId: session.warehouseId,
            masterSku: entry.sku,
            available: entry.previousQty,
            reserved: 0,
            lastSynced: new Date(),
          },
        })

        // Recalculate aggregated inventory
        const allWarehouseInventory = await prisma.warehouseInventory.findMany({
          where: { masterSku: entry.sku },
          select: { available: true },
        })
        const totalWarehouseAvailable = allWarehouseInventory.reduce(
          (sum: number, inv: any) => sum + inv.available,
          0
        )

        await prisma.inventoryLevel.updateMany({
          where: { masterSku: entry.sku },
          data: {
            warehouseAvailable: totalWarehouseAvailable,
            warehouseLastSync: new Date(),
          },
        })
      }
    }

    // Mark the session as completed
    const updatedSession = await prisma.auditSession.update({
      where: { id: parseInt(params.id) },
      data: {
        status: endEarly && !applyChanges ? 'cancelled' : 'completed',
        completedAt: new Date(),
      },
      include: {
        entries: true,
        warehouse: true,
      },
    })

    return NextResponse.json({
      session: updatedSession,
      changesApplied: applyChanges,
      endedEarly: endEarly,
    })
  } catch (error: any) {
    console.error('Error completing audit session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to complete audit session' },
      { status: 500 }
    )
  }
}
