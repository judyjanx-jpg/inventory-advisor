import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku')
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (sku) where.masterSku = sku
    if (status) where.status = status

    const spikes = await prisma.manualSpike.findMany({
      where,
      orderBy: { startDate: 'asc' },
    })

    return NextResponse.json({
      success: true,
      spikes: spikes.map((spike: {
        id: number
        masterSku: string
        spikeType: string
        liftMultiplier: unknown
        startDate: Date
        endDate: Date
        notes: string | null
        status: string
        actualLift: unknown
        variance: unknown
        createdAt: Date
      }) => ({
        id: spike.id,
        masterSku: spike.masterSku,
        spikeType: spike.spikeType,
        liftMultiplier: Number(spike.liftMultiplier),
        startDate: spike.startDate.toISOString(),
        endDate: spike.endDate.toISOString(),
        notes: spike.notes,
        status: spike.status,
        actualLift: spike.actualLift ? Number(spike.actualLift) : null,
        variance: spike.variance ? Number(spike.variance) : null,
        createdAt: spike.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Failed to fetch manual spikes:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch manual spikes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { masterSku, spikeType, liftMultiplier, startDate, endDate, notes } = body

    if (!masterSku || !spikeType || !liftMultiplier || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const spike = await prisma.manualSpike.create({
      data: {
        masterSku,
        spikeType,
        liftMultiplier,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        notes: notes || null,
        status: 'scheduled',
      },
    })

    return NextResponse.json({
      success: true,
      spike: {
        id: spike.id,
        masterSku: spike.masterSku,
        spikeType: spike.spikeType,
        liftMultiplier: Number(spike.liftMultiplier),
        startDate: spike.startDate.toISOString(),
        endDate: spike.endDate.toISOString(),
        notes: spike.notes,
        status: spike.status,
        createdAt: spike.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to create manual spike:', error)
    return NextResponse.json({ success: false, error: 'Failed to create manual spike' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing spike ID' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (updates.spikeType) updateData.spikeType = updates.spikeType
    if (updates.liftMultiplier) updateData.liftMultiplier = updates.liftMultiplier
    if (updates.startDate) updateData.startDate = new Date(updates.startDate)
    if (updates.endDate) updateData.endDate = new Date(updates.endDate)
    if (updates.notes !== undefined) updateData.notes = updates.notes
    if (updates.status) updateData.status = updates.status
    if (updates.actualLift !== undefined) updateData.actualLift = updates.actualLift
    if (updates.variance !== undefined) updateData.variance = updates.variance
    if (updates.resultNotes !== undefined) updateData.resultNotes = updates.resultNotes

    const spike = await prisma.manualSpike.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      spike: {
        id: spike.id,
        masterSku: spike.masterSku,
        spikeType: spike.spikeType,
        liftMultiplier: Number(spike.liftMultiplier),
        startDate: spike.startDate.toISOString(),
        endDate: spike.endDate.toISOString(),
        notes: spike.notes,
        status: spike.status,
        createdAt: spike.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to update manual spike:', error)
    return NextResponse.json({ success: false, error: 'Failed to update manual spike' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing spike ID' }, { status: 400 })
    }

    await prisma.manualSpike.delete({
      where: { id: parseInt(id) },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete manual spike:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete manual spike' }, { status: 500 })
  }
}
