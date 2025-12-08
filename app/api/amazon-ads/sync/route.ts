// app/api/amazon-ads/sync/route.ts
// Sync advertising data from Amazon Ads API (V3 Reporting API)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getAdsCredentials,
  requestSpReportV3,
  waitForReportAndDownloadV3,
} from '@/lib/amazon-ads-api'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const days = body.days || 30  // Default to last 30 days

    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json(
        { error: 'Amazon Ads API not connected' },
        { status: 400 }
      )
    }

    const profileId = credentials.profileId
    const results = {
      daysProcessed: 0,
      recordsSynced: 0,
      errors: [] as string[],
    }

    // Generate date range
    const endDate = new Date()
    endDate.setDate(endDate.getDate() - 1)  // Yesterday (today's data not ready)

    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days + 1)

    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    console.log(`Syncing ad data from ${startDateStr} to ${endDateStr} (${days} days)...`)

    try {
      // Request a single report for the entire date range (more efficient)
      console.log('Requesting Sponsored Products report...')
      const reportRequest = await requestSpReportV3(profileId, startDateStr, endDateStr)
      console.log(`Report requested: ${reportRequest.reportId}`)

      // Wait for report and download
      console.log('Waiting for report to complete...')
      const reportData = await waitForReportAndDownloadV3(reportRequest.reportId, profileId)
      console.log(`Report downloaded: ${reportData.length} rows`)

      // Group data by date
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
        // V3 API returns data with 'date' field
        const rowDate = row.date || startDateStr

        if (!dataByDate[rowDate]) {
          dataByDate[rowDate] = {
            impressions: 0,
            clicks: 0,
            cost: 0,
            sales: 0,
            orders: 0,
            units: 0,
            campaigns: 0,
          }
        }

        // V3 API field names (use spend or cost, whichever is available)
        dataByDate[rowDate].impressions += Number(row.impressions) || 0
        dataByDate[rowDate].clicks += Number(row.clicks) || 0
        dataByDate[rowDate].cost += Number(row.spend) || Number(row.cost) || 0
        dataByDate[rowDate].sales += Number(row.sales14d) || 0
        dataByDate[rowDate].orders += Number(row.purchases14d) || 0
        dataByDate[rowDate].units += Number(row.unitsSoldClicks14d) || 0
        dataByDate[rowDate].campaigns++
      }

      // Upsert each day's data
      for (const [date, data] of Object.entries(dataByDate)) {
        await prisma.advertisingDaily.upsert({
          where: {
            date_campaignType: {
              date: new Date(date),
              campaignType: 'SP',  // Sponsored Products
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

        results.daysProcessed++
        console.log(`  ✓ ${date}: ${data.campaigns} campaigns, $${data.cost.toFixed(2)} spend`)
      }

      results.recordsSynced = reportData.length

    } catch (error: any) {
      console.error(`Sync error: ${error.message}`)
      results.errors.push(error.message)
    }

    // Update sync status
    await prisma.apiConnection.updateMany({
      where: { platform: 'amazon_ads' },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: results.errors.length === 0 ? 'success' : 'partial',
        lastSyncError: results.errors.length > 0 ? results.errors.join('; ') : null,
      },
    })

    return NextResponse.json({
      success: true,
      ...results,
    })

  } catch (error: any) {
    console.error('Ads sync error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// GET - Check sync status
export async function GET() {
  try {
    const connection = await prisma.apiConnection.findFirst({
      where: { platform: 'amazon_ads' },
      select: {
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncError: true,
      },
    })

    // Get latest data date
    const latestData = await prisma.advertisingDaily.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true },
    })

    // Get total records
    const totalRecords = await prisma.advertisingDaily.count()

    return NextResponse.json({
      lastSync: connection?.lastSyncAt,
      lastStatus: connection?.lastSyncStatus,
      lastError: connection?.lastSyncError,
      latestDataDate: latestData?.date,
      totalRecords,
    })

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
