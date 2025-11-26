import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const showHidden = searchParams.get('showHidden') === 'true'

    const inventory = await prisma.inventoryLevel.findMany({
      where: {
        product: showHidden ? undefined : { isHidden: false },
      },
      include: {
        product: {
          include: {
            salesVelocity: true,
            skuMappings: {
              include: {
                channelInventory: true,
              },
            },
          },
        },
      },
      orderBy: {
        masterSku: 'asc',
      },
    })

    return NextResponse.json(inventory)
  } catch (error: any) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch inventory' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { masterSku, fbaAvailable, warehouseAvailable, fbaInboundWorking, fbaInboundShipped, fbaInboundReceiving } = body

    if (!masterSku) {
      return NextResponse.json(
        { error: 'Master SKU is required' },
        { status: 400 }
      )
    }

    const inventory = await prisma.inventoryLevel.upsert({
      where: { masterSku },
      update: {
        fbaAvailable: fbaAvailable !== undefined ? fbaAvailable : undefined,
        warehouseAvailable: warehouseAvailable !== undefined ? warehouseAvailable : undefined,
        fbaInboundWorking: fbaInboundWorking !== undefined ? fbaInboundWorking : undefined,
        fbaInboundShipped: fbaInboundShipped !== undefined ? fbaInboundShipped : undefined,
        fbaInboundReceiving: fbaInboundReceiving !== undefined ? fbaInboundReceiving : undefined,
        updatedAt: new Date(),
      },
      create: {
        masterSku,
        fbaAvailable: fbaAvailable || 0,
        warehouseAvailable: warehouseAvailable || 0,
        fbaInboundWorking: fbaInboundWorking || 0,
        fbaInboundShipped: fbaInboundShipped || 0,
        fbaInboundReceiving: fbaInboundReceiving || 0,
      },
    })

    return NextResponse.json(inventory)
  } catch (error: any) {
    console.error('Error updating inventory:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update inventory' },
      { status: 500 }
    )
  }
}
