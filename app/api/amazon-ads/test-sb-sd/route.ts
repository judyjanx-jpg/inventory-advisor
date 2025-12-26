// app/api/amazon-ads/test-sb-sd/route.ts
// Test SB and SD report requests specifically

import { NextResponse } from 'next/server'
import { getAdsCredentials, getValidAccessToken } from '@/lib/amazon-ads-api'

const ADS_API_BASE = 'https://advertising-api.amazon.com'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const credentials = await getAdsCredentials()
    if (!credentials?.profileId) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    // Get fresh token
    const accessToken = await getValidAccessToken()

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
      'Amazon-Advertising-API-Scope': credentials.profileId,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.createasyncreport.v3+json',
    }

    const results: any = {
      date: dateStr,
      profileId: credentials.profileId,
      tests: []
    }

    // Test 1: Sponsored Brands Campaign Report
    const sbConfig = {
      name: `Debug_SB_Campaign_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: 'SPONSORED_BRANDS',
        groupBy: ['campaign'],
        columns: [
          'campaignName',
          'campaignId',
          'campaignStatus',
          'campaignBudgetAmount',
          'campaignBudgetType',
          'impressions',
          'clicks',
          'cost',
          'purchases14d',
          'sales14d',
          'unitsSoldClicks14d',
        ],
        reportTypeId: 'sbCampaigns',
        timeUnit: 'SUMMARY',
        format: 'GZIP_JSON',
      },
    }

    try {
      const sbResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sbConfig),
      })

      const sbText = await sbResponse.text()
      results.tests.push({
        name: 'Sponsored Brands (sbCampaigns)',
        status: sbResponse.status,
        statusText: sbResponse.statusText,
        response: sbText.substring(0, 1000),
        config: sbConfig.configuration,
      })
    } catch (e: any) {
      results.tests.push({
        name: 'Sponsored Brands (sbCampaigns)',
        error: e.message,
      })
    }

    // Test 2: Sponsored Display Campaign Report
    const sdConfig = {
      name: `Debug_SD_Campaign_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: 'SPONSORED_DISPLAY',
        groupBy: ['campaign'],
        columns: [
          'campaignName',
          'campaignId',
          'campaignStatus',
          'campaignBudgetAmount',
          'campaignBudgetType',
          'impressions',
          'clicks',
          'cost',
          'purchases14d',
          'sales14d',
          'unitsSoldClicks14d',
        ],
        reportTypeId: 'sdCampaigns',
        timeUnit: 'SUMMARY',
        format: 'GZIP_JSON',
      },
    }

    try {
      const sdResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sdConfig),
      })

      const sdText = await sdResponse.text()
      results.tests.push({
        name: 'Sponsored Display (sdCampaigns)',
        status: sdResponse.status,
        statusText: sdResponse.statusText,
        response: sdText.substring(0, 1000),
        config: sdConfig.configuration,
      })
    } catch (e: any) {
      results.tests.push({
        name: 'Sponsored Display (sdCampaigns)',
        error: e.message,
      })
    }

    // Test 3: Try SB with different reportTypeId (hsa)
    const sbHsaConfig = {
      name: `Debug_SB_HSA_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: 'SPONSORED_BRANDS',
        groupBy: ['campaign'],
        columns: [
          'campaignName',
          'campaignId',
          'impressions',
          'clicks',
          'cost',
        ],
        reportTypeId: 'hsa',  // Try legacy reportTypeId
        timeUnit: 'SUMMARY',
        format: 'GZIP_JSON',
      },
    }

    try {
      const sbHsaResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sbHsaConfig),
      })

      const sbHsaText = await sbHsaResponse.text()
      results.tests.push({
        name: 'Sponsored Brands (hsa legacy)',
        status: sbHsaResponse.status,
        statusText: sbHsaResponse.statusText,
        response: sbHsaText.substring(0, 1000),
      })
    } catch (e: any) {
      results.tests.push({
        name: 'Sponsored Brands (hsa legacy)',
        error: e.message,
      })
    }

    // Test 4: Try SD with different columns (minimal)
    const sdMinimalConfig = {
      name: `Debug_SD_Minimal_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: 'SPONSORED_DISPLAY',
        groupBy: ['campaign'],
        columns: [
          'campaignId',
          'impressions',
          'clicks',
          'cost',
        ],
        reportTypeId: 'sdCampaigns',
        timeUnit: 'SUMMARY',
        format: 'GZIP_JSON',
      },
    }

    try {
      const sdMinimalResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sdMinimalConfig),
      })

      const sdMinimalText = await sdMinimalResponse.text()
      results.tests.push({
        name: 'Sponsored Display (minimal columns)',
        status: sdMinimalResponse.status,
        statusText: sdMinimalResponse.statusText,
        response: sdMinimalText.substring(0, 1000),
      })
    } catch (e: any) {
      results.tests.push({
        name: 'Sponsored Display (minimal columns)',
        error: e.message,
      })
    }

    // Test 5: SP for comparison (this should work)
    const spConfig = {
      name: `Debug_SP_Compare_${Date.now()}`,
      startDate: dateStr,
      endDate: dateStr,
      configuration: {
        adProduct: 'SPONSORED_PRODUCTS',
        groupBy: ['campaign'],
        columns: [
          'campaignName',
          'campaignId',
          'impressions',
          'clicks',
          'cost',
        ],
        reportTypeId: 'spCampaigns',
        timeUnit: 'SUMMARY',
        format: 'GZIP_JSON',
      },
    }

    try {
      const spResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify(spConfig),
      })

      const spText = await spResponse.text()
      results.tests.push({
        name: 'Sponsored Products (for comparison)',
        status: spResponse.status,
        statusText: spResponse.statusText,
        response: spText.substring(0, 500),
      })
    } catch (e: any) {
      results.tests.push({
        name: 'Sponsored Products (for comparison)',
        error: e.message,
      })
    }

    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

