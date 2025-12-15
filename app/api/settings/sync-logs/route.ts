/**
 * Sync Logs API
 *
 * GET /api/settings/sync-logs - Get recent sync logs for monitoring
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const syncType = searchParams.get('type') // Filter by type if provided

    const where: any = {}
    if (syncType) {
      where.syncType = { contains: syncType }
    }

    const logs = await prisma.syncLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
    })

    // Get summary stats
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [stats24h, stats7d] = await Promise.all([
      prisma.syncLog.groupBy({
        by: ['syncType', 'status'],
        where: { startedAt: { gte: last24h } },
        _count: true,
      }),
      prisma.syncLog.groupBy({
        by: ['syncType'],
        where: { startedAt: { gte: last7d }, status: 'success' },
        _sum: {
          recordsProcessed: true,
          recordsCreated: true,
          recordsUpdated: true,
        },
      }),
    ])

    // Format logs for display
    const formattedLogs = logs.map(log => ({
      id: log.id,
      syncType: log.syncType,
      status: log.status,
      startedAt: log.startedAt,
      completedAt: log.completedAt,
      duration: log.completedAt
        ? Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)
        : null,
      recordsProcessed: log.recordsProcessed,
      recordsCreated: log.recordsCreated,
      recordsUpdated: log.recordsUpdated,
      recordsSkipped: log.recordsSkipped,
      errorMessage: log.errorMessage,
      metadata: log.metadata,
    }))

    // Build summary by sync type
    const summaryByType: Record<string, any> = {}
    for (const stat of stats7d) {
      summaryByType[stat.syncType] = {
        totalProcessed: stat._sum.recordsProcessed || 0,
        totalCreated: stat._sum.recordsCreated || 0,
        totalUpdated: stat._sum.recordsUpdated || 0,
      }
    }

    // Count successes/failures in last 24h
    const statusCounts: Record<string, { success: number; failed: number }> = {}
    for (const stat of stats24h) {
      if (!statusCounts[stat.syncType]) {
        statusCounts[stat.syncType] = { success: 0, failed: 0 }
      }
      if (stat.status === 'success') {
        statusCounts[stat.syncType].success = stat._count
      } else if (stat.status === 'failed') {
        statusCounts[stat.syncType].failed = stat._count
      }
    }

    return NextResponse.json({
      success: true,
      logs: formattedLogs,
      summary: {
        last24h: statusCounts,
        last7d: summaryByType,
      },
    })
  } catch (error: any) {
    console.error('Failed to get sync logs:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}
