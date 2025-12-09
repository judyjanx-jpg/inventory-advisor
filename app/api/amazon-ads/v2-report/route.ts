// app/api/amazon-ads/v2-report/route.ts
// Use V2 Reporting API instead of V3 - may be more reliable

import { NextRequest, NextResponse } from 'next/server'
import { getAdsCredentials, adsApiRequest, downloadReport } from '@/lib/amazon-ads-api'
import { prisma } from '@/lib/prisma'

// V2 Report request
async function requestV2Report(
  profileId: string, 
  recordType: 'campaigns' | 'adGroups' | 'keywords',
  reportDate: string,
  metrics: string[]
): Promise<{ reportId: string }> {
  const body = {
    reportDate,
    metrics: metrics.join(','),
    // Only include enabled campaigns
    stateFilter: 'enabled',
  }

  return adsApiRequest<{ reportId: string }>(`/v2/sp/${recordType}/report`, {
    method: 'POST',
    profileId,
    body,
  })
}

// Check V2 report status
async function getV2ReportStatus(reportId: string, profileId: string): Promise<{
  status: string
  location?: string
  fileSize?: number
}> {
  return adsApiRequest<any>(`/v2/reports/${reportId}`, { profileId })
}

export async function GET(request: NextRequest) {
  try {
    const days = parseInt(request.nextUrl.searchParams.get('days') || '1')
    
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    const profileId = credentials.profileId
    
    // Get date for report (yesterday)
    const reportDate = new Date()
    reportDate.setDate(reportDate.getDate() - days)
    const dateStr = reportDate.toISOString().split('T')[0].replace(/-/g, '')  // V2 uses YYYYMMDD format
    
    console.log(`Requesting V2 campaign report for ${dateStr}...`)

    // Request V2 campaign report with key metrics
    const metrics = [
      'impressions',
      'clicks', 
      'cost',
      'attributedSales14d',
      'attributedConversions14d',
      'attributedUnitsOrdered14d'
    ]

    try {
      const reportRequest = await requestV2Report(profileId, 'campaigns', dateStr, metrics)
      
      return NextResponse.json({
        success: true,
        reportId: reportRequest.reportId,
        reportDate: dateStr,
        apiVersion: 'V2',
        recordType: 'campaigns',
        metrics,
        message: 'V2 report requested. Check status with POST to this endpoint.',
        checkBody: { reportId: reportRequest.reportId },
      })
    } catch (error: any) {
      return NextResponse.json({
        error: error.message,
        hint: 'V2 API might require different headers or format',
      }, { status: 500 })
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Check V2 report status and download
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const reportId = body.reportId
    
    if (!reportId) {
      return NextResponse.json({ error: 'reportId required' }, { status: 400 })
    }
    
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    console.log(`Checking V2 report status: ${reportId}`)
    
    const status = await getV2ReportStatus(reportId, credentials.profileId)
    console.log('V2 Report status:', JSON.stringify(status))
    
    if (status.status !== 'SUCCESS' || !status.location) {
      return NextResponse.json({
        reportId,
        status: status.status,
        fileSize: status.fileSize,
        message: status.status === 'IN_PROGRESS' ? 'Still processing...' : 'Not ready',
      })
    }

    // Download and parse
    console.log('Downloading V2 report from:', status.location)
    const reportData = await downloadReport(status.location)
    console.log(`Downloaded ${reportData.length} rows`)

    // Process and save to database
    let totalSpend = 0
    let totalImpressions = 0
    let totalClicks = 0
    let totalSales = 0
    let campaignCount = 0

    for (const row of reportData) {
      totalSpend += Number(row.cost) || 0
      totalImpressions += Number(row.impressions) || 0
      totalClicks += Number(row.clicks) || 0
      totalSales += Number(row.attributedSales14d) || 0
      campaignCount++
    }

    // Get report date from first row or use yesterday
    const reportDate = reportData[0]?.date || new Date(Date.now() - 86400000).toISOString().split('T')[0]

    // Save to database
    await prisma.advertisingDaily.upsert({
      where: {
        date_campaignType: { date: new Date(reportDate), campaignType: 'SP' },
      },
      create: {
        date: new Date(reportDate),
        campaignType: 'SP',
        impressions: totalImpressions,
        clicks: totalClicks,
        spend: totalSpend,
        sales14d: totalSales,
      },
      update: {
        impressions: totalImpressions,
        clicks: totalClicks,
        spend: totalSpend,
        sales14d: totalSales,
        updatedAt: new Date(),
      },
    })

    // Update sync status
    await prisma.apiConnection.updateMany({
      where: { platform: 'amazon_ads' },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
      },
    })

    return NextResponse.json({
      success: true,
      status: 'SUCCESS',
      apiVersion: 'V2',
      reportDate,
      summary: {
        campaigns: campaignCount,
        impressions: totalImpressions,
        clicks: totalClicks,
        spend: totalSpend.toFixed(2),
        sales: totalSales.toFixed(2),
      },
      sampleData: reportData.slice(0, 3),
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      hint: 'V2 report download might need different parsing',
    }, { status: 500 })
  }
}

