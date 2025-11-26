import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/shipments
 * List all shipments with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = {}
    if (status) {
      where.status = status
    }

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: {
          fromLocation: true,
          toLocation: true,
          items: {
            include: {
              product: {
                select: {
                  sku: true,
                  title: true,
                  fnsku: true,
                },
              },
            },
          },
          boxes: {
            include: {
              items: true,
            },
          },
          _count: {
            select: {
              items: true,
              boxes: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.shipment.count({ where }),
    ])

    return NextResponse.json({
      shipments,
      total,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('Error fetching shipments:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch shipments' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/shipments
 * Create a new shipment
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      fromLocationId,
      toLocationId,
      optimalPlacementEnabled = true,
      items = [],
    } = body

    // Generate internal ID
    const year = new Date().getFullYear()
    const count = await prisma.shipment.count({
      where: {
        createdAt: {
          gte: new Date(`${year}-01-01`),
        },
      },
    })
    const internalId = `SHP-${year}-${String(count + 1).padStart(3, '0')}`

    // Create shipment with items
    const shipment = await prisma.shipment.create({
      data: {
        internalId,
        fromLocationId,
        toLocationId,
        optimalPlacementEnabled,
        status: 'draft',
        items: {
          create: items.map((item: any) => ({
            masterSku: item.sku,
            fnsku: item.fnsku,
            productName: item.productName,
            requestedQty: item.requestedQty || item.qty || 0,
            adjustedQty: item.adjustedQty || item.qty || 0,
          })),
        },
      },
      include: {
        fromLocation: true,
        toLocation: true,
        items: {
          include: {
            product: {
              select: {
                sku: true,
                title: true,
                fnsku: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ shipment }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating shipment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create shipment' },
      { status: 500 }
    )
  }
}

