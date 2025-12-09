// app/api/amazon-ads/docs-report/route.ts
// Create report using EXACT Amazon V3 docs configuration

import { NextRequest, NextResponse } from 'next/server'
import { getAdsCredentials } from '@/lib/amazon-ads-api'

const ADS_API_BASE = 'https://advertising-api.amazon.com'

export async function GET(request: NextRequest) {
  try {
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.accessToken) {
      return NextResponse.json({ error: 'Not connected or no token' }, { status: 400 })
    }

    // Get yesterday's date
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]

    // EXACT config from Amazon V3 docs for SP Campaigns
    // https://advertising.amazon.com/API/docs/en-us/reporting/v3/report-types#sponsored-products-campaigns
    const reportConfig = {
      name: `DocTest_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: [
          "impressions",
          "clicks", 
          "cost"  // Using 'cost' instead of 'spend' per some docs
        ],
        reportTypeId: "spCampaigns",
        timeUnit: "SUMMARY",
        format: "GZIP_JSON"
      }
    }

    console.log('Request config:', JSON.stringify(reportConfig, null, 2))

    // Make request with detailed logging
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
      'Amazon-Advertising-API-Scope': credentials.profileId,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.createasyncreport.v3+json',
    }

    console.log('Headers:', JSON.stringify(headers, null, 2))

    const response = await fetch(`${ADS_API_BASE}/reporting/reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify(reportConfig),
    })

    const responseText = await response.text()
    console.log('Response status:', response.status)
    console.log('Response body:', responseText)

    if (!response.ok) {
      // Check for 425 duplicate
      if (response.status === 425) {
        const match = responseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
        return NextResponse.json({
          status: 425,
          message: 'Duplicate report',
          existingReportId: match ? match[1] : null,
          rawResponse: responseText,
        })
      }
      
      return NextResponse.json({
        error: `API error ${response.status}`,
        rawResponse: responseText,
        headers: Object.fromEntries(response.headers.entries()),
      }, { status: response.status })
    }

    const data = JSON.parse(responseText)

    return NextResponse.json({
      success: true,
      reportId: data.reportId,
      status: data.status,
      config: reportConfig,
      rawResponse: data,
      checkUrl: `/api/amazon-ads/check-report?reportId=${data.reportId}`,
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
    }, { status: 500 })
  }
}

// Also add a direct status check with full response logging
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const reportId = body.reportId

    if (!reportId) {
      return NextResponse.json({ error: 'reportId required' }, { status: 400 })
    }

    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.accessToken) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
      'Amazon-Advertising-API-Scope': credentials.profileId,
      'Accept': 'application/json',
    }

    const response = await fetch(`${ADS_API_BASE}/reporting/reports/${reportId}`, {
      method: 'GET',
      headers,
    })

    const responseText = await response.text()
    
    return NextResponse.json({
      httpStatus: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseText,
      parsed: response.ok ? JSON.parse(responseText) : null,
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

