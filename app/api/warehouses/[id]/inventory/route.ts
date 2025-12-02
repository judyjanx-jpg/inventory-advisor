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

    // OPTIMIZATION: Batch load all products upfront
    const allSkus = inventory.map(item => item.masterSku)
    const existingProducts = await prisma.product.findMany({
      where: { sku: { in: allSkus } },
      select: { sku: true },
    })
    const validSkus = new Set(existingProducts.map(p => p.sku))

    // OPTIMIZATION: Batch load existing warehouse inventory
    const existingInventory = await prisma.warehouseInventory.findMany({
      where: {
        warehouseId,
        masterSku: { in: allSkus },
      },
      select: { masterSku: true },
    })
    const existingInventorySkus = new Set(existingInventory.map(inv => inv.masterSku))

    // Filter out invalid SKUs
    const validInventory = inventory.filter(item => validSkus.has(item.masterSku))
    skipped = inventory.length - validInventory.length

    // OPTIMIZATION: Process in smaller transactions to avoid timeouts
    const now = new Date()
    const BATCH_SIZE = 50 // Smaller batches to avoid transaction timeouts
    
    // Process warehouse inventory in batches
    for (let i = 0; i < validInventory.length; i += BATCH_SIZE) {
      const batch = validInventory.slice(i, i + BATCH_SIZE)
      
      await prisma.$transaction(async (tx) => {
        for (const item of batch) {
          const { masterSku, available = 0, reserved = 0 } = item
          const isExisting = existingInventorySkus.has(masterSku)

          await tx.warehouseInventory.upsert({
            where: {
              warehouseId_masterSku: {
                warehouseId,
                masterSku,
              },
            },
            update: {
              available,
              reserved,
              lastSynced: now,
            },
            create: {
              warehouseId,
              masterSku,
              available,
              reserved,
              lastSynced: now,
            },
          })

          if (isExisting) {
            updated++
          } else {
            created++
          }
        }
      }, {
        timeout: 20000, // 20 second timeout per batch
      })
    }

    // Update inventory levels after all warehouse inventory is updated
    const uniqueSkus = Array.from(new Set(validInventory.map(item => item.masterSku)))
    
    if (uniqueSkus.length > 0) {
      // Calculate totals for all SKUs in one query (outside transaction for better performance)
      const totals = await prisma.warehouseInventory.groupBy({
        by: ['masterSku'],
        where: {
          masterSku: { in: uniqueSkus },
        },
        _sum: {
          available: true,
          reserved: true,
        },
      })

      // Update inventory levels in batches
      for (let i = 0; i < totals.length; i += BATCH_SIZE) {
        const batch = totals.slice(i, i + BATCH_SIZE)
        
        await prisma.$transaction(async (tx) => {
          for (const total of batch) {
            const masterSku = total.masterSku
            await tx.inventoryLevel.upsert({
              where: { masterSku },
              update: {
                warehouseAvailable: total._sum.available || 0,
                warehouseReserved: total._sum.reserved || 0,
                warehouseLastSync: now,
              },
              create: {
                masterSku,
                warehouseAvailable: total._sum.available || 0,
                warehouseReserved: total._sum.reserved || 0,
                fbaAvailable: 0,
                fbaInboundWorking: 0,
                fbaInboundShipped: 0,
                fbaInboundReceiving: 0,
                fbaReserved: 0,
                fbaUnfulfillable: 0,
              },
            })
          }
        }, {
          timeout: 20000,
        })
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

