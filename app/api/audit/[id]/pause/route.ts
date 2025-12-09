import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await prisma.auditSession.update({
      where: { id: parseInt(params.id) },
      data: { status: 'paused' },
    })

    return NextResponse.json(session)
  } catch (error: any) {
    console.error('Error pausing audit session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to pause audit session' },
      { status: 500 }
    )
  }
}

