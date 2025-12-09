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
        entries: {
          orderBy: [
            { isFlagged: 'desc' },
            { variance: 'asc' },
          ],
        },
        warehouse: true,
      },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Audit session not found' },
        { status: 404 }
      )
    }

    const flaggedEntries = session.entries.filter(e => e.isFlagged)
    const totalVariance = session.entries.reduce((sum, e) => sum + e.variance, 0)
    const positiveVariance = session.entries.filter(e => e.variance > 0).reduce((sum, e) => sum + e.variance, 0)
    const negativeVariance = Math.abs(session.entries.filter(e => e.variance < 0).reduce((sum, e) => sum + e.variance, 0))

    return NextResponse.json({
      session: {
        id: session.id,
        warehouse: session.warehouse,
        auditMode: session.auditMode,
        totalSkus: session.totalSkus,
        auditedCount: session.auditedCount,
        startedAt: session.startedAt,
      },
      summary: {
        totalAudited: session.entries.length,
        flaggedCount: flaggedEntries.length,
        totalVariance,
        positiveVariance,
        negativeVariance,
      },
      flaggedEntries: flaggedEntries.map(e => ({
        sku: e.sku,
        previousQty: e.previousQty,
        newQty: e.newQty,
        variance: e.variance,
        notes: e.notes,
      })),
      allEntries: session.entries.map(e => ({
        sku: e.sku,
        parentSku: e.parentSku,
        previousQty: e.previousQty,
        newQty: e.newQty,
        variance: e.variance,
        isFlagged: e.isFlagged,
        notes: e.notes,
      })),
    })
  } catch (error: any) {
    console.error('Error fetching audit summary:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch audit summary' },
      { status: 500 }
    )
  }
}

