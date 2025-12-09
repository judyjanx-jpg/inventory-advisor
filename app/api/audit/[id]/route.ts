import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await prisma.auditSession.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        warehouse: true,
        entries: {
          orderBy: { auditedAt: 'desc' },
        },
      },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Audit session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(session)
  } catch (error: any) {
    console.error('Error fetching audit session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch audit session' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.auditSession.delete({
      where: { id: parseInt(params.id) },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting audit session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete audit session' },
      { status: 500 }
    )
  }
}

