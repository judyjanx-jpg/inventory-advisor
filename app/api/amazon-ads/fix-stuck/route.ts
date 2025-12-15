/**
 * Fix Stuck Ads Reports
 *
 * GET - View stuck pending reports
 * POST - Clear stuck reports so new ones get requested
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Get all pending reports
    const pendingReports = await prisma.adsPendingReport.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    })

    // Get recent advertising_daily data
    const recentAdsData = await prisma.advertisingDaily.findMany({
      orderBy: { date: 'desc' },
      take: 14,
    })

    // Check how old the pending reports are
    const now = new Date()
    const reportsWithAge = pendingReports.map(r => ({
      id: r.id,
      reportId: r.reportId.substring(0, 12) + '...',
      reportType: r.reportType,
      status: r.status,
      dateRange: r.dateRange,
      createdAt: r.createdAt,
      ageMinutes: Math.round((now.getTime() - new Date(r.createdAt).getTime()) / 60000),
      isStuck: (now.getTime() - new Date(r.createdAt).getTime()) > 2 * 60 * 60 * 1000, // > 2 hours
    }))

    const stuckCount = reportsWithAge.filter(r => r.isStuck).length

    return NextResponse.json({
      success: true,
      pendingReports: reportsWithAge,
      stuckCount,
      recentAdsData: recentAdsData.map(d => ({
        date: d.date,
        campaignType: d.campaignType,
        spend: d.spend,
        impressions: d.impressions,
        clicks: d.clicks,
      })),
      message: stuckCount > 0
        ? `Found ${stuckCount} stuck reports. POST to this endpoint to clear them.`
        : 'No stuck reports found.',
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST() {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

    // Mark old pending reports as expired
    const expiredResult = await prisma.adsPendingReport.updateMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: twoHoursAgo },
      },
      data: { status: 'EXPIRED' },
    })

    // Also clean up very old reports (> 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const deletedResult = await prisma.adsPendingReport.deleteMany({
      where: {
        createdAt: { lt: sevenDaysAgo },
        status: { in: ['COMPLETED', 'FAILED', 'EXPIRED'] },
      },
    })

    return NextResponse.json({
      success: true,
      expiredCount: expiredResult.count,
      deletedOldCount: deletedResult.count,
      message: `Marked ${expiredResult.count} stuck reports as expired. Deleted ${deletedResult.count} old reports. New reports will be requested on next sync (within 30 min).`,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
