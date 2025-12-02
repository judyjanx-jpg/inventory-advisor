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
        include: {
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

    // Fetch parent products and standalone products (products without a parent)
    const parentAndStandaloneProducts = await prisma.product.findMany({
      where: {
        parentSku: null, // No parent = either a parent product or standalone
        ...hiddenFilter,
      },
      include: {
        supplier: true,
        inventoryLevels: true,
        skuMappings: true,
        salesVelocity: true,
        // Include child variations
        variations: includeVariations ? {
          where: hiddenFilter,
          include: {
            supplier: true,
            inventoryLevels: true,
            skuMappings: true,
            salesVelocity: true,
          },
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
    const { sku, displayName, isHidden, cost, price, supplierId, supplierSku, fnsku, upc, labelType, warehouseLocation } = body
    
    if (!sku) {
      return NextResponse.json(
        { error: 'SKU is required' },
        { status: 400 }
      )
    }

    const updateData: Record<string, any> = {}
    
    // Only update fields that are explicitly provided
    if (displayName !== undefined) {
      updateData.displayName = displayName || null // Empty string becomes null
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
    if (supplierId !== undefined) {
      updateData.supplierId = supplierId || null // null to unset
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

    const product = await prisma.product.update({
      where: { sku },
      data: updateData,
      include: {
        supplier: true,
      },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}

