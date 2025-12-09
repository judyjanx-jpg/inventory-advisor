// app/api/amazon-ads/debug-reports/route.ts
// Test multiple report configurations to find what works

import { NextRequest, NextResponse } from 'next/server'
import { getAdsCredentials } from '@/lib/amazon-ads-api'

const ADS_API_BASE = 'https://advertising-api.amazon.com'

export async function GET(request: NextRequest) {
  try {
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.accessToken) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]

    const headers = {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
      'Amazon-Advertising-API-Scope': credentials.profileId,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.createasyncreport.v3+json',
    }

    const results: any[] = []

    // Test 1: Absolute minimal SP - no filter, SUMMARY
    const config1 = {
      name: `Test1_Minimal_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: ["impressions", "clicks", "cost"],
        reportTypeId: "spCampaigns",
        timeUnit: "SUMMARY",
        format: "GZIP_JSON"
      }
    }

    // Test 2: SP with 'spend' instead of 'cost'
    const config2 = {
      name: `Test2_Spend_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: ["impressions", "clicks", "spend"],
        reportTypeId: "spCampaigns",
        timeUnit: "SUMMARY",
        format: "GZIP_JSON"
      }
    }

    // Test 3: Sponsored Display (this seemed to work before)
    const config3 = {
      name: `Test3_SD_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: "SPONSORED_DISPLAY",
        groupBy: ["campaign"],
        columns: ["impressions", "clicks", "cost"],
        reportTypeId: "sdCampaigns",
        timeUnit: "SUMMARY",
        format: "GZIP_JSON"
      }
    }

    // Test 4: SP with campaignName (maybe required?)
    const config4 = {
      name: `Test4_WithName_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: "SPONSORED_PRODUCTS",
        groupBy: ["campaign"],
        columns: ["campaignName", "impressions", "clicks", "cost"],
        reportTypeId: "spCampaigns",
        timeUnit: "SUMMARY",
        format: "GZIP_JSON"
      }
    }

    const configs = [
      { name: "Minimal SP (cost)", config: config1 },
      { name: "SP with spend", config: config2 },
      { name: "Sponsored Display", config: config3 },
      { name: "SP with campaignName", config: config4 },
    ]

    for (const { name, config } of configs) {
      try {
        const response = await fetch(`${ADS_API_BASE}/reporting/reports`, {
          method: 'POST',
          headers,
          body: JSON.stringify(config),
        })

        const text = await response.text()
        
        if (response.status === 425) {
          const match = text.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
          results.push({
            test: name,
            status: 425,
            message: "Duplicate - report exists",
            reportId: match ? match[1] : null,
          })
        } else if (response.ok) {
          const data = JSON.parse(text)
          results.push({
            test: name,
            status: response.status,
            reportId: data.reportId,
            reportStatus: data.status,
          })
        } else {
          results.push({
            test: name,
            status: response.status,
            error: text.substring(0, 500),
          })
        }
      } catch (e: any) {
        results.push({
          test: name,
          error: e.message,
        })
      }
    }

    return NextResponse.json({
      date: dateStr,
      results,
      message: "Check each reportId status in 2-5 minutes using POST to /api/amazon-ads/sp-report",
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

