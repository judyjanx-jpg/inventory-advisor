// app/api/amazon-ads/sync/route.ts
// Sync advertising data from Amazon Ads API

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  getAdsCredentials,
  requestSpReport,
  waitForReportAndDownload,
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
    const dates: string[] = []
    const endDate = new Date()
    endDate.setDate(endDate.getDate() - 1)  // Yesterday (today's data not ready)

    for (let i = 0; i < days; i++) {
      const date = new Date(endDate)
      date.setDate(date.getDate() - i)
      dates.push(date.toISOString().split('T')[0])
    }

    console.log(`Syncing ${dates.length} days of ad data...`)

    for (const date of dates) {
      try {
        console.log(`Processing ${date}...`)

        // Request Sponsored Products campaign report
        const reportRequest = await requestSpReport(profileId, date, 'campaigns', [
          'impressions',
          'clicks',
          'cost',
          'attributedConversions14d',
          'attributedSales14d',
          'attributedUnitsOrdered14d',
        ])

        // Wait for report and download
        const reportData = await waitForReportAndDownload(reportRequest.reportId, profileId)

        // Aggregate data for the day
        let totalImpressions = 0
        let totalClicks = 0
        let totalCost = 0
        let totalSales = 0
        let totalOrders = 0
        let totalUnits = 0

        for (const row of reportData) {
          totalImpressions += row.impressions || 0
          totalClicks += row.clicks || 0
          totalCost += row.cost || 0
          totalSales += row.attributedSales14d || 0
          totalOrders += row.attributedConversions14d || 0
          totalUnits += row.attributedUnitsOrdered14d || 0
        }

        // Upsert daily advertising summary
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
            impressions: totalImpressions,
            clicks: totalClicks,
            spend: totalCost,
            sales14d: totalSales,
            orders14d: totalOrders,
            unitsSold14d: totalUnits,
          },
          update: {
            impressions: totalImpressions,
            clicks: totalClicks,
            spend: totalCost,
            sales14d: totalSales,
            orders14d: totalOrders,
            unitsSold14d: totalUnits,
            updatedAt: new Date(),
          },
        })

        results.daysProcessed++
        results.recordsSynced += reportData.length

        console.log(`  ✓ ${date}: ${reportData.length} campaigns, $${totalCost.toFixed(2)} spend`)

      } catch (error: any) {
        console.error(`  ✗ ${date}: ${error.message}`)
        results.errors.push(`${date}: ${error.message}`)
      }

      // Rate limiting - 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000))
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
