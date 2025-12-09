// app/api/amazon-ads/sync/route.ts
// Async sync for advertising data - handles serverless timeouts
// Call POST multiple times: first creates report, subsequent calls check/download

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getAdsCredentials,
  requestSpReportV3,
  getReportStatusV3,
  downloadReport,
} from '@/lib/amazon-ads-api'

// Store pending report info in the API connection's metadata
interface PendingReport {
  reportId: string
  profileId: string
  startDate: string
  endDate: string
  requestedAt: string
}

async function getPendingReport(): Promise<PendingReport | null> {
  const connection = await prisma.apiConnection.findFirst({
    where: { platform: 'amazon_ads' },
  })
  
  if (!connection?.lastSyncError?.startsWith('PENDING:')) {
    return null
  }
  
  try {
    return JSON.parse(connection.lastSyncError.replace('PENDING:', ''))
  } catch {
    return null
  }
}

async function savePendingReport(report: PendingReport | null): Promise<void> {
  await prisma.apiConnection.updateMany({
    where: { platform: 'amazon_ads' },
    data: {
      lastSyncError: report ? `PENDING:${JSON.stringify(report)}` : null,
      lastSyncStatus: report ? 'pending' : undefined,
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const days = body.days || 30
    const forceNew = body.forceNew || false  // Force new report even if one is pending

    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json(
        { error: 'Amazon Ads API not connected' },
        { status: 400 }
      )
    }

    const profileId = credentials.profileId

    // Check for pending report first
    const pendingReport = await getPendingReport()
    
    if (pendingReport && !forceNew) {
      console.log(`Checking pending report: ${pendingReport.reportId}`)
      
      try {
        const status = await getReportStatusV3(pendingReport.reportId, pendingReport.profileId)
        console.log(`Report status: ${status.status}`)
        
        if (status.status === 'COMPLETED' && status.url) {
          // Download and process the report
          console.log('Report ready, downloading...')
          const reportData = await downloadReport(status.url)
          console.log(`Downloaded ${reportData.length} rows`)
          
          // Process the data
          const result = await processReportData(reportData, pendingReport.startDate)
          
          // Clear pending report
          await savePendingReport(null)
          
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
            status: 'completed',
            ...result,
          })
        }
        
        if (status.status === 'FAILED') {
          await savePendingReport(null)
          
          await prisma.apiConnection.updateMany({
            where: { platform: 'amazon_ads' },
            data: {
              lastSyncAt: new Date(),
              lastSyncStatus: 'failed',
              lastSyncError: status.failureReason || 'Report generation failed',
            },
          })
          
          return NextResponse.json({
            success: false,
            status: 'failed',
            error: status.failureReason || 'Report generation failed',
          })
        }
        
        // Still pending
        const elapsedMs = Date.now() - new Date(pendingReport.requestedAt).getTime()
        const elapsedMin = Math.round(elapsedMs / 60000)
        
        return NextResponse.json({
          success: true,
          status: 'pending',
          reportId: pendingReport.reportId,
          reportStatus: status.status,
          elapsedMinutes: elapsedMin,
          message: `Report is ${status.status}. Call this endpoint again to check status. (${elapsedMin} min elapsed)`,
        })
        
      } catch (error: any) {
        console.error('Error checking report status:', error.message)
        // If we can't check status, clear pending and try new report
        await savePendingReport(null)
      }
    }

    // Request a new report
    const endDate = new Date()
    endDate.setDate(endDate.getDate() - 1)  // Yesterday
    
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days + 1)
    
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]
    
    console.log(`Requesting new report: ${startDateStr} to ${endDateStr}`)
    
    const reportRequest = await requestSpReportV3(profileId, startDateStr, endDateStr)
    console.log(`Report requested: ${reportRequest.reportId}`)
    
    // Save pending report
    await savePendingReport({
      reportId: reportRequest.reportId,
      profileId,
      startDate: startDateStr,
      endDate: endDateStr,
      requestedAt: new Date().toISOString(),
    })
    
    return NextResponse.json({
      success: true,
      status: 'requested',
      reportId: reportRequest.reportId,
      dateRange: `${startDateStr} to ${endDateStr}`,
      message: 'Report requested. Call this endpoint again in ~30 seconds to check status.',
    })

  } catch (error: any) {
    console.error('Ads sync error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// Process downloaded report data and save to database
async function processReportData(reportData: any[], fallbackDate: string): Promise<{
  daysProcessed: number
  recordsSynced: number
}> {
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
    const rowDate = row.date || fallbackDate

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

    dataByDate[rowDate].impressions += Number(row.impressions) || 0
    dataByDate[rowDate].clicks += Number(row.clicks) || 0
    dataByDate[rowDate].cost += Number(row.spend) || Number(row.cost) || 0
    dataByDate[rowDate].sales += Number(row.sales14d) || 0
    dataByDate[rowDate].orders += Number(row.purchases14d) || 0
    dataByDate[rowDate].units += Number(row.unitsSoldClicks14d) || 0
    dataByDate[rowDate].campaigns++
  }

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
    
    console.log(`  ✓ ${date}: ${data.campaigns} campaigns, $${data.cost.toFixed(2)} spend`)
    daysProcessed++
  }

  return {
    daysProcessed,
    recordsSynced: reportData.length,
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

    // Check if there's a pending report
    const pendingReport = await getPendingReport()

    // Get latest data date
    const latestData = await prisma.advertisingDaily.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true },
    })

    // Get total records
    const totalRecords = await prisma.advertisingDaily.count()
    
    // Get date range of data
    const oldestData = await prisma.advertisingDaily.findFirst({
      orderBy: { date: 'asc' },
      select: { date: true },
    })

    return NextResponse.json({
      lastSync: connection?.lastSyncAt,
      lastStatus: pendingReport ? 'pending' : connection?.lastSyncStatus,
      lastError: pendingReport ? null : connection?.lastSyncError,
      pendingReport: pendingReport ? {
        reportId: pendingReport.reportId,
        dateRange: `${pendingReport.startDate} to ${pendingReport.endDate}`,
        requestedAt: pendingReport.requestedAt,
      } : null,
      latestDataDate: latestData?.date,
      oldestDataDate: oldestData?.date,
      totalRecords,
    })

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
