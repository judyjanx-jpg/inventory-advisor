// app/api/amazon-ads/status/route.ts
// Check Amazon Ads API connection status

import { NextResponse } from 'next/server'
import { getAdsCredentials, getAdsProfiles } from '@/lib/amazon-ads-api'

export async function GET() {
  try {
    const credentials = await getAdsCredentials()

    if (!credentials) {
      return NextResponse.json({
        connected: false,
        message: 'Amazon Ads API not connected',
      })
    }

    // Try to fetch profiles to verify connection works
    try {
      const profiles = await getAdsProfiles()
      const activeProfile = profiles.find(p => p.profileId.toString() === credentials.profileId)

      return NextResponse.json({
        connected: true,
        profileId: credentials.profileId,
        profileName: activeProfile?.accountInfo.name || 'Unknown',
        profileType: activeProfile?.accountInfo.type || 'Unknown',
        marketplace: activeProfile?.accountInfo.marketplaceStringId || 'Unknown',
        totalProfiles: profiles.length,
      })
    } catch (apiError: any) {
      // Token might be expired or invalid
      return NextResponse.json({
        connected: false,
        message: `Connection error: ${apiError.message}`,
        needsReauth: true,
      })
    }

  } catch (error: any) {
    return NextResponse.json(
      { connected: false, error: error.message },
      { status: 500 }
    )
  }
}
