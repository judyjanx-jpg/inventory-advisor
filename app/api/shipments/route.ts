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

    // Transform shipments to include total counts
    const transformedShipments = shipments.map((shipment: any) => ({
      ...shipment,
      totalItems: shipment.items.length,
      totalUnits: shipment.items.reduce((sum: any, item: any) => sum + item.adjustedQty, 0),
    }))

    return NextResponse.json({
      shipments: transformedShipments,
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
      destination, // FBA destination like 'fba_us', 'fba_ca', 'fba_uk'
      optimalPlacementEnabled = true,
      items = [],
    } = body

    // Map destination to destinationFc and destinationName
    const destinationMap: Record<string, { fc: string; name: string }> = {
      'fba_us': { fc: 'US', name: 'Amazon FBA US' },
      'fba_ca': { fc: 'CA', name: 'Amazon FBA Canada' },
      'fba_uk': { fc: 'UK', name: 'Amazon FBA UK' },
    }
    const destInfo = destinationMap[destination] || { fc: 'US', name: 'Amazon FBA US' }

    // Check if shipment model exists in Prisma client
    if (!prisma.shipment) {
      console.error('Prisma client missing Shipment model. Please run: npx prisma generate')
      return NextResponse.json(
        { error: 'Database model not available. Please restart the server after running: npx prisma generate' },
        { status: 500 }
      )
    }

    // Generate unique internal ID with retry for race conditions
    const year = new Date().getFullYear()
    let shipment = null
    let retries = 5

    while (retries > 0 && !shipment) {
      try {
        // Get the highest existing number for this year
        const lastShipment = await prisma.shipment.findFirst({
          where: {
            internalId: {
              startsWith: `SHP-${year}-`,
            },
          },
          orderBy: {
            internalId: 'desc',
          },
          select: {
            internalId: true,
          },
        })

        // Extract the number and increment
        let nextNum = 1
        if (lastShipment) {
          const match = lastShipment.internalId.match(/SHP-\d+-(\d+)/)
          if (match) {
            nextNum = parseInt(match[1], 10) + 1
          }
        }

        const internalId = `SHP-${year}-${String(nextNum).padStart(3, '0')}`

        // Create shipment with items
        shipment = await prisma.shipment.create({
          data: {
            internalId,
            fromLocationId,
            destinationFc: destInfo.fc,
            destinationName: destInfo.name,
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
      } catch (err: any) {
        // If it's a unique constraint error, retry with a new ID
        if (err.code === 'P2002' && err.meta?.target?.includes('internal_id')) {
          retries--
          if (retries === 0) {
            throw new Error('Failed to generate unique shipment ID after multiple retries')
          }
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 100))
        } else {
          throw err
        }
      }
    }

    return NextResponse.json({ shipment }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating shipment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create shipment' },
      { status: 500 }
    )
  }
}

