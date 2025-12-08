// app/api/amazon-ads/status/route.ts
// Check Amazon Ads API connection status and campaign info

import { NextResponse } from 'next/server'
import { getAdsCredentials, getAdsProfiles, adsApiRequest } from '@/lib/amazon-ads-api'

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

      // Try to get campaign count
      let campaignInfo = null
      try {
        // Use the campaigns endpoint to check if there are any campaigns
        const campaigns = await adsApiRequest<any[]>('/sp/campaigns/list', {
          method: 'POST',
          profileId: credentials.profileId,
          body: {
            maxResults: 100,
          }
        })
        campaignInfo = {
          totalCampaigns: campaigns?.length || 0,
          campaigns: campaigns?.slice(0, 5).map((c: any) => ({
            name: c.name,
            state: c.state,
            budget: c.budget?.budget,
          })) || []
        }
      } catch (campError: any) {
        campaignInfo = { error: campError.message }
      }

      return NextResponse.json({
        connected: true,
        profileId: credentials.profileId,
        profileName: activeProfile?.accountInfo.name || 'Unknown',
        profileType: activeProfile?.accountInfo.type || 'Unknown',
        marketplace: activeProfile?.accountInfo.marketplaceStringId || 'Unknown',
        countryCode: activeProfile?.countryCode || 'Unknown',
        totalProfiles: profiles.length,
        campaignInfo,
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
