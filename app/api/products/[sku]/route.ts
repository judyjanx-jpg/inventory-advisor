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
      asin: product.asin,
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

/**
 * PUT /api/products/[sku]
 * Update product by SKU
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { sku: string } }
) {
  try {
    const sku = params.sku
    const body = await request.json()

    // Verify product exists
    const existingProduct = await prisma.product.findUnique({
      where: { sku },
      select: { sku: true },
    })

    if (!existingProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Build update data
    const updateData: any = {}
    
    // Handle labelType update
    if (body.labelType !== undefined) {
      updateData.labelType = body.labelType
    }

    // Handle other fields that might be updated
    if (body.fnsku !== undefined) updateData.fnsku = body.fnsku
    if (body.displayName !== undefined) updateData.displayName = body.displayName
    if (body.cost !== undefined) updateData.cost = body.cost
    if (body.price !== undefined) updateData.price = body.price
    if (body.warehouseLocation !== undefined) updateData.warehouseLocation = body.warehouseLocation
    if (body.prepOwner !== undefined) updateData.prepOwner = body.prepOwner
    if (body.labelOwner !== undefined) updateData.labelOwner = body.labelOwner
    if (body.transparencyEnabled !== undefined) updateData.transparencyEnabled = body.transparencyEnabled

    // Update the product
    const product = await prisma.product.update({
      where: { sku },
      data: updateData,
    })

    // Return updated fields for confirmation
    const updatedFields: any = { sku: product.sku }
    if (updateData.labelType !== undefined) updatedFields.labelType = product.labelType
    if (updateData.prepOwner !== undefined) updatedFields.prepOwner = product.prepOwner
    if (updateData.labelOwner !== undefined) updatedFields.labelOwner = product.labelOwner
    if (updateData.transparencyEnabled !== undefined) updatedFields.transparencyEnabled = product.transparencyEnabled

    return NextResponse.json({ success: true, product: updatedFields })
  } catch (error: any) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update product' },
      { status: 500 }
    )
  }
}