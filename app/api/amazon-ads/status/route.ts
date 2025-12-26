// app/api/amazon-ads/status/route.ts
// Check the status of ads data - SP, SB, SD

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdsCredentials } from '@/lib/amazon-ads-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const credentials = await getAdsCredentials()
    
    // Check pending reports by type
    const pendingReports = await prisma.adsPendingReport.groupBy({
      by: ['reportType', 'status'],
      _count: true,
      orderBy: { reportType: 'asc' }
    })

    // Get recent pending reports
    const recentReports = await prisma.adsPendingReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        reportId: true,
        reportType: true,
        status: true,
        dateRange: true,
        failureReason: true,
        createdAt: true,
        completedAt: true,
      }
    })

    // Check advertising_daily data by campaign type
    const adDataByType = await prisma.$queryRaw`
      SELECT 
        campaign_type,
        COUNT(*) as days_count,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks
      FROM advertising_daily
      GROUP BY campaign_type
      ORDER BY campaign_type
    ` as any[]

    // Check last 7 days of ad data
    const last7Days = await prisma.$queryRaw`
      SELECT 
        date,
        campaign_type,
        spend,
        impressions,
        clicks
      FROM advertising_daily
      WHERE date >= NOW() - INTERVAL '7 days'
      ORDER BY date DESC, campaign_type
    ` as any[]

    // Check campaign counts by type
    const campaignsByType = await prisma.adCampaign.groupBy({
      by: ['campaignType'],
      _count: true,
      _sum: { spend: true }
    })

    return NextResponse.json({
      success: true,
      connected: !!credentials?.profileId,
      profileId: credentials?.profileId || null,
      
      pendingReports: {
        summary: pendingReports,
        recent: recentReports,
      },
      
      advertisingDaily: {
        byType: adDataByType.map((row: any) => ({
          campaignType: row.campaign_type,
          daysCount: Number(row.days_count),
          earliestDate: row.earliest_date,
          latestDate: row.latest_date,
          totalSpend: Number(row.total_spend || 0),
          totalImpressions: Number(row.total_impressions || 0),
          totalClicks: Number(row.total_clicks || 0),
        })),
        last7Days: last7Days.map((row: any) => ({
          date: row.date,
          campaignType: row.campaign_type,
          spend: Number(row.spend || 0),
          impressions: Number(row.impressions || 0),
          clicks: Number(row.clicks || 0),
        })),
      },
      
      campaigns: campaignsByType.map((row: any) => ({
        type: row.campaignType,
        count: row._count,
        totalSpend: Number(row._sum.spend || 0),
      })),
    })
  } catch (error: any) {
    console.error('Error checking ads status:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}
