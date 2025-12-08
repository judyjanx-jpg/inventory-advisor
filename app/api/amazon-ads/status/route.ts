// app/api/amazon-ads/status/route.ts
// Check Amazon Ads API connection status and campaign info

import { NextRequest, NextResponse } from 'next/server'
import { getAdsCredentials, getAdsProfiles, saveAdsCredentials } from '@/lib/amazon-ads-api'

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

      // List all profiles for user to see
      const allProfiles = profiles.map(p => ({
        profileId: p.profileId.toString(),
        name: p.accountInfo.name,
        type: p.accountInfo.type,
        countryCode: p.countryCode,
        marketplace: p.accountInfo.marketplaceStringId,
        isActive: p.profileId.toString() === credentials.profileId,
      }))

      return NextResponse.json({
        connected: true,
        profileId: credentials.profileId,
        profileName: activeProfile?.accountInfo.name || 'Unknown',
        profileType: activeProfile?.accountInfo.type || 'Unknown',
        marketplace: activeProfile?.accountInfo.marketplaceStringId || 'Unknown',
        countryCode: activeProfile?.countryCode || 'Unknown',
        totalProfiles: profiles.length,
        allProfiles,
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

// POST - Switch to a different profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { profileId } = body

    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
    }

    const credentials = await getAdsCredentials()
    if (!credentials) {
      return NextResponse.json({ error: 'Not connected to Amazon Ads' }, { status: 400 })
    }

    // Verify the profile exists
    const profiles = await getAdsProfiles()
    const targetProfile = profiles.find(p => p.profileId.toString() === profileId)

    if (!targetProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Update credentials with new profile ID
    credentials.profileId = profileId
    await saveAdsCredentials(credentials)

    return NextResponse.json({
      success: true,
      message: `Switched to profile: ${targetProfile.accountInfo.name} (${targetProfile.countryCode})`,
      profile: {
        profileId: targetProfile.profileId.toString(),
        name: targetProfile.accountInfo.name,
        countryCode: targetProfile.countryCode,
      }
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
