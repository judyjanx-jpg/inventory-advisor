// app/api/amazon-ads/test/route.ts
// Test endpoint to debug Amazon Ads API issues

import { NextResponse } from 'next/server'
import { getAdsCredentials, adsApiRequest } from '@/lib/amazon-ads-api'

export async function GET() {
  try {
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    const profileId = credentials.profileId
    const results: any = {
      profileId,
      campaigns: null,
      testReport: null,
    }

    // Try to list SP campaigns using V3 API
    try {
      const campaignsResponse = await adsApiRequest<any>('/sp/campaigns/list', {
        method: 'POST',
        profileId,
        body: {
          stateFilter: {
            include: ['ENABLED', 'PAUSED', 'ARCHIVED']
          },
          maxResults: 10
        }
      })

      results.campaigns = {
        count: Array.isArray(campaignsResponse) ? campaignsResponse.length :
               campaignsResponse?.campaigns?.length || 0,
        data: Array.isArray(campaignsResponse) ?
              campaignsResponse.slice(0, 3) :
              campaignsResponse?.campaigns?.slice(0, 3) || campaignsResponse
      }
    } catch (e: any) {
      results.campaigns = { error: e.message }
    }

    // Try requesting a very simple 1-day report
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateStr = yesterday.toISOString().split('T')[0]

      const reportResponse = await adsApiRequest<any>('/reporting/reports', {
        method: 'POST',
        profileId,
        body: {
          name: `Test Report ${dateStr}`,
          startDate: dateStr,
          endDate: dateStr,
          configuration: {
            adProduct: 'SPONSORED_PRODUCTS',
            groupBy: ['campaign'],
            columns: ['impressions', 'clicks', 'spend'],
            reportTypeId: 'spCampaigns',
            timeUnit: 'SUMMARY',
            format: 'JSON'  // Try JSON instead of GZIP_JSON
          }
        }
      })

      results.testReport = {
        reportId: reportResponse.reportId,
        status: reportResponse.status,
        message: 'Report created - check /api/amazon-ads/test?reportId=' + reportResponse.reportId
      }
    } catch (e: any) {
      results.testReport = { error: e.message }
    }

    return NextResponse.json(results)

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
