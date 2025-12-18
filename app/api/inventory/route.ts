import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const showHidden = searchParams.get('showHidden') === 'true'

    // Get only child products (exclude parent products)
    // A product is a child if: it has a parentSku OR it's not a parent and has no variations
    const products = await prisma.product.findMany({
      where: {
        ...(showHidden ? {} : { isHidden: false }),
        // Exclude parent products - only show child products
        OR: [
          { parentSku: { not: null } }, // Has a parent = child product
          { 
            AND: [
              { isParent: false },
              { parentSku: null },
            ]
          }, // Standalone product (no parent, not a parent itself)
        ],
      },
      include: {
        inventoryLevels: true,
        salesVelocity: true,
        skuMappings: {
          include: {
            channelInventory: true,
          },
        },
        warehouseInventory: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        _count: {
          select: {
            variations: true,
          },
        },
      },
      orderBy: {
        sku: 'asc',
      },
    })

    // Filter out any products that are actually parents (have variations but no parentSku)
    const childProducts = products.filter((p: any) => {
      // If it has variations and no parent, it's a parent - exclude it
      if (p.parentSku === null && (p.isParent || (p._count?.variations || 0) > 0)) {
        return false
      }
      return true
    })

    // Get all inventory levels for these products in one query
    const productSkus = childProducts.map((p: any) => p.sku)
    const inventoryLevels = await prisma.inventoryLevel.findMany({
      where: {
        masterSku: {
          in: productSkus,
        },
      },
    })

    console.log(`[Inventory API] Found ${inventoryLevels.length} inventory levels for ${productSkus.length} products`)
    
    // Check how many have been synced
    const syncedLevels = inventoryLevels.filter((il: any) => il.fbaLastSync !== null)
    console.log(`[Inventory API] ${syncedLevels.length} inventory levels have been synced from Amazon (fbaLastSync is not null)`)
    
    // Log products with inventory > 0
    const productsWithInventory = inventoryLevels.filter((il: any) =>
      Number(il.fbaAvailable) > 0 ||
      Number(il.fbaInboundWorking) > 0 ||
      Number(il.fbaInboundShipped) > 0 ||
      Number(il.fbaInboundReceiving) > 0 ||
      Number(il.warehouseAvailable) > 0
    )
    
    if (productsWithInventory.length > 0) {
      console.log(`[Inventory API] ${productsWithInventory.length} products have inventory > 0`)
      productsWithInventory.slice(0, 5).forEach((il: any) => {
        console.log(`  - ${il.masterSku}: FBA=${il.fbaAvailable}, Inbound=${Number(il.fbaInboundWorking) + Number(il.fbaInboundShipped) + Number(il.fbaInboundReceiving)}, Warehouse=${il.warehouseAvailable}, LastSync=${il.fbaLastSync ? 'Yes' : 'No'}`)
      })
    } else {
      console.log('[Inventory API] WARNING: No products have inventory > 0')
      if (inventoryLevels.length > 0) {
        console.log('Sample inventory level (all zeros):', {
          masterSku: inventoryLevels[0].masterSku,
          fbaAvailable: inventoryLevels[0].fbaAvailable,
          fbaInboundWorking: inventoryLevels[0].fbaInboundWorking,
          warehouseAvailable: inventoryLevels[0].warehouseAvailable,
          fbaLastSync: inventoryLevels[0].fbaLastSync,
        })
      }
    }

    // Create a map for quick lookup
    const inventoryMap = new Map(inventoryLevels.map((il: any) => [il.masterSku, il]))

    // Group products by physicalProductGroupId to combine warehouse inventory
    const linkedGroups = new Map<string, any[]>()
    const unlinkedProducts: any[] = []
    
    for (const product of childProducts) {
      if (product.physicalProductGroupId) {
        const groupId = product.physicalProductGroupId
        if (!linkedGroups.has(groupId)) {
          linkedGroups.set(groupId, [])
        }
        linkedGroups.get(groupId)!.push(product)
      } else {
        unlinkedProducts.push(product)
      }
    }

    // Calculate combined warehouse inventory for each linked group
    const combinedWarehouseInventory = new Map<string, number>()
    for (const [groupId, linkedProducts] of linkedGroups.entries()) {
      let totalWarehouse = 0
      for (const product of linkedProducts) {
        const level = inventoryMap.get(product.sku)
        if (level) {
          totalWarehouse += Number(level.warehouseAvailable || 0)
        }
      }
      combinedWarehouseInventory.set(groupId, totalWarehouse)
    }

    // Transform to inventory format
    let itemCount = 0
    const inventory = childProducts.map((product: any) => {
      itemCount++
      // Get inventory level from map or create default
      const existingLevel: any = inventoryMap.get(product.sku)

      // For linked products, use combined warehouse inventory
      let warehouseAvailable = 0
      if (product.physicalProductGroupId) {
        warehouseAvailable = combinedWarehouseInventory.get(product.physicalProductGroupId) || 0
      } else {
        warehouseAvailable = existingLevel ? Number(existingLevel.warehouseAvailable) || 0 : 0
      }

      const level = existingLevel ? {
        ...existingLevel,
        // Ensure all fields are present and converted to numbers
        fbaAvailable: Number(existingLevel.fbaAvailable) || 0,
        fbaInboundWorking: Number(existingLevel.fbaInboundWorking) || 0,
        fbaInboundShipped: Number(existingLevel.fbaInboundShipped) || 0,
        fbaInboundReceiving: Number(existingLevel.fbaInboundReceiving) || 0,
        fbaReserved: Number(existingLevel.fbaReserved) || 0,
        fbaUnfulfillable: Number(existingLevel.fbaUnfulfillable) || 0,
        warehouseAvailable: warehouseAvailable, // Use combined for linked products
        warehouseReserved: Number(existingLevel.warehouseReserved) || 0,
      } : {
        masterSku: product.sku,
        fbaAvailable: 0,
        fbaInboundWorking: 0,
        fbaInboundShipped: 0,
        fbaInboundReceiving: 0,
        fbaReserved: 0,
        fbaUnfulfillable: 0,
        warehouseAvailable: warehouseAvailable, // Use combined for linked products
        warehouseReserved: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Clean up product object to avoid circular references
      const { inventoryLevels, _count, ...productWithoutLevels } = product

      // Extract velocity before cleaning - check if it exists
      let velocity = {
        velocity7d: 0,
        velocity30d: 0,
        velocity90d: 0,
      }

      if (product.salesVelocity) {
        // Prisma Decimal fields come back as Decimal objects or strings, convert to numbers
        const v7d = product.salesVelocity.velocity7d
        const v30d = product.salesVelocity.velocity30d
        const v90d = product.salesVelocity.velocity90d
        
        velocity = {
          velocity7d: v7d ? Number(v7d.toString()) : 0,
          velocity30d: v30d ? Number(v30d.toString()) : 0,
          velocity90d: v90d ? Number(v90d.toString()) : 0,
        }
        
        // If velocity30d is 0 but velocity90d has data, use velocity90d as fallback
        if (velocity.velocity30d === 0 && velocity.velocity90d > 0) {
          velocity.velocity30d = velocity.velocity90d
        }
      }

      // Log first few to debug
      if (itemCount <= 5) {
        console.log(`[Inventory API] Processing ${product.sku}:`, {
          hasSalesVelocity: !!product.salesVelocity,
          velocity30d: velocity.velocity30d,
          rawSalesVelocity: product.salesVelocity ? {
            velocity7d: product.salesVelocity.velocity7d,
            velocity30d: product.salesVelocity.velocity30d,
            velocity90d: product.salesVelocity.velocity90d,
          } : null,
        })
      }

      return {
        ...level,
        product: {
          ...productWithoutLevels,
          salesVelocity: velocity,
        },
      }
    })

    // Log first few with velocity for debugging (after building the array)
    const itemsWithVelocity = inventory.filter((item: any) => 
      item.product?.salesVelocity?.velocity30d > 0
    )
    console.log(`[Inventory API] Total items: ${inventory.length}`)
    console.log(`[Inventory API] Items with velocity > 0: ${itemsWithVelocity.length}`)
    
    if (itemsWithVelocity.length > 0) {
      itemsWithVelocity.slice(0, 5).forEach((item: any) => {
        console.log(`  ${item.masterSku}: velocity30d=${item.product.salesVelocity.velocity30d}`)
      })
    } else {
      // Log first few items to see what we have
      console.log(`[Inventory API] First 3 items structure:`)
      inventory.slice(0, 3).forEach((item: any) => {
        console.log(`  ${item.masterSku}:`, {
          hasProduct: !!item.product,
          hasSalesVelocity: !!item.product?.salesVelocity,
          salesVelocity: item.product?.salesVelocity,
        })
      })
    }

    return NextResponse.json(inventory)
  } catch (error: any) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch inventory' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { masterSku, fbaAvailable, warehouseAvailable, fbaInboundWorking, fbaInboundShipped, fbaInboundReceiving } = body

    if (!masterSku) {
      return NextResponse.json(
        { error: 'Master SKU is required' },
        { status: 400 }
      )
    }

    const inventory = await prisma.inventoryLevel.upsert({
      where: { masterSku },
      update: {
        fbaAvailable: fbaAvailable !== undefined ? fbaAvailable : undefined,
        warehouseAvailable: warehouseAvailable !== undefined ? warehouseAvailable : undefined,
        fbaInboundWorking: fbaInboundWorking !== undefined ? fbaInboundWorking : undefined,
        fbaInboundShipped: fbaInboundShipped !== undefined ? fbaInboundShipped : undefined,
        fbaInboundReceiving: fbaInboundReceiving !== undefined ? fbaInboundReceiving : undefined,
        updatedAt: new Date(),
      },
      create: {
        masterSku,
        fbaAvailable: fbaAvailable || 0,
        warehouseAvailable: warehouseAvailable || 0,
        fbaInboundWorking: fbaInboundWorking || 0,
        fbaInboundShipped: fbaInboundShipped || 0,
        fbaInboundReceiving: fbaInboundReceiving || 0,
      },
    })

    return NextResponse.json(inventory)
  } catch (error: any) {
    console.error('Error updating inventory:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update inventory' },
      { status: 500 }
    )
  }
}
