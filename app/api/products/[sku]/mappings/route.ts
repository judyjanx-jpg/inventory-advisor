import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: { sku: string } }
) {
  try {
    const mappings = await prisma.skuMapping.findMany({
      where: { masterSku: params.sku },
      orderBy: { channel: 'asc' },
    })

    return NextResponse.json(mappings)
  } catch (error: any) {
    console.error('Error fetching SKU mappings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch mappings' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: { sku: string } }
) {
  try {
    const body = await request.json()
    const { channel, channelSku, channelProductId, channelFnsku } = body

    if (!channel || !channelSku) {
      return NextResponse.json(
        { error: 'Channel and Channel SKU are required' },
        { status: 400 }
      )
    }

    // Check if mapping already exists for this channel
    const existing = await prisma.skuMapping.findFirst({
      where: {
        masterSku: params.sku,
        channel,
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A mapping for this channel already exists' },
        { status: 400 }
      )
    }

    const mapping = await prisma.skuMapping.create({
      data: {
        masterSku: params.sku,
        channel,
        channelSku,
        channelProductId,
        channelFnsku,
        isActive: true,
      },
    })

    return NextResponse.json(mapping)
  } catch (error: any) {
    console.error('Error creating SKU mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create mapping' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { sku: string } }
) {
  try {
    const body = await request.json()
    const { id, channel, channelSku, channelProductId, channelFnsku, isActive } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Mapping ID is required' },
        { status: 400 }
      )
    }

    const mapping = await prisma.skuMapping.update({
      where: { id },
      data: {
        channel,
        channelSku,
        channelProductId,
        channelFnsku,
        isActive,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json(mapping)
  } catch (error: any) {
    console.error('Error updating SKU mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update mapping' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const idParam = searchParams.get('id')

    if (!idParam) {
      return NextResponse.json(
        { error: 'Mapping ID is required' },
        { status: 400 }
      )
    }

    const id = parseInt(idParam, 10)

    await prisma.skuMapping.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting SKU mapping:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete mapping' },
      { status: 500 }
    )
  }
}

