import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const watchlist = await prisma.growthWatchlist.findMany({
      orderBy: [
        { priority: 'asc' },
        { addedAt: 'desc' },
      ],
    })

    return NextResponse.json({
      success: true,
      items: watchlist.map((item: {
        id: number
        masterSku: string
        targetLift: unknown
        priority: string
        notes: string | null
        addedAt: Date
      }) => ({
        id: item.id,
        masterSku: item.masterSku,
        targetLift: Number(item.targetLift),
        priority: item.priority,
        notes: item.notes,
        addedAt: item.addedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Failed to fetch growth watchlist:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch growth watchlist' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { masterSku, targetLift, priority, notes } = body

    if (!masterSku || !targetLift) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const item = await prisma.growthWatchlist.upsert({
      where: { masterSku },
      update: {
        targetLift,
        priority: priority || 'normal',
        notes: notes || null,
      },
      create: {
        masterSku,
        targetLift,
        priority: priority || 'normal',
        notes: notes || null,
      },
    })

    return NextResponse.json({
      success: true,
      item: {
        id: item.id,
        masterSku: item.masterSku,
        targetLift: Number(item.targetLift),
        priority: item.priority,
        notes: item.notes,
        addedAt: item.addedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to add to growth watchlist:', error)
    return NextResponse.json({ success: false, error: 'Failed to add to growth watchlist' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku')

    if (!sku) {
      return NextResponse.json({ success: false, error: 'Missing SKU' }, { status: 400 })
    }

    await prisma.growthWatchlist.delete({
      where: { masterSku: sku },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove from growth watchlist:', error)
    return NextResponse.json({ success: false, error: 'Failed to remove from growth watchlist' }, { status: 500 })
  }
}
