// app/api/amazon-ads/check-report/route.ts
// Debug endpoint to check a specific report's status

import { NextRequest, NextResponse } from 'next/server'
import { getAdsCredentials, getReportStatusV3, downloadReport } from '@/lib/amazon-ads-api'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const reportId = request.nextUrl.searchParams.get('reportId')
    
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    if (!reportId) {
      return NextResponse.json({ error: 'reportId query param required' }, { status: 400 })
    }

    const status = await getReportStatusV3(reportId, credentials.profileId)
    
    // If completed, try to download a sample
    let sampleData = null
    if (status.status === 'COMPLETED' && status.url) {
      try {
        const data = await downloadReport(status.url)
        sampleData = {
          totalRows: data.length,
          firstRows: data.slice(0, 3),
        }
      } catch (e: any) {
        sampleData = { error: e.message }
      }
    }

    return NextResponse.json({
      reportId,
      ...status,
      sampleData,
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Save report data to database
export async function POST(request: NextRequest) {
  try {
    const reportId = request.nextUrl.searchParams.get('reportId')
    
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    if (!reportId) {
      return NextResponse.json({ error: 'reportId query param required' }, { status: 400 })
    }

    const status = await getReportStatusV3(reportId, credentials.profileId)
    
    if (status.status !== 'COMPLETED' || !status.url) {
      return NextResponse.json({
        error: 'Report not ready',
        status: status.status,
      }, { status: 400 })
    }

    // Download and process
    const reportData = await downloadReport(status.url)
    
    // Group by date
    const dataByDate: Record<string, {
      impressions: number
      clicks: number
      cost: number
      sales: number
      orders: number
      units: number
      campaigns: number
    }> = {}

    for (const row of reportData) {
      const rowDate = row.date
      if (!rowDate) continue

      if (!dataByDate[rowDate]) {
        dataByDate[rowDate] = {
          impressions: 0, clicks: 0, cost: 0, sales: 0, orders: 0, units: 0, campaigns: 0
        }
      }

      dataByDate[rowDate].impressions += Number(row.impressions) || 0
      dataByDate[rowDate].clicks += Number(row.clicks) || 0
      dataByDate[rowDate].cost += Number(row.spend) || Number(row.cost) || 0
      dataByDate[rowDate].sales += Number(row.sales14d) || 0
      dataByDate[rowDate].orders += Number(row.purchases14d) || 0
      dataByDate[rowDate].units += Number(row.unitsSoldClicks14d) || 0
      dataByDate[rowDate].campaigns++
    }

    // Upsert to database
    let daysProcessed = 0
    for (const [date, data] of Object.entries(dataByDate)) {
      await prisma.advertisingDaily.upsert({
        where: {
          date_campaignType: {
            date: new Date(date),
            campaignType: 'SP',
          },
        },
        create: {
          date: new Date(date),
          campaignType: 'SP',
          impressions: data.impressions,
          clicks: data.clicks,
          spend: data.cost,
          sales14d: data.sales,
          orders14d: data.orders,
          unitsSold14d: data.units,
        },
        update: {
          impressions: data.impressions,
          clicks: data.clicks,
          spend: data.cost,
          sales14d: data.sales,
          orders14d: data.orders,
          unitsSold14d: data.units,
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
      daysProcessed,
      recordsSynced: reportData.length,
      dates: Object.keys(dataByDate),
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

