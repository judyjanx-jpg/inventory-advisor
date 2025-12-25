import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Get all pending audit items
export async function GET(request: NextRequest) {
  try {
    let pendingItems: any[] = []
    
    try {
      pendingItems = await prisma.pendingAuditItem.findMany({
        where: {
          auditedAt: null, // Only items not yet audited
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
    } catch (dbError: any) {
      // Table might not exist yet - return empty
      console.log('PendingAuditItem table may not exist yet:', dbError.message)
      return NextResponse.json({
        items: [],
        grouped: [],
        count: 0,
      })
    }

    // Get product details for each SKU
    const skus = [...new Set(pendingItems.map(item => item.masterSku))]
    const products = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: {
        sku: true,
        title: true,
        parentSku: true,
      },
    })

    const productMap = new Map(products.map(p => [p.sku, p]))

    // Get current inventory levels
    const inventoryLevels = await prisma.inventoryLevel.findMany({
      where: { masterSku: { in: skus } },
      select: {
        masterSku: true,
        warehouseAvailable: true,
      },
    })
    const inventoryMap = new Map(inventoryLevels.map(i => [i.masterSku, i.warehouseAvailable]))

    // Enrich with product details
    const enrichedItems = pendingItems.map(item => ({
      ...item,
      product: productMap.get(item.masterSku) || { title: 'Unknown Product' },
      currentWarehouseQty: inventoryMap.get(item.masterSku) || 0,
    }))

    // Group by SKU to show total quantity received if multiple POs
    const groupedBySku = skus.map(sku => {
      const items = enrichedItems.filter(i => i.masterSku === sku)
      const totalReceived = items.reduce((sum, i) => sum + i.quantityReceived, 0)
      const poNumbers = [...new Set(items.filter(i => i.poNumber).map(i => i.poNumber))]
      
      return {
        masterSku: sku,
        product: productMap.get(sku) || { title: 'Unknown Product' },
        currentWarehouseQty: inventoryMap.get(sku) || 0,
        totalReceived,
        poNumbers,
        items,
        oldestDate: items.length > 0 ? items[items.length - 1].createdAt : null,
      }
    })

    return NextResponse.json({
      items: enrichedItems,
      grouped: groupedBySku,
      count: skus.length,
    })
  } catch (error: any) {
    console.error('Error fetching pending audit items:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pending audit items' },
      { status: 500 }
    )
  }
}

// POST - Add items to pending audit (manual or from PO)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items } = body // Array of { masterSku, sourceType, sourceId, poNumber, quantityReceived }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      )
    }

    const created = await prisma.$transaction(
      items.map(item => 
        prisma.pendingAuditItem.upsert({
          where: {
            masterSku_sourceType_sourceId: {
              masterSku: item.masterSku,
              sourceType: item.sourceType || 'po_received',
              sourceId: item.sourceId || 0,
            },
          },
          update: {
            quantityReceived: {
              increment: item.quantityReceived,
            },
            poNumber: item.poNumber || undefined,
          },
          create: {
            masterSku: item.masterSku,
            sourceType: item.sourceType || 'po_received',
            sourceId: item.sourceId || 0,
            poNumber: item.poNumber || null,
            quantityReceived: item.quantityReceived,
          },
        })
      )
    )

    return NextResponse.json({
      success: true,
      count: created.length,
    })
  } catch (error: any) {
    console.error('Error adding pending audit items:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add pending audit items' },
      { status: 500 }
    )
  }
}

// DELETE - Mark items as audited (clear from pending)
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { skus, itemIds } = body // Either SKUs to clear or specific item IDs

    if (skus && Array.isArray(skus) && skus.length > 0) {
      // Mark all items for these SKUs as audited
      await prisma.pendingAuditItem.updateMany({
        where: {
          masterSku: { in: skus },
          auditedAt: null,
        },
        data: {
          auditedAt: new Date(),
        },
      })
    } else if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
      // Mark specific items as audited
      await prisma.pendingAuditItem.updateMany({
        where: {
          id: { in: itemIds },
          auditedAt: null,
        },
        data: {
          auditedAt: new Date(),
        },
      })
    } else {
      return NextResponse.json(
        { error: 'Either skus or itemIds array is required' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error clearing pending audit items:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to clear pending audit items' },
      { status: 500 }
    )
  }
}

