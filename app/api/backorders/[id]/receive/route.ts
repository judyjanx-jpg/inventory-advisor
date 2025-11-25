import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { quantityReceived, quantityDamaged } = body

    const backorder = await prisma.backorder.findUnique({
      where: { id: parseInt(params.id) },
    })

    if (!backorder) {
      return NextResponse.json(
        { error: 'Backorder not found' },
        { status: 404 }
      )
    }

    const totalReceived = quantityReceived + quantityDamaged
    const newStatus = totalReceived >= backorder.quantity ? 'received' : 'pending'

    // Update backorder
    await prisma.backorder.update({
      where: { id: parseInt(params.id) },
      data: {
        quantityReceived: backorder.quantityReceived + quantityReceived,
        quantityDamaged: backorder.quantityDamaged + quantityDamaged,
        status: newStatus,
        receivedDate: newStatus === 'received' ? new Date() : null,
      },
    })

    // Update inventory
    if (quantityReceived > 0) {
      await prisma.inventoryLevel.upsert({
        where: { masterSku: backorder.masterSku },
        update: {
          warehouseAvailable: {
            increment: quantityReceived,
          },
          warehouseLastSync: new Date(),
        },
        create: {
          masterSku: backorder.masterSku,
          warehouseAvailable: quantityReceived,
          fbaAvailable: 0,
          warehouseLastSync: new Date(),
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Backorder received successfully',
    })
  } catch (error: any) {
    console.error('Error receiving backorder:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to receive backorder' },
      { status: 500 }
    )
  }
}

