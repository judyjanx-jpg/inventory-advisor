// app/api/amazon-ads/sync/route.ts
// Manually trigger Amazon Ads sync and manage pending reports

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdsCredentials } from '@/lib/amazon-ads-api'
import { gunzipSync } from 'zlib'

const ADS_API_BASE = 'https://advertising-api.amazon.com'

// GET: Check sync status and pending reports
export async function GET() {
  try {
    const credentials = await getAdsCredentials()
    
    const pendingReports = await prisma.adsPendingReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    const campaignStats = await prisma.adCampaign.aggregate({
      _count: true,
      _sum: {
        spend: true,
        sales14d: true,
        impressions: true,
        clicks: true,
      },
    })

    const lastSync = await prisma.syncLog.findFirst({
      where: { syncType: 'scheduled-ads-reports' },
      orderBy: { completedAt: 'desc' },
    })

    return NextResponse.json({
      connected: !!credentials?.profileId,
      profileId: credentials?.profileId,
      pendingReports: pendingReports.map((r: any) => ({
        id: r.id,
        reportId: r.reportId,
        status: r.status,
        reportType: r.reportType,
        dateRange: r.dateRange,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      })),
      campaignStats: {
        totalCampaigns: campaignStats._count,
        totalSpend: campaignStats._sum.spend,
        totalSales: campaignStats._sum.sales14d,
        totalImpressions: campaignStats._sum.impressions,
        totalClicks: campaignStats._sum.clicks,
      },
      lastSync: lastSync ? {
        status: lastSync.status,
        completedAt: lastSync.completedAt,
        metadata: lastSync.metadata,
      } : null,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Request a new report and/or check pending ones
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || 'sync' // 'sync', 'request', 'check', 'seed'

    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.accessToken) {
      return NextResponse.json({ error: 'Not connected to Amazon Ads' }, { status: 400 })
    }

    const profileId = credentials.profileId
    const results: any = { action }

    // Action: Seed existing report IDs into tracking table
    if (action === 'seed' && body.reportIds) {
      const reportIds = body.reportIds as string[]
      let seeded = 0
      for (const reportId of reportIds) {
        const existing = await prisma.adsPendingReport.findUnique({ where: { reportId } })
        if (!existing) {
          await prisma.adsPendingReport.create({
            data: {
              reportId,
              profileId,
              reportType: 'SP_CAMPAIGNS',
              status: 'PENDING',
            },
          })
          seeded++
        }
      }
      results.seeded = seeded
    }

    // Action: Check all pending reports
    if (action === 'sync' || action === 'check') {
      const pendingReports = await prisma.adsPendingReport.findMany({
        where: { status: 'PENDING' },
      })

      results.checked = 0
      results.completed = 0
      results.campaignsUpdated = 0

      for (const report of pendingReports) {
        results.checked++
        
        const statusResponse = await fetch(`${ADS_API_BASE}/reporting/reports/${report.reportId}`, {
          headers: {
            'Authorization': `Bearer ${credentials.accessToken}`,
            'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
            'Amazon-Advertising-API-Scope': profileId,
            'Accept': 'application/json',
          },
        })

        if (!statusResponse.ok) continue

        const status = await statusResponse.json()

        if (status.status === 'COMPLETED' && status.url) {
          // Download and store
          const downloadResponse = await fetch(status.url)
          const gzipBuffer = await downloadResponse.arrayBuffer()
          const jsonBuffer = gunzipSync(Buffer.from(gzipBuffer))
          const campaigns = JSON.parse(jsonBuffer.toString('utf-8'))

          if (Array.isArray(campaigns)) {
            for (const campaign of campaigns) {
              const campaignId = campaign.campaignId?.toString()
              if (!campaignId) continue

              const spend = parseFloat(campaign.cost) || 0
              const sales = parseFloat(campaign.sales14d) || 0

              await prisma.adCampaign.upsert({
                where: { campaignId },
                update: {
                  campaignName: campaign.campaignName || 'Unknown',
                  campaignStatus: campaign.campaignStatus || 'UNKNOWN',
                  campaignType: 'SP',
                  budgetAmount: parseFloat(campaign.campaignBudgetAmount) || 0,
                  budgetType: campaign.campaignBudgetType || 'DAILY',
                  impressions: campaign.impressions || 0,
                  clicks: campaign.clicks || 0,
                  spend,
                  sales14d: sales,
                  orders14d: campaign.purchases14d || 0,
                  units14d: campaign.unitsSoldClicks14d || 0,
                  acos: sales > 0 ? (spend / sales) * 100 : null,
                  roas: spend > 0 ? sales / spend : null,
                  lastSyncedAt: new Date(),
                },
                create: {
                  campaignId,
                  campaignName: campaign.campaignName || 'Unknown',
                  campaignStatus: campaign.campaignStatus || 'UNKNOWN',
                  campaignType: 'SP',
                  budgetAmount: parseFloat(campaign.campaignBudgetAmount) || 0,
                  budgetType: campaign.campaignBudgetType || 'DAILY',
                  impressions: campaign.impressions || 0,
                  clicks: campaign.clicks || 0,
                  spend,
                  sales14d: sales,
                  orders14d: campaign.purchases14d || 0,
                  units14d: campaign.unitsSoldClicks14d || 0,
                  acos: sales > 0 ? (spend / sales) * 100 : null,
                  roas: spend > 0 ? sales / spend : null,
                  lastSyncedAt: new Date(),
                },
              })
              results.campaignsUpdated++
            }
          }

          await prisma.adsPendingReport.update({
            where: { id: report.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          })
          results.completed++

        } else if (status.status === 'FAILED') {
          await prisma.adsPendingReport.update({
            where: { id: report.id },
            data: { status: 'FAILED', failureReason: status.failureReason },
          })
        }
      }
    }

    // Action: Request a new report
    if (action === 'sync' || action === 'request') {
      const days = body.days || 1
      const endDate = new Date()
      endDate.setDate(endDate.getDate() - 1)
      const startDate = new Date(endDate)
      startDate.setDate(startDate.getDate() - days + 1)

      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

      const reportConfig = {
        name: `Sync_SP_${Date.now()}`,
        startDate: startDateStr,
        endDate: endDateStr,
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          groupBy: ['campaign'],
          columns: [
            'campaignName',
            'campaignId',
            'campaignStatus',
            'campaignBudgetAmount',
            'campaignBudgetType',
            'impressions',
            'clicks',
            'cost',
            'purchases14d',
            'sales14d',
            'unitsSoldClicks14d',
          ],
          reportTypeId: 'spCampaigns',
          timeUnit: 'SUMMARY',
          format: 'GZIP_JSON',
        },
      }

      const response = await fetch(`${ADS_API_BASE}/reporting/reports`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
          'Amazon-Advertising-API-Scope': profileId,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.createasyncreport.v3+json',
        },
        body: JSON.stringify(reportConfig),
      })

      const responseText = await response.text()
      let reportId: string | null = null

      if (response.status === 425) {
        const match = responseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
        if (match) reportId = match[1]
        results.newReportDuplicate = true
      } else if (response.ok) {
        const data = JSON.parse(responseText)
        reportId = data.reportId
      }

      if (reportId) {
        const existing = await prisma.adsPendingReport.findUnique({ where: { reportId } })
        if (!existing) {
          await prisma.adsPendingReport.create({
            data: {
              reportId,
              profileId,
              reportType: 'SP_CAMPAIGNS',
              status: 'PENDING',
              dateRange: `${startDateStr} to ${endDateStr}`,
            },
          })
        }
        results.newReportId = reportId
        results.dateRange = `${startDateStr} to ${endDateStr}`
      }
    }

    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
