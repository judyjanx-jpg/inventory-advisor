// app/api/amazon-ads/fresh-report/route.ts
// Create a fresh report with ENABLED filter and unique name

import { NextRequest, NextResponse } from 'next/server'
import { getAdsCredentials, adsApiRequest, getReportStatusV3, downloadReport } from '@/lib/amazon-ads-api'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const days = parseInt(request.nextUrl.searchParams.get('days') || '7')
    
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    const profileId = credentials.profileId
    
    // Calculate date range
    const endDate = new Date()
    endDate.setDate(endDate.getDate() - 1)  // Yesterday
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days + 1)
    
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]
    
    // Create report with unique name (timestamp) and ENABLED filter
    const reportConfig = {
      name: `SP Enabled Only ${Date.now()}`,
      startDate: startDateStr,
      endDate: endDateStr,
      configuration: {
        adProduct: 'SPONSORED_PRODUCTS',
        groupBy: ['campaign'],
        columns: [
          'date',
          'campaignName', 
          'campaignId',
          'campaignStatus',
          'impressions',
          'clicks',
          'spend',
          'sales14d',
          'purchases14d'
        ],
        reportTypeId: 'spCampaigns',
        timeUnit: 'DAILY',
        format: 'GZIP_JSON',
        filters: [
          {
            field: 'campaignStatus',
            values: ['ENABLED']
          }
        ]
      }
    }

    console.log('Creating filtered report:', JSON.stringify(reportConfig, null, 2))

    const response = await adsApiRequest<any>('/reporting/reports', {
      method: 'POST',
      profileId,
      body: reportConfig,
    })

    return NextResponse.json({
      success: true,
      reportId: response.reportId,
      status: response.status,
      dateRange: `${startDateStr} to ${endDateStr}`,
      filter: 'ENABLED campaigns only',
      checkUrl: `/api/amazon-ads/check-report?reportId=${response.reportId}`,
      message: 'Report requested. Check status in 30-60 seconds.',
    })

  } catch (error: any) {
    // Check for 425 duplicate
    if (error.message.includes('425')) {
      const match = error.message.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
      return NextResponse.json({
        error: '425 Duplicate',
        existingReportId: match ? match[1] : null,
        message: error.message,
      }, { status: 425 })
    }
    
    return NextResponse.json({ 
      error: error.message,
    }, { status: 500 })
  }
}

// POST - Check status and download if ready
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

    const status = await getReportStatusV3(reportId, credentials.profileId)
    
    if (status.status !== 'COMPLETED' || !status.url) {
      return NextResponse.json({
        reportId,
        status: status.status,
        message: status.status === 'PENDING' ? 'Still processing, try again later' : status.failureReason,
      })
    }

    // Download and process
    const reportData = await downloadReport(status.url)
    
    // Group by date and save
    const dataByDate: Record<string, {
      impressions: number
      clicks: number
      cost: number
      sales: number
      orders: number
      campaigns: number
    }> = {}

    for (const row of reportData) {
      const rowDate = row.date
      if (!rowDate) continue

      if (!dataByDate[rowDate]) {
        dataByDate[rowDate] = { impressions: 0, clicks: 0, cost: 0, sales: 0, orders: 0, campaigns: 0 }
      }

      dataByDate[rowDate].impressions += Number(row.impressions) || 0
      dataByDate[rowDate].clicks += Number(row.clicks) || 0
      dataByDate[rowDate].cost += Number(row.spend) || 0
      dataByDate[rowDate].sales += Number(row.sales14d) || 0
      dataByDate[rowDate].orders += Number(row.purchases14d) || 0
      dataByDate[rowDate].campaigns++
    }

    // Save to database
    let daysProcessed = 0
    for (const [date, data] of Object.entries(dataByDate)) {
      await prisma.advertisingDaily.upsert({
        where: {
          date_campaignType: { date: new Date(date), campaignType: 'SP' },
        },
        create: {
          date: new Date(date),
          campaignType: 'SP',
          impressions: data.impressions,
          clicks: data.clicks,
          spend: data.cost,
          sales14d: data.sales,
          orders14d: data.orders,
        },
        update: {
          impressions: data.impressions,
          clicks: data.clicks,
          spend: data.cost,
          sales14d: data.sales,
          orders14d: data.orders,
          updatedAt: new Date(),
        },
      })
      daysProcessed++
    }

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
      status: 'COMPLETED',
      daysProcessed,
      totalRows: reportData.length,
      dates: Object.keys(dataByDate),
      sample: reportData.slice(0, 3),
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

