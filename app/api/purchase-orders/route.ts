import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdDate: 'desc',
      },
    })

    return NextResponse.json(purchaseOrders)
  } catch (error) {
    console.error('Error fetching purchase orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch purchase orders' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate that all SKUs exist before creating the purchase order
    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: 'Purchase order must have at least one item' },
        { status: 400 }
      )
    }

    const skus = body.items.map((item: any) => item.masterSku).filter(Boolean)
    if (skus.length === 0) {
      return NextResponse.json(
        { error: 'All items must have a valid SKU' },
        { status: 400 }
      )
    }

    // Check if all SKUs exist
    const existingProducts = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { sku: true },
    })
    const existingSkus = new Set(existingProducts.map((p: any) => p.sku))
    const missingSkus = skus.filter((sku: string) => !existingSkus.has(sku))

    if (missingSkus.length > 0) {
      return NextResponse.json(
        { 
          error: `The following SKUs do not exist in the system: ${missingSkus.join(', ')}. Please add these products first.`,
          missingSkus 
        },
        { status: 400 }
      )
    }
    
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber: body.poNumber,
        supplierId: body.supplierId,
        status: body.status || 'draft',
        createdDate: new Date(),
        orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
        expectedArrivalDate: body.expectedArrivalDate ? new Date(body.expectedArrivalDate) : null,
        subtotal: body.subtotal,
        shippingCost: body.shippingCost || 0,
        tax: body.tax || 0,
        total: body.total,
        notes: body.notes,
        items: {
          create: body.items.map((item: any) => ({
            masterSku: item.masterSku,
            quantityOrdered: item.quantityOrdered,
            quantityReceived: 0,
            quantityDamaged: 0,
            unitCost: item.unitCost,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    })

    return NextResponse.json(purchaseOrder, { status: 201 })
  } catch (error: any) {
    console.error('Error creating purchase order:', error)
    
    // Provide more specific error messages
    if (error.code === 'P2003') {
      return NextResponse.json(
        { 
          error: 'One or more SKUs do not exist in the system. Please ensure all products are added before creating a purchase order.',
          details: error.meta
        },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create purchase order' },
      { status: 500 }
    )
  }
}
