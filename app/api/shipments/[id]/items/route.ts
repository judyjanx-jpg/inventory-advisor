import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/shipments/:id/items
 * Add item to shipment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid shipment ID' }, { status: 400 })
    }

    const body = await request.json()
    const { sku, fnsku, productName, requestedQty, adjustedQty } = body

    // Verify shipment exists and is editable
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: { status: true },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (!['draft', 'ready'].includes(shipment.status)) {
      return NextResponse.json(
        { error: 'Cannot add items to shipment in current status' },
        { status: 400 }
      )
    }

    // Get product info
    const product = await prisma.product.findUnique({
      where: { sku },
      select: {
        sku: true,
        title: true,
        fnsku: true,
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const item = await prisma.shipmentItem.create({
      data: {
        shipmentId: id,
        masterSku: sku,
        fnsku: fnsku || product.fnsku || null,
        productName: productName || product.title,
        requestedQty: requestedQty || 0,
        adjustedQty: adjustedQty || requestedQty || 0,
      },
      include: {
        product: {
          select: {
            sku: true,
            title: true,
            fnsku: true,
          },
        },
      },
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (error: any) {
    console.error('Error adding item to shipment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add item' },
      { status: 500 }
    )
  }
}

