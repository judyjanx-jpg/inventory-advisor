import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - List warranty claims (internal)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // comma-separated list
    const claimType = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = {}

    if (status) {
      const statuses = status.split(',').map(s => s.trim())
      where.status = { in: statuses }
    }

    if (claimType) {
      where.claimType = claimType
    }

    const [claims, total] = await Promise.all([
      prisma.warrantyClaim.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          claimNumber: true,
          orderId: true,
          customerEmail: true,
          customerName: true,
          claimType: true,
          status: true,
          masterSku: true,
          productName: true,
          quantity: true,
          returnTrackingNumber: true,
          returnCarrier: true,
          returnShippedAt: true,
          returnDeliveredAt: true,
          replacementOrderId: true,
          replacementTracking: true,
          refundAmount: true,
          refundProcessedAt: true,
          createdAt: true,
          updatedAt: true,
        }
      }),
      prisma.warrantyClaim.count({ where })
    ])

    return NextResponse.json({
      claims,
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('[Warranty Claims] List error:', error)
    return NextResponse.json(
      { error: 'Unable to fetch warranty claims' },
      { status: 500 }
    )
  }
}

// PATCH - Update warranty claim status (internal)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { claimNumber, status, refundAmount, replacementOrderId, replacementTracking, internalNotes } = body

    if (!claimNumber) {
      return NextResponse.json(
        { error: 'Claim number is required' },
        { status: 400 }
      )
    }

    const updateData: any = {}

    if (status) {
      updateData.status = status
      
      // Set timestamps based on status
      if (status === 'RETURN_DELIVERED') {
        updateData.returnDeliveredAt = new Date()
      }
      if (status === 'COMPLETED') {
        if (refundAmount) {
          updateData.refundProcessedAt = new Date()
        }
      }
    }

    if (refundAmount !== undefined) {
      updateData.refundAmount = refundAmount
    }

    if (replacementOrderId) {
      updateData.replacementOrderId = replacementOrderId
    }

    if (replacementTracking) {
      updateData.replacementTracking = replacementTracking
      updateData.replacementShippedAt = new Date()
    }

    if (internalNotes !== undefined) {
      updateData.internalNotes = internalNotes
    }

    const claim = await prisma.warrantyClaim.update({
      where: { claimNumber },
      data: updateData,
    })

    console.log(`[Warranty Claims] Updated ${claimNumber} to status: ${status || 'no change'}`)

    return NextResponse.json({
      success: true,
      claim,
    })
  } catch (error) {
    console.error('[Warranty Claims] Update error:', error)
    return NextResponse.json(
      { error: 'Unable to update warranty claim' },
      { status: 500 }
    )
  }
}

