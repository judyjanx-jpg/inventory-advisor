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
        entries: true,
      },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Audit session not found' },
        { status: 404 }
      )
    }

    const flaggedCount = session.entries.filter(e => e.isFlagged).length
    const totalVariance = session.entries.reduce((sum, e) => sum + e.variance, 0)
    const positiveVariance = session.entries.filter(e => e.variance > 0).reduce((sum, e) => sum + e.variance, 0)
    const negativeVariance = Math.abs(session.entries.filter(e => e.variance < 0).reduce((sum, e) => sum + e.variance, 0))

    return NextResponse.json({
      totalSkus: session.totalSkus,
      auditedCount: session.auditedCount,
      progress: session.totalSkus > 0 ? (session.auditedCount / session.totalSkus) * 100 : 0,
      flaggedCount,
      totalVariance,
      positiveVariance,
      negativeVariance,
      entriesCount: session.entries.length,
    })
  } catch (error: any) {
    console.error('Error fetching audit progress:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch audit progress' },
      { status: 500 }
    )
  }
}

