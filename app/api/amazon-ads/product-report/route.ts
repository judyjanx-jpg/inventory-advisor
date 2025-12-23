// app/api/amazon-ads/product-report/route.ts
// Try Advertised Product report instead of Campaign report
// This gives product-level data which is more useful for inventory

import { NextRequest, NextResponse } from 'next/server'
import { getAdsCredentials } from '@/lib/amazon-ads-api'
import { gunzipSync } from 'zlib'

const ADS_API_BASE = 'https://advertising-api.amazon.com'

export async function GET(request: NextRequest) {
  try {
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.accessToken) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '1')
    
    const endDate = new Date()
    endDate.setDate(endDate.getDate() - 1)
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days + 1)
    
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Try spAdvertisedProduct - gives ASIN-level data
    const reportConfig = {
      name: `ProductReport_${Date.now()}`,
      startDate: startDateStr,
      endDate: endDateStr,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["advertiser"],  // Try different groupBy
        columns: [
          "advertisedAsin",
          "advertisedSku",
          "impressions",
          "clicks",
          "spend",
          "sales14d",
          "unitsSoldClicks14d"
        ],
        reportTypeId: "spAdvertisedProduct",
        timeUnit: "SUMMARY",
        format: "GZIP_JSON"
      }
    }

    console.log('[Product-Report] Config:', JSON.stringify(reportConfig, null, 2))

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
    console.log('[Product-Report] Response:', response.status, responseText)

    if (response.status === 425) {
      const match = responseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
      return NextResponse.json({
        success: true,
        reportId: match ? match[1] : null,
        message: 'Using existing report',
        isDuplicate: true,
      })
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
    })

  } catch (error: any) {
    console.error('[Product-Report] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Check status and download
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const reportId = body.reportId

    if (!reportId) {
      return NextResponse.json({ error: 'reportId required' }, { status: 400 })
    }

    // Validate reportId to prevent SSRF/path manipulation
    if (typeof reportId !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(reportId)) {
      return NextResponse.json({ error: 'Invalid reportId format' }, { status: 400 })
    }

    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.accessToken) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

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
      return NextResponse.json({ error: errorText }, { status: statusResponse.status })
    }

    const status = await statusResponse.json()

    if (status.status !== 'COMPLETED') {
      return NextResponse.json({
        reportId,
        status: status.status,
        failureReason: status.failureReason,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
      })
    }

    // Validate download URL to prevent SSRF
    let downloadUrl: URL
    try {
      downloadUrl = new URL(status.url)
    } catch {
      return NextResponse.json({
        reportId,
        status: 'COMPLETED',
        error: 'Invalid download URL format',
      })
    }

    const isAmazonDomain =
      downloadUrl.hostname.endsWith('.amazon.com') ||
      downloadUrl.hostname.endsWith('.amazonaws.com') ||
      downloadUrl.hostname.endsWith('.cloudfront.net')

    if (downloadUrl.protocol !== 'https:' || !isAmazonDomain) {
      return NextResponse.json({
        reportId,
        status: 'COMPLETED',
        error: 'Untrusted download URL host',
      })
    }

    // Download and decompress
    const downloadResponse = await fetch(downloadUrl.toString())
    const gzipBuffer = await downloadResponse.arrayBuffer()
    const jsonBuffer = gunzipSync(Buffer.from(gzipBuffer))
    const reportData = JSON.parse(jsonBuffer.toString('utf-8'))

    return NextResponse.json({
      reportId,
      status: 'COMPLETED',
      totalRows: Array.isArray(reportData) ? reportData.length : 0,
      data: Array.isArray(reportData) ? reportData.slice(0, 50) : reportData,
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

