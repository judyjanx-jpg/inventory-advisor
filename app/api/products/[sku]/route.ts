import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: { sku: string } }
) {
  try {
    const product = await prisma.product.findUnique({
      where: { sku: params.sku },
      include: {
        supplier: true,
        inventoryLevels: true,
        salesVelocity: true,
        skuMappings: true,
      },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(product)
  } catch (error: any) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { sku: string } }
) {
  try {
    const body = await request.json()
    const {
      title,
      asin,
      fnsku,
      upc,
      brand,
      category,
      cost,
      price,
      weight,
      dimensions,
      imageUrl,
      status,
      supplierId,
      minStockLevel,
      reorderPoint,
      reorderQty,
      packSize,
      caseQty,
      moq,
      notes,
    } = body

    const product = await prisma.product.update({
      where: { sku: params.sku },
      data: {
        title,
        asin,
        fnsku,
        upc,
        brand,
        category,
        cost: cost ? parseFloat(cost) : undefined,
        price: price ? parseFloat(price) : undefined,
        weight: weight ? parseFloat(weight) : undefined,
        dimensions,
        imageUrl,
        status,
        supplierId: supplierId || null,
        minStockLevel: minStockLevel ? parseInt(minStockLevel) : undefined,
        reorderPoint: reorderPoint ? parseInt(reorderPoint) : undefined,
        reorderQty: reorderQty ? parseInt(reorderQty) : undefined,
        packSize: packSize ? parseInt(packSize) : undefined,
        caseQty: caseQty ? parseInt(caseQty) : undefined,
        moq: moq ? parseInt(moq) : undefined,
        notes,
        updatedAt: new Date(),
      },
      include: {
        supplier: true,
        inventoryLevels: true,
        salesVelocity: true,
        skuMappings: true,
      },
    })

    return NextResponse.json(product)
  } catch (error: any) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update product' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { sku: string } }
) {
  try {
    // Delete related records first
    const product = await prisma.product.findUnique({
      where: { sku: params.sku },
      select: { id: true },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Delete related data
    await prisma.inventoryLevel.deleteMany({
      where: { productId: product.id },
    })
    
    await prisma.salesVelocity.deleteMany({
      where: { productId: product.id },
    })
    
    await prisma.skuMapping.deleteMany({
      where: { masterSku: params.sku },
    })

    // Delete the product
    await prisma.product.delete({
      where: { sku: params.sku },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete product' },
      { status: 500 }
    )
  }
}

