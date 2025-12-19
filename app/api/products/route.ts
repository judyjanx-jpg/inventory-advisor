import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Transform product to flatten inventoryLevels array to single object
function transformProduct(product: any): any {
  const inventoryLevels = product.inventoryLevels?.[0] || null
  const transformed = {
    ...product,
    inventoryLevels: inventoryLevels ? {
      fbaAvailable: inventoryLevels.fbaAvailable || 0,
      warehouseAvailable: inventoryLevels.warehouseAvailable || 0,
      fbaInboundWorking: inventoryLevels.fbaInboundWorking || 0,
      fbaInboundShipped: inventoryLevels.fbaInboundShipped || 0,
      fbaReserved: inventoryLevels.fbaReserved || 0,
    } : null,
  }
  
  // Also transform variations if present
  if (product.variations) {
    transformed.variations = product.variations.map(transformProduct)
  }
  
  return transformed
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeVariations = searchParams.get('includeVariations') !== 'false'
    const flat = searchParams.get('flat') === 'true'
    const showHidden = searchParams.get('showHidden') === 'true'
    const hiddenOnly = searchParams.get('hiddenOnly') === 'true'

    // Build the visibility filter
    const hiddenFilter = hiddenOnly 
      ? { isHidden: true } 
      : (showHidden ? {} : { isHidden: false })

    if (flat) {
      // Return all products flat (no grouping)
      const products = await prisma.product.findMany({
        where: hiddenFilter,
        select: {
          sku: true,
          title: true,
          displayName: true,
          description: true,
          brand: true,
          category: true,
          isHidden: true,
          parentSku: true,
          isParent: true,
          variationType: true,
          variationValue: true,
          physicalProductGroupId: true,
          asin: true,
          fnsku: true,
          upc: true,
          cost: true,
          price: true,
          mapPrice: true,
          msrp: true,
          supplierId: true,
          supplierSku: true,
          labelType: true,
          transparencyEnabled: true,
          warehouseLocation: true,
          status: true,
          launchDate: true,
          recreatedFromSku: true,
          discontinuedAt: true,
          createdAt: true,
          // Listing data from Amazon
          imageUrl: true,
          images: true,
          bulletPoints: true,
          listingDescription: true,
          searchTerms: true,
          listingLastSync: true,
          // Warranty/Support
          isWarrantied: true,
          careInstructions: true,
          sizingGuide: true,
          // Relations
          supplier: true,
          inventoryLevels: true,
          skuMappings: true,
          salesVelocity: true,
        },
        orderBy: {
          sku: 'asc',
        },
      })
      return NextResponse.json(products.map(transformProduct))
    }

    // Common select fields for product data
    const productSelect = {
      sku: true,
      title: true,
      displayName: true,
      description: true,
      brand: true,
      category: true,
      isHidden: true,
      parentSku: true,
      isParent: true,
      variationType: true,
      variationValue: true,
      physicalProductGroupId: true,
      asin: true,
      fnsku: true,
      upc: true,
      cost: true,
      price: true,
      mapPrice: true,
      msrp: true,
      supplierId: true,
      supplierSku: true,
      labelType: true,
      transparencyEnabled: true,
      warehouseLocation: true,
      status: true,
      launchDate: true,
      recreatedFromSku: true,
      discontinuedAt: true,
      createdAt: true,
      // Listing data from Amazon
      imageUrl: true,
      images: true,
      bulletPoints: true,
      listingDescription: true,
      searchTerms: true,
      listingLastSync: true,
      // Warranty/Support
      isWarrantied: true,
      careInstructions: true,
      sizingGuide: true,
      // Relations
      supplier: true,
      inventoryLevels: true,
      skuMappings: true,
      salesVelocity: true,
    }

    // Fetch parent products and standalone products (products without a parent)
    const parentAndStandaloneProducts = await prisma.product.findMany({
      where: {
        parentSku: null, // No parent = either a parent product or standalone
        ...hiddenFilter,
      },
      select: {
        ...productSelect,
        // Include child variations
        variations: includeVariations ? {
          where: hiddenFilter,
          select: productSelect,
          orderBy: {
            variationValue: 'asc',
          },
        } : undefined,
      },
      orderBy: {
        sku: 'asc',
      },
    })

    return NextResponse.json(parentAndStandaloneProducts.map(transformProduct))
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Check if this is a bulk create request
    if (body.products && Array.isArray(body.products)) {
      // Bulk create
      const products = body.products
      const created = []
      const skipped = []

      for (const productData of products) {
        try {
          const product = await prisma.product.create({
            data: {
              sku: productData.sku,
              title: productData.title || productData.sku,
              brand: productData.brand || 'KISPER',
              category: productData.category,
              cost: productData.cost || 0,
              price: productData.price || 0,
              status: productData.status || 'active',
              inventoryLevels: {
                create: {
                  fbaAvailable: 0,
                  warehouseAvailable: 0,
                  fbaReserved: 0,
                  fbaUnfulfillable: 0,
                },
              },
              salesVelocity: {
                create: {
                  velocity7d: 0,
                  velocity30d: 0,
                  velocity90d: 0,
                },
              },
            },
          })
          created.push(product.sku)
        } catch (error: any) {
          if (error.code === 'P2002') {
            // Duplicate SKU
            skipped.push(productData.sku)
          } else {
            console.error(`Error creating product ${productData.sku}:`, error)
            skipped.push(productData.sku)
          }
        }
      }

      return NextResponse.json({
        success: true,
        created: created.length,
        skipped: skipped.length,
        createdSkus: created,
        skippedSkus: skipped,
      })
    }
    
    // Single product create
    const product = await prisma.product.create({
      data: {
        sku: body.sku,
        title: body.title,
        description: body.description,
        brand: body.brand || 'KISPER',
        category: body.category,
        cost: body.cost,
        price: body.price,
        supplierId: body.supplierId,
        supplierSku: body.supplierSku,
        status: body.status || 'active',
        // ... other fields
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error: any) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create product' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('PUT /api/products received:', JSON.stringify(body, null, 2))
    
    const { 
      sku, 
      displayName, 
      isHidden, 
      cost, 
      price, 
      mapPrice,
      msrp,
      // Additional costs
      packagingCost,
      tariffPercent,
      additionalCosts,
      // Amazon fee settings
      fbaFeeEstimate,
      referralFeePercent,
      refundPercent,
      adsPercent,
      // Supplier
      supplierId, 
      supplierSku, 
      fnsku, 
      upc, 
      labelType, 
      warehouseLocation, 
      physicalProductGroupId,
      isWarrantied,
      careInstructions,
      sizingGuide,
      // Status fields
      status,
      launchDate,
      recreatedFromSku,
      discontinuedAt,
      // Apply scope (this, all, supplier)
      applyScope,
    } = body
    
    console.log('Parsed fields:', { sku, packagingCost, applyScope })
    
    if (!sku) {
      return NextResponse.json(
        { error: 'SKU is required' },
        { status: 400 }
      )
    }

    // Get current product for supplier info if applying to supplier
    const currentProduct = await prisma.product.findUnique({
      where: { sku },
      select: { supplierId: true }
    })

    const updateData: Record<string, any> = {}
    
    // Fields that can be bulk applied (costs/fees)
    const bulkApplyFields: Record<string, any> = {}
    
    // Only update fields that are explicitly provided
    if (displayName !== undefined) {
      updateData.displayName = displayName || null
    }
    if (isHidden !== undefined) {
      updateData.isHidden = isHidden
    }
    if (cost !== undefined) {
      updateData.cost = cost
    }
    if (price !== undefined) {
      updateData.price = price
    }
    if (mapPrice !== undefined) {
      updateData.mapPrice = mapPrice || null
    }
    if (msrp !== undefined) {
      updateData.msrp = msrp || null
    }
    // Additional costs (can be bulk applied)
    if (packagingCost !== undefined) {
      const val = packagingCost || null
      updateData.packagingCost = val
      bulkApplyFields.packagingCost = val
    }
    if (tariffPercent !== undefined) {
      const val = tariffPercent || null
      updateData.tariffPercent = val
      bulkApplyFields.tariffPercent = val
    }
    if (additionalCosts !== undefined) {
      updateData.additionalCosts = additionalCosts || null
    }
    // Amazon fee settings (can be bulk applied)
    if (fbaFeeEstimate !== undefined) {
      const val = fbaFeeEstimate || null
      updateData.fbaFeeEstimate = val
      bulkApplyFields.fbaFeeEstimate = val
    }
    if (referralFeePercent !== undefined) {
      const val = referralFeePercent
      updateData.referralFeePercent = val
      bulkApplyFields.referralFeePercent = val
    }
    if (refundPercent !== undefined) {
      const val = refundPercent
      updateData.refundPercent = val
      bulkApplyFields.refundPercent = val
    }
    if (adsPercent !== undefined) {
      const val = adsPercent
      updateData.adsPercent = val
      bulkApplyFields.adsPercent = val
    }
    if (supplierId !== undefined) {
      updateData.supplierId = supplierId || null
    }
    if (supplierSku !== undefined) {
      updateData.supplierSku = supplierSku || null
    }
    if (fnsku !== undefined) {
      updateData.fnsku = fnsku || null
    }
    if (upc !== undefined) {
      updateData.upc = upc || null
    }
    if (labelType !== undefined) {
      updateData.labelType = labelType || 'fnsku_only'
    }
    if (warehouseLocation !== undefined) {
      updateData.warehouseLocation = warehouseLocation || null
    }
    if (physicalProductGroupId !== undefined) {
      updateData.physicalProductGroupId = physicalProductGroupId || null
    }
    if (isWarrantied !== undefined) {
      updateData.isWarrantied = isWarrantied
    }
    if (careInstructions !== undefined) {
      updateData.careInstructions = careInstructions || null
    }
    if (sizingGuide !== undefined) {
      updateData.sizingGuide = sizingGuide || null
    }
    // Status fields
    if (status !== undefined) {
      updateData.status = status
    }
    if (launchDate !== undefined) {
      updateData.launchDate = launchDate ? new Date(launchDate) : null
    }
    if (recreatedFromSku !== undefined) {
      updateData.recreatedFromSku = recreatedFromSku || null
    }
    if (discontinuedAt !== undefined) {
      updateData.discontinuedAt = discontinuedAt ? new Date(discontinuedAt) : null
    }

    // Handle bulk apply for cost/fee fields
    if (applyScope && applyScope !== 'this' && Object.keys(bulkApplyFields).length > 0) {
      const bulkWhere = applyScope === 'all' 
        ? {} 
        : applyScope === 'supplier' && currentProduct?.supplierId
          ? { supplierId: currentProduct.supplierId }
          : { sku } // fallback to single product
      
      console.log('Bulk applying fields:', bulkApplyFields, 'to scope:', applyScope, 'where:', bulkWhere)
      
      const result = await prisma.product.updateMany({
        where: bulkWhere,
        data: bulkApplyFields,
      })
      
      console.log('Bulk update result:', result)
      
      // For bulk updates, return success with count
      return NextResponse.json({ 
        success: true, 
        updatedCount: result.count,
        scope: applyScope,
        fields: Object.keys(bulkApplyFields)
      })
    }

    // Only run single product update if there are fields to update
    if (Object.keys(updateData).length > 0) {
      const product = await prisma.product.update({
        where: { sku },
        data: updateData,
        include: {
          supplier: true,
          skuMappings: true,
        },
      })
      return NextResponse.json(product)
    }

    return NextResponse.json({ success: true, message: 'No changes to apply' })
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}

