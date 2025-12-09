import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await prisma.auditSession.update({
      where: { id: parseInt(params.id) },
      data: { status: 'in_progress' },
    })

    return NextResponse.json(session)
  } catch (error: any) {
    console.error('Error resuming audit session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to resume audit session' },
      { status: 500 }
    )
  }
}

