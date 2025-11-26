import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
      return NextResponse.json(products)
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

    return NextResponse.json(parentAndStandaloneProducts)
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
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { sku, displayName, isHidden, cost, price, supplierId, supplierSku } = body
    
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

