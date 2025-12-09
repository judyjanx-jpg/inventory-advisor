// app/api/amazon-ads/test-simple-report/route.ts
// Create a minimal test report to diagnose PENDING issue

import { NextResponse } from 'next/server'
import { getAdsCredentials, adsApiRequest } from '@/lib/amazon-ads-api'

export async function GET() {
  try {
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    const profileId = credentials.profileId
    
    // Try the simplest possible report configuration
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]
    
    // Minimal report - just impressions, SUMMARY time unit, ENABLED campaigns only
    const minimalReport = {
      name: `Minimal Test ${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: 'SPONSORED_PRODUCTS',
        groupBy: ['campaign'],
        columns: ['impressions', 'clicks', 'spend'],
        reportTypeId: 'spCampaigns',
        timeUnit: 'SUMMARY',
        format: 'GZIP_JSON',
        filters: [
          {
            field: 'campaignStatus',
            values: ['ENABLED']
          }
        ]
      }
    }

    console.log('Creating minimal report:', JSON.stringify(minimalReport))

    const response = await adsApiRequest<any>('/reporting/reports', {
      method: 'POST',
      profileId,
      body: minimalReport,
    })

    return NextResponse.json({
      success: true,
      reportId: response.reportId,
      status: response.status,
      message: 'Minimal report created. Check status in a few seconds.',
      config: minimalReport,
    })

  } catch (error: any) {
    // Check for 425 duplicate error and extract report ID
    if (error.message.includes('425') && error.message.includes('duplicate')) {
      const match = error.message.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
      if (match) {
        return NextResponse.json({
          success: true,
          reportId: match[1],
          status: 'EXISTING',
          message: 'Using existing report from 425 response',
        })
      }
    }
    
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
    }, { status: 500 })
  }
}

