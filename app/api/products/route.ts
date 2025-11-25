import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeVariations = searchParams.get('includeVariations') !== 'false'
    const flat = searchParams.get('flat') === 'true'

    if (flat) {
      // Return all products flat (no grouping)
      const products = await prisma.product.findMany({
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
      },
      include: {
        supplier: true,
        inventoryLevels: true,
        skuMappings: true,
        salesVelocity: true,
        // Include child variations
        variations: includeVariations ? {
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

