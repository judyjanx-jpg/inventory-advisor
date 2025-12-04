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
      weightOz,
      lengthIn,
      widthIn,
      heightIn,
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
      isHidden,
      hidden,
      labelType,
      unitsPerCase,
    } = body

    // Build update data - only include fields that are provided
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    }

    if (title !== undefined) updateData.title = title
    if (asin !== undefined) updateData.asin = asin || null
    if (fnsku !== undefined) updateData.fnsku = fnsku || null
    if (upc !== undefined) updateData.upc = upc || null
    if (brand !== undefined) updateData.brand = brand
    if (category !== undefined) updateData.category = category || null
    if (cost !== undefined) updateData.cost = cost ? parseFloat(cost) : undefined
    if (price !== undefined) updateData.price = price ? parseFloat(price) : undefined
    if (weight !== undefined) updateData.weightOz = weight ? parseFloat(weight) : undefined
    if (weightOz !== undefined) updateData.weightOz = weightOz ? parseFloat(weightOz) : undefined
    if (lengthIn !== undefined) updateData.lengthIn = lengthIn ? parseFloat(lengthIn) : undefined
    if (widthIn !== undefined) updateData.widthIn = widthIn ? parseFloat(widthIn) : undefined
    if (heightIn !== undefined) updateData.heightIn = heightIn ? parseFloat(heightIn) : undefined
    if (dimensions !== undefined) updateData.dimensions = dimensions || null
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null
    if (status !== undefined) updateData.status = status
    if (supplierId !== undefined) updateData.supplierId = supplierId || null
    if (minStockLevel !== undefined) updateData.minStockLevel = minStockLevel ? parseInt(minStockLevel) : undefined
    if (reorderPoint !== undefined) updateData.reorderPoint = reorderPoint ? parseInt(reorderPoint) : undefined
    if (reorderQty !== undefined) updateData.reorderQty = reorderQty ? parseInt(reorderQty) : undefined
    if (packSize !== undefined) updateData.packSize = packSize ? parseInt(packSize) : undefined
    if (caseQty !== undefined) updateData.caseQty = caseQty ? parseInt(caseQty) : undefined
    if (moq !== undefined) updateData.moq = moq ? parseInt(moq) : undefined
    if (notes !== undefined) updateData.notes = notes || null
    if (isHidden !== undefined) updateData.isHidden = isHidden
    if (hidden !== undefined) updateData.isHidden = hidden // Support both 'hidden' and 'isHidden'
    if (labelType !== undefined) updateData.labelType = labelType || 'fnsku_only'
    if (unitsPerCase !== undefined) updateData.unitsPerCase = unitsPerCase ? parseInt(unitsPerCase) : undefined

    const product = await prisma.product.update({
      where: { sku: params.sku },
      data: updateData,
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

