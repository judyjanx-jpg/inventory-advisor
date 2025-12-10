import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const warehouseId = searchParams.get('warehouseId')
    const sort = searchParams.get('sort') || 'asc'
    const grouped = searchParams.get('grouped') === 'true'

    if (!warehouseId) {
      return NextResponse.json(
        { error: 'warehouseId is required' },
        { status: 400 }
      )
    }

    // Get warehouse inventory
    const warehouseInventory = await prisma.warehouseInventory.findMany({
      where: { warehouseId: parseInt(warehouseId) },
      include: {
        product: {
          select: {
            sku: true,
            title: true,
            parentSku: true,
            isParent: true,
            variationType: true,
            variationValue: true,
          },
        },
      },
    })

    if (grouped) {
      // Group by parent SKU
      const groupedMap = new Map<string, any[]>()
      
      for (const inv of warehouseInventory) {
        const parentSku = inv.product.parentSku || inv.product.sku
        if (!groupedMap.has(parentSku)) {
          groupedMap.set(parentSku, [])
        }
        groupedMap.get(parentSku)!.push({
          sku: inv.product.sku,
          title: inv.product.title,
          parentSku: inv.product.parentSku,
          variationType: inv.product.variationType,
          variationValue: inv.product.variationValue,
          available: inv.available,
        })
      }

      const grouped = Array.from(groupedMap.entries()).map(([parentSku, items]) => ({
        parentSku,
        items: items.sort((a, b) => a.sku.localeCompare(b.sku)),
      }))

      return NextResponse.json({ grouped })
    }

    // Get custom order if sort is 'custom'
    let customOrder: Map<string, number> | null = null
    if (sort === 'custom') {
      const customOrders = await prisma.auditCustomOrder.findMany({
        where: { warehouseId: parseInt(warehouseId) },
        select: { sku: true, sortPosition: true },
      })
      customOrder = new Map(customOrders.map((co: { sku: string; sortPosition: number }) => [co.sku, co.sortPosition]))
    }

    // Sort SKUs
    type InventoryItem = { product: { sku: string; title: string; parentSku: string | null }; available: number }
    let sortedSkus = warehouseInventory.map((inv: InventoryItem) => ({
      sku: inv.product.sku,
      title: inv.product.title,
      parentSku: inv.product.parentSku,
      available: inv.available,
    }))

    type SkuItem = { sku: string; title: string; parentSku: string | null; available: number }
    if (sort === 'custom' && customOrder) {
      sortedSkus.sort((a: SkuItem, b: SkuItem) => {
        const posA = customOrder!.get(a.sku) ?? 999999
        const posB = customOrder!.get(b.sku) ?? 999999
        return posA - posB
      })
    } else if (sort === 'asc') {
      sortedSkus.sort((a: SkuItem, b: SkuItem) => a.sku.localeCompare(b.sku))
    } else if (sort === 'desc') {
      sortedSkus.sort((a: SkuItem, b: SkuItem) => b.sku.localeCompare(a.sku))
    }

    return NextResponse.json({ skus: sortedSkus })
  } catch (error: any) {
    console.error('Error fetching SKUs:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch SKUs' },
      { status: 500 }
    )
  }
}

