// app/api/amazon-ads/profiles/route.ts
// List all advertising profiles and check which one we're using

import { NextRequest, NextResponse } from 'next/server'
import { getAdsCredentials } from '@/lib/amazon-ads-api'

const ADS_API_BASE = 'https://advertising-api.amazon.com'

export async function GET(request: NextRequest) {
  try {
    const credentials = await getAdsCredentials()
    if (!credentials?.accessToken) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    // Get all profiles - this doesn't require a scope header
    const response = await fetch(`${ADS_API_BASE}/v2/profiles`, {
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ 
        error: `Failed to get profiles: ${response.status}`,
        details: error,
      }, { status: response.status })
    }

    const profiles = await response.json()

    return NextResponse.json({
      currentProfileId: credentials.profileId,
      profileCount: profiles.length,
      profiles: profiles.map((p: any) => ({
        profileId: p.profileId?.toString(),
        countryCode: p.countryCode,
        currencyCode: p.currencyCode,
        timezone: p.timezone,
        accountType: p.accountInfo?.type,
        accountName: p.accountInfo?.name,
        marketplaceId: p.accountInfo?.marketplaceStringId,
        isCurrent: p.profileId?.toString() === credentials.profileId,
      })),
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Switch to a different profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const newProfileId = body.profileId

    if (!newProfileId) {
      return NextResponse.json({ error: 'profileId required' }, { status: 400 })
    }

    const credentials = await getAdsCredentials()
    if (!credentials) {
      return NextResponse.json({ error: 'Not connected' }, { status: 400 })
    }

    // Update the stored profile ID
    const { saveAdsCredentials } = await import('@/lib/amazon-ads-api')
    credentials.profileId = newProfileId.toString()
    await saveAdsCredentials(credentials)

    return NextResponse.json({
      success: true,
      newProfileId: credentials.profileId,
      message: 'Profile switched. Try requesting a new report.',
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

