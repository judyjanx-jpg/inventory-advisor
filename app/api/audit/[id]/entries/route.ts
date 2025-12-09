import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entries = await prisma.auditEntry.findMany({
      where: { auditSessionId: parseInt(params.id) },
      orderBy: { auditedAt: 'desc' },
    })

    return NextResponse.json({ entries })
  } catch (error: any) {
    console.error('Error fetching audit entries:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch audit entries' },
      { status: 500 }
    )
  }
}

