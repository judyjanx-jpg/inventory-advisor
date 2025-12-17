import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const warehouseId = searchParams.get('warehouseId')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = {
      status: { in: ['completed', 'cancelled'] }, // Include audits ended early
    }

    if (warehouseId) {
      where.warehouseId = parseInt(warehouseId)
    }

    const sessions = await prisma.auditSession.findMany({
      where,
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
        entries: {
          select: {
            variance: true,
            isFlagged: true,
          },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
    })

    type AuditEntry = { isFlagged: boolean; variance: number }
    type AuditSession = { id: number; warehouse: { id: number; name: string }; auditMode: string; status: string; totalSkus: number; auditedCount: number; startedAt: Date; completedAt: Date | null; entries: AuditEntry[] }
    const sessionsWithStats = sessions.map((session: AuditSession) => {
      const variances = session.entries.map((e: AuditEntry) => e.variance)
      const flaggedCount = session.entries.filter((e: AuditEntry) => e.isFlagged).length
      const netVariance = variances.reduce((sum: number, v: number) => sum + v, 0)
      const positiveVariance = variances.filter((v: number) => v > 0).reduce((sum: number, v: number) => sum + v, 0)
      const negativeVariance = Math.abs(variances.filter((v: number) => v < 0).reduce((sum: number, v: number) => sum + v, 0))

      return {
        id: session.id,
        warehouse: session.warehouse,
        auditMode: session.auditMode,
        status: session.status,
        totalSkus: session.totalSkus,
        auditedCount: session.auditedCount,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        flaggedCount,
        netVariance,
        positiveVariance,
        negativeVariance,
        varianceCount: session.entries.length,
      }
    })

    return NextResponse.json({ sessions: sessionsWithStats })
  } catch (error: any) {
    console.error('Error fetching audit history:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch audit history' },
      { status: 500 }
    )
  }
}

