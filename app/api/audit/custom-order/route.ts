import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { warehouseId, order } = body // order: [{sku, sortPosition}]

    if (!warehouseId || !Array.isArray(order)) {
      return NextResponse.json(
        { error: 'warehouseId and order array are required' },
        { status: 400 }
      )
    }

    // Delete existing custom order for this warehouse
    await prisma.auditCustomOrder.deleteMany({
      where: { warehouseId: parseInt(warehouseId) },
    })

    // Create new custom order entries
    const entries = order.map((item: any, index: number) => ({
      warehouseId: parseInt(warehouseId),
      sku: item.sku,
      sortPosition: item.sortPosition ?? index,
    }))

    await prisma.auditCustomOrder.createMany({
      data: entries,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error saving custom order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save custom order' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const warehouseId = searchParams.get('warehouseId')

    if (!warehouseId) {
      return NextResponse.json(
        { error: 'warehouseId is required' },
        { status: 400 }
      )
    }

    const customOrder = await prisma.auditCustomOrder.findMany({
      where: { warehouseId: parseInt(warehouseId) },
      orderBy: { sortPosition: 'asc' },
      select: {
        sku: true,
        sortPosition: true,
      },
    })

    return NextResponse.json({ order: customOrder })
  } catch (error: any) {
    console.error('Error fetching custom order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch custom order' },
      { status: 500 }
    )
  }
}

