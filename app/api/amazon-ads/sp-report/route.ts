// app/api/amazon-ads/sp-report/route.ts
// Clean, minimal Sponsored Products report - optimized for fast processing

import { NextRequest, NextResponse } from 'next/server'
import { getAdsCredentials } from '@/lib/amazon-ads-api'
import { gunzipSync } from 'zlib'

const ADS_API_BASE = 'https://advertising-api.amazon.com'

// GET: Request a new Sponsored Products report
export async function GET(request: NextRequest) {
  try {
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.accessToken) {
      return NextResponse.json({ error: 'Not connected to Amazon Ads' }, { status: 400 })
    }

    // Get date range from query params, default to last 7 days
    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '7')
    
    const endDate = new Date()
    endDate.setDate(endDate.getDate() - 1) // Yesterday
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days + 1)
    
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Minimal, fast-processing Sponsored Products config
    const reportConfig = {
      name: `SP_Report_${Date.now()}`,
      startDate: startDateStr,
      endDate: endDateStr,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: [
          "date",
          "campaignName",
          "campaignId", 
          "campaignStatus",
          "campaignBudgetAmount",
          "impressions",
          "clicks",
          "cost",
          "purchases14d",
          "sales14d",
          "unitsSoldClicks14d"
        ],
        reportTypeId: "spCampaigns",
        timeUnit: "DAILY",
        format: "GZIP_JSON",
        filters: [
          {
            field: "campaignStatus",
            values: ["ENABLED"]
          }
        ]
      }
    }

    console.log('[SP-Report] Requesting report:', JSON.stringify(reportConfig, null, 2))

    const response = await fetch(`${ADS_API_BASE}/reporting/reports`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
        'Amazon-Advertising-API-Scope': credentials.profileId,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.createasyncreport.v3+json',
      },
      body: JSON.stringify(reportConfig),
    })

    const responseText = await response.text()
    console.log('[SP-Report] Response:', response.status, responseText)

    // Handle duplicate report (425)
    if (response.status === 425) {
      const match = responseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
      if (match) {
        return NextResponse.json({
          success: true,
          reportId: match[1],
          message: 'Using existing report',
          checkUrl: `/api/amazon-ads/sp-report?reportId=${match[1]}`,
        })
      }
    }

    if (!response.ok) {
      return NextResponse.json({
        error: `API error ${response.status}`,
        details: responseText,
      }, { status: response.status })
    }

    const data = JSON.parse(responseText)

    return NextResponse.json({
      success: true,
      reportId: data.reportId,
      status: data.status,
      dateRange: { startDate: startDateStr, endDate: endDateStr },
      checkUrl: `/api/amazon-ads/sp-report?reportId=${data.reportId}`,
      message: 'Report requested. Poll the checkUrl or POST with reportId to get status/data.',
    })

  } catch (error: any) {
    console.error('[SP-Report] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Check status and download data for a report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const reportId = body.reportId

    if (!reportId) {
      return NextResponse.json({ error: 'reportId required in body' }, { status: 400 })
    }

    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.accessToken) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    // Check report status
    const statusResponse = await fetch(`${ADS_API_BASE}/reporting/reports/${reportId}`, {
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
        'Amazon-Advertising-API-Scope': credentials.profileId,
        'Accept': 'application/json',
      },
    })

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text()
      return NextResponse.json({
        error: `Status check failed: ${statusResponse.status}`,
        details: errorText,
      }, { status: statusResponse.status })
    }

    const status = await statusResponse.json()
    console.log('[SP-Report] Status:', JSON.stringify(status, null, 2))

    // If not completed, return status
    if (status.status !== 'COMPLETED') {
      return NextResponse.json({
        reportId,
        status: status.status,
        failureReason: status.failureReason || null,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
        message: status.status === 'PENDING' 
          ? 'Report still processing. Try again in 1-2 minutes.' 
          : `Report status: ${status.status}`,
      })
    }

    // Report completed - download the data
    if (!status.url) {
      return NextResponse.json({
        reportId,
        status: 'COMPLETED',
        error: 'No download URL in response',
        rawStatus: status,
      })
    }

    console.log('[SP-Report] Downloading from:', status.url)

    const downloadResponse = await fetch(status.url)
    if (!downloadResponse.ok) {
      return NextResponse.json({
        reportId,
        status: 'COMPLETED',
        error: `Download failed: ${downloadResponse.status}`,
      })
    }

    // Decompress GZIP data
    const gzipBuffer = await downloadResponse.arrayBuffer()
    const jsonBuffer = gunzipSync(Buffer.from(gzipBuffer))
    const reportData = JSON.parse(jsonBuffer.toString('utf-8'))

    // Calculate summary stats
    const campaigns = Array.isArray(reportData) ? reportData : []
    const summary = {
      totalCampaigns: campaigns.length,
      totalImpressions: campaigns.reduce((sum: number, c: any) => sum + (c.impressions || 0), 0),
      totalClicks: campaigns.reduce((sum: number, c: any) => sum + (c.clicks || 0), 0),
      totalCost: campaigns.reduce((sum: number, c: any) => sum + (parseFloat(c.cost) || 0), 0),
      totalSales: campaigns.reduce((sum: number, c: any) => sum + (parseFloat(c.sales14d) || 0), 0),
      totalUnits: campaigns.reduce((sum: number, c: any) => sum + (c.unitsSoldClicks14d || 0), 0),
    }

    return NextResponse.json({
      reportId,
      status: 'COMPLETED',
      summary,
      data: campaigns.slice(0, 50), // Return first 50 rows
      totalRows: campaigns.length,
      message: campaigns.length > 50 ? `Showing first 50 of ${campaigns.length} rows` : 'All data returned',
    })

  } catch (error: any) {
    console.error('[SP-Report] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

