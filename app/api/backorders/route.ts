import { NextResponse } from 'next/server'
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

