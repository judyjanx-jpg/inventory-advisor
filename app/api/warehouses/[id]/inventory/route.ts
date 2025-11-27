import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Upload/update warehouse inventory
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { inventory } = body // Array of { masterSku, available, reserved }

    if (!Array.isArray(inventory)) {
      return NextResponse.json(
        { error: 'Inventory must be an array' },
        { status: 400 }
      )
    }

    const warehouseId = parseInt(params.id)
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    })

    if (!warehouse) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )
    }

    let updated = 0
    let created = 0
    let skipped = 0

    // Process each inventory item
    for (const item of inventory) {
      const { masterSku, available = 0, reserved = 0 } = item

      // Verify product exists
      const product = await prisma.product.findUnique({
        where: { sku: masterSku },
      })

      if (!product) {
        skipped++
        continue
      }

      // Upsert warehouse inventory
      await prisma.warehouseInventory.upsert({
        where: {
          warehouseId_masterSku: {
            warehouseId,
            masterSku,
          },
        },
        update: {
          available,
          reserved,
          lastSynced: new Date(),
        },
        create: {
          warehouseId,
          masterSku,
          available,
          reserved,
          lastSynced: new Date(),
        },
      })

      // Update aggregated inventory level
      const totalWarehouseInventory = await prisma.warehouseInventory.groupBy({
        by: ['masterSku'],
        where: { masterSku },
        _sum: {
          available: true,
          reserved: true,
        },
      })

      const total = totalWarehouseInventory[0]?._sum || { available: 0, reserved: 0 }

      await prisma.inventoryLevel.upsert({
        where: { masterSku },
        update: {
          warehouseAvailable: total.available || 0,
          warehouseReserved: total.reserved || 0,
          warehouseLastSync: new Date(),
        },
        create: {
          masterSku,
          warehouseAvailable: total.available || 0,
          warehouseReserved: total.reserved || 0,
          fbaAvailable: 0,
          fbaInboundWorking: 0,
          fbaInboundShipped: 0,
          fbaInboundReceiving: 0,
          fbaReserved: 0,
          fbaUnfulfillable: 0,
        },
      })

      const existing = await prisma.warehouseInventory.findUnique({
        where: {
          warehouseId_masterSku: {
            warehouseId,
            masterSku,
          },
        },
      })

      if (existing) {
        updated++
      } else {
        created++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Inventory updated: ${created} created, ${updated} updated, ${skipped} skipped (product not found)`,
      created,
      updated,
      skipped,
    })
  } catch (error: any) {
    console.error('Error uploading warehouse inventory:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload warehouse inventory' },
      { status: 500 }
    )
  }
}

// Get warehouse inventory
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const inventory = await prisma.warehouseInventory.findMany({
      where: { warehouseId: parseInt(params.id) },
      include: {
        product: {
          select: {
            sku: true,
            title: true,
          },
        },
      },
      orderBy: {
        product: {
          title: 'asc',
        },
      },
    })

    return NextResponse.json(inventory)
  } catch (error: any) {
    console.error('Error fetching warehouse inventory:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch warehouse inventory' },
      { status: 500 }
    )
  }
}

