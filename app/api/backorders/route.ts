import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const backorders = await prisma.backorder.findMany({
      where: {
        status: 'pending',
      },
      include: {
        supplier: true,
      },
      orderBy: {
        createdDate: 'desc',
      },
    })

    return NextResponse.json(backorders)
  } catch (error: any) {
    console.error('Error fetching backorders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch backorders' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { masterSku, quantity, poId, poNumber, supplierId, unitCost } = body

    if (!masterSku || !quantity || !poId || !supplierId) {
      return NextResponse.json(
        { error: 'Missing required fields: masterSku, quantity, poId, supplierId' },
        { status: 400 }
      )
    }

    const backorder = await prisma.backorder.create({
      data: {
        masterSku,
        quantity,
        poId,
        poNumber: poNumber || '',
        supplierId,
        unitCost: unitCost ? parseFloat(unitCost.toString()) : 0,
        status: 'pending',
      },
      include: {
        supplier: true,
      },
    })

    return NextResponse.json(backorder)
  } catch (error: any) {
    console.error('Error creating backorder:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create backorder' },
      { status: 500 }
    )
  }
}

