import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const warehouseId = searchParams.get('warehouseId')

    const where: any = {
      status: { in: ['in_progress', 'paused'] },
    }

    if (warehouseId) {
      where.warehouseId = parseInt(warehouseId)
    }

    const session = await prisma.auditSession.findFirst({
      where,
      include: {
        warehouse: true,
        entries: {
          orderBy: { auditedAt: 'desc' },
        },
      },
      orderBy: { startedAt: 'desc' },
    })

    if (!session) {
      return NextResponse.json({ session: null })
    }

    return NextResponse.json({ session })
  } catch (error: any) {
    console.error('Error fetching current audit session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch current audit session' },
      { status: 500 }
    )
  }
}

