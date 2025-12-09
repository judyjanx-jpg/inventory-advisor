import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { sku: string } }
) {
  try {
    const sku = decodeURIComponent(params.sku)
    const searchParams = request.nextUrl.searchParams
    const warehouseId = searchParams.get('warehouseId')

    // Try to find by SKU, FNSKU, UPC, or ASIN
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { sku },
          { fnsku: sku },
          { upc: sku },
          { asin: sku },
        ],
      },
      select: {
        sku: true,
        title: true,
        parentSku: true,
        fnsku: true,
        upc: true,
        asin: true,
      },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'SKU not found' },
        { status: 404 }
      )
    }

    // Get current warehouse quantity
    let currentQty = 0
    if (warehouseId) {
      const warehouseInventory = await prisma.warehouseInventory.findUnique({
        where: {
          warehouseId_masterSku: {
            warehouseId: parseInt(warehouseId),
            masterSku: product.sku,
          },
        },
        select: { available: true },
      })
      currentQty = warehouseInventory?.available || 0
    } else {
      // Get from aggregated inventory level
      const inventoryLevel = await prisma.inventoryLevel.findUnique({
        where: { masterSku: product.sku },
        select: { warehouseAvailable: true },
      })
      currentQty = inventoryLevel?.warehouseAvailable || 0
    }

    return NextResponse.json({
      sku: product.sku,
      title: product.title,
      parentSku: product.parentSku,
      currentQty,
      identifiers: {
        fnsku: product.fnsku,
        upc: product.upc,
        asin: product.asin,
      },
    })
  } catch (error: any) {
    console.error('Error looking up SKU:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to lookup SKU' },
      { status: 500 }
    )
  }
}

