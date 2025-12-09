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

    // Try to list ENABLED SP campaigns using V3 API
    try {
      const enabledResponse = await adsApiRequest<any>('/sp/campaigns/list', {
        method: 'POST',
        profileId,
        body: {
          stateFilter: {
            include: ['ENABLED']
          },
          maxResults: 100
        }
      })

      const campaigns = Array.isArray(enabledResponse) ? enabledResponse : 
                        enabledResponse?.campaigns || []
      
      results.enabledCampaigns = {
        count: campaigns.length,
        sample: campaigns.slice(0, 5).map((c: any) => ({
          id: c.campaignId,
          name: c.name,
          state: c.state,
          budget: c.budget?.budget,
          startDate: c.startDate,
        }))
      }
    } catch (e: any) {
      results.enabledCampaigns = { error: e.message }
    }

    // Also get ALL campaigns count
    try {
      const allResponse = await adsApiRequest<any>('/sp/campaigns/list', {
        method: 'POST',
        profileId,
        body: {
          stateFilter: {
            include: ['ENABLED', 'PAUSED', 'ARCHIVED']
          },
          maxResults: 1000
        }
      })

      const allCampaigns = Array.isArray(allResponse) ? allResponse : 
                           allResponse?.campaigns || []
      
      const byState = {
        ENABLED: allCampaigns.filter((c: any) => c.state === 'ENABLED').length,
        PAUSED: allCampaigns.filter((c: any) => c.state === 'PAUSED').length,
        ARCHIVED: allCampaigns.filter((c: any) => c.state === 'ARCHIVED').length,
      }
      
      results.allCampaigns = {
        total: allCampaigns.length,
        byState,
      }
    } catch (e: any) {
      results.allCampaigns = { error: e.message }
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
            format: 'GZIP_JSON'
          }
        }
      })

      results.testReport = {
        reportId: reportResponse.reportId,
        status: reportResponse.status,
        message: 'Report created successfully'
      }
    } catch (e: any) {
      results.testReport = { error: e.message }
    }

    return NextResponse.json(results)

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
