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

    type AuditEntry = { isFlagged: boolean; variance: number; sku: string; parentSku: string | null; previousQty: number; newQty: number; notes: string | null }
    const flaggedEntries = session.entries.filter((e: AuditEntry) => e.isFlagged)
    const totalVariance = session.entries.reduce((sum: number, e: AuditEntry) => sum + e.variance, 0)
    const positiveVariance = session.entries.filter((e: AuditEntry) => e.variance > 0).reduce((sum: number, e: AuditEntry) => sum + e.variance, 0)
    const negativeVariance = Math.abs(session.entries.filter((e: AuditEntry) => e.variance < 0).reduce((sum: number, e: AuditEntry) => sum + e.variance, 0))

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
      flaggedEntries: flaggedEntries.map((e: AuditEntry) => ({
        sku: e.sku,
        previousQty: e.previousQty,
        newQty: e.newQty,
        variance: e.variance,
        notes: e.notes,
      })),
      allEntries: session.entries.map((e: AuditEntry) => ({
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

