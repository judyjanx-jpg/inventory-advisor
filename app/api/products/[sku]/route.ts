import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { sku: string } }
) {
  try {
    const sku = params.sku

    // Get product details
    const product = await prisma.product.findUnique({
      where: { sku },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            leadTimeDays: true,
          },
        },
        inventoryLevel: true,
        salesVelocity: true,
      },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Calculate recommended quantity based on velocity and lead time
    let recommendedQty = 100 // Default
    
    if (product.salesVelocity && product.supplier?.leadTimeDays) {
      const velocity = Number(product.salesVelocity.velocity30d || 0)
      const leadTime = product.supplier.leadTimeDays
      // Order enough for lead time + 45 days buffer
      recommendedQty = Math.ceil(velocity * (leadTime + 45))
    }

    // Check if there's already an open PO for this SKU
    const openPOItem = await prisma.purchaseOrderItem.findFirst({
      where: {
        masterSku: sku,
        purchaseOrder: {
          status: { notIn: ['received', 'cancelled'] },
        },
      },
      include: {
        purchaseOrder: {
          select: {
            poNumber: true,
            status: true,
          },
        },
      },
    })

    return NextResponse.json({
      sku: product.sku,
      title: product.title,
      cost: Number(product.cost || 0),
      supplierId: product.supplierId,
      supplier: product.supplier,
      inventoryLevel: product.inventoryLevel,
      velocity: product.salesVelocity ? Number(product.salesVelocity.velocity30d || 0) : 0,
      recommendedQty,
      hasOpenPO: !!openPOItem,
      openPO: openPOItem?.purchaseOrder || null,
    })
  } catch (error: any) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch product' },
      { status: 500 }
    )
  }
}
