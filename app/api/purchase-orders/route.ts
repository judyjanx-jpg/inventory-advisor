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
    
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber: body.poNumber,
        supplierId: body.supplierId,
        status: body.status || 'draft',
        createdDate: new Date(),
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
  } catch (error) {
    console.error('Error creating purchase order:', error)
    return NextResponse.json(
      { error: 'Failed to create purchase order' },
      { status: 500 }
    )
  }
}
