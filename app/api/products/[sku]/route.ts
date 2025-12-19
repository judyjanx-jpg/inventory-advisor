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
      // Identifiers
      title,
      displayName,
      asin,
      fnsku,
      upc,
      brand,
      category,
      // Pricing
      cost,
      price,
      mapPrice,
      msrp,
      // Additional Costs
      packagingCost,
      tariffPercent,
      // Amazon Fees
      fbaFeeEstimate,
      referralFeePercent,
      refundPercent,
      adsPercent,
      // Supplier
      supplierId,
      supplierSku,
      // Physical
      weight,
      weightOz,
      lengthIn,
      widthIn,
      heightIn,
      unitsPerCase,
      // Labeling & Prep
      labelType,
      transparencyEnabled,
      prepType,
      labelingRequired,
      prepOwner,
      labelOwner,
      warehouseLocation,
      // Lifecycle
      status,
      launchDate,
      recreatedFromSku,
      discontinuedAt,
      // Support & Warranty
      isWarrantied,
      careInstructions,
      sizingGuide,
      // Other
      physicalProductGroupId,
      notes,
      isHidden,
      hidden,
    } = body

    // Build update data - only include fields that are provided
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    }

    // Identifiers
    if (title !== undefined) updateData.title = title
    if (displayName !== undefined) updateData.displayName = displayName || null
    if (asin !== undefined) updateData.asin = asin || null
    if (fnsku !== undefined) updateData.fnsku = fnsku || null
    if (upc !== undefined) updateData.upc = upc || null
    if (brand !== undefined) updateData.brand = brand
    if (category !== undefined) updateData.category = category || null
    
    // Pricing
    if (cost !== undefined) updateData.cost = cost !== null && cost !== '' ? parseFloat(cost) : 0
    if (price !== undefined) updateData.price = price !== null && price !== '' ? parseFloat(price) : 0
    if (mapPrice !== undefined) updateData.mapPrice = mapPrice !== null && mapPrice !== '' ? parseFloat(mapPrice) : null
    if (msrp !== undefined) updateData.msrp = msrp !== null && msrp !== '' ? parseFloat(msrp) : null
    
    // Additional Costs
    if (packagingCost !== undefined) updateData.packagingCost = packagingCost !== null && packagingCost !== '' ? parseFloat(packagingCost) : null
    if (tariffPercent !== undefined) updateData.tariffPercent = tariffPercent !== null && tariffPercent !== '' ? parseFloat(tariffPercent) : null
    
    // Amazon Fees
    if (fbaFeeEstimate !== undefined) updateData.fbaFeeEstimate = fbaFeeEstimate !== null && fbaFeeEstimate !== '' ? parseFloat(fbaFeeEstimate) : null
    if (referralFeePercent !== undefined) updateData.referralFeePercent = referralFeePercent !== null && referralFeePercent !== '' ? parseFloat(referralFeePercent) : null
    if (refundPercent !== undefined) updateData.refundPercent = refundPercent !== null && refundPercent !== '' ? parseFloat(refundPercent) : null
    if (adsPercent !== undefined) updateData.adsPercent = adsPercent !== null && adsPercent !== '' ? parseFloat(adsPercent) : null
    
    // Supplier
    if (supplierId !== undefined) updateData.supplierId = supplierId || null
    if (supplierSku !== undefined) updateData.supplierSku = supplierSku || null
    
    // Physical
    if (weight !== undefined) updateData.weightOz = weight !== null && weight !== '' ? parseFloat(weight) : null
    if (weightOz !== undefined) updateData.weightOz = weightOz !== null && weightOz !== '' ? parseFloat(weightOz) : null
    if (lengthIn !== undefined) updateData.lengthIn = lengthIn !== null && lengthIn !== '' ? parseFloat(lengthIn) : null
    if (widthIn !== undefined) updateData.widthIn = widthIn !== null && widthIn !== '' ? parseFloat(widthIn) : null
    if (heightIn !== undefined) updateData.heightIn = heightIn !== null && heightIn !== '' ? parseFloat(heightIn) : null
    if (unitsPerCase !== undefined) updateData.unitsPerCase = unitsPerCase !== null && unitsPerCase !== '' ? parseInt(unitsPerCase) : null
    
    // Labeling & Prep
    if (labelType !== undefined) updateData.labelType = labelType || 'fnsku_only'
    if (transparencyEnabled !== undefined) updateData.transparencyEnabled = transparencyEnabled
    if (prepType !== undefined) updateData.prepType = prepType || 'none'
    if (labelingRequired !== undefined) updateData.labelingRequired = labelingRequired
    if (prepOwner !== undefined) updateData.prepOwner = prepOwner || 'NONE'
    if (labelOwner !== undefined) updateData.labelOwner = labelOwner || 'NONE'
    if (warehouseLocation !== undefined) updateData.warehouseLocation = warehouseLocation || null
    
    // Lifecycle
    if (status !== undefined) updateData.status = status || 'active'
    if (launchDate !== undefined) updateData.launchDate = launchDate ? new Date(launchDate) : null
    if (recreatedFromSku !== undefined) updateData.recreatedFromSku = recreatedFromSku || null
    if (discontinuedAt !== undefined) updateData.discontinuedAt = discontinuedAt ? new Date(discontinuedAt) : null
    
    // Support & Warranty
    if (isWarrantied !== undefined) updateData.isWarrantied = isWarrantied
    if (careInstructions !== undefined) updateData.careInstructions = careInstructions || null
    if (sizingGuide !== undefined) updateData.sizingGuide = sizingGuide || null
    
    // Other
    if (physicalProductGroupId !== undefined) updateData.physicalProductGroupId = physicalProductGroupId || null
    if (notes !== undefined) updateData.notes = notes || null
    if (isHidden !== undefined) updateData.isHidden = isHidden
    if (hidden !== undefined) updateData.isHidden = hidden // Support both 'hidden' and 'isHidden'

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
    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { sku: params.sku },
      select: { sku: true },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Delete related data (these tables use masterSku as the key)
    await prisma.inventoryLevel.deleteMany({
      where: { masterSku: params.sku },
    })

    await prisma.salesVelocity.deleteMany({
      where: { masterSku: params.sku },
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

