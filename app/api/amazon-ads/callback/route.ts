// app/api/amazon-ads/callback/route.ts
// Handles the OAuth callback from Amazon Ads API

import { NextRequest, NextResponse } from 'next/server'
import { 
  exchangeCodeForTokens, 
  saveAdsCredentials, 
  getAdsProfiles 
} from '@/lib/amazon-ads-api'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('Amazon Ads OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(errorDescription || error)}`, request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/settings?error=No authorization code received', request.url)
    )
  }

  try {
    // Exchange code for tokens
    console.log('Exchanging authorization code for tokens...')
    const { accessToken, refreshToken, expiresIn } = await exchangeCodeForTokens(code)

    // Save initial credentials
    await saveAdsCredentials({
      clientId: process.env.AMAZON_ADS_CLIENT_ID!,
      clientSecret: process.env.AMAZON_ADS_CLIENT_SECRET!,
      refreshToken,
      accessToken,
      accessTokenExpiry: Date.now() + (expiresIn * 1000),
    })

    // Get profiles to find the right one for this seller
    console.log('Fetching advertising profiles...')
    const profiles = await getAdsProfiles()

    if (profiles.length === 0) {
      return NextResponse.redirect(
        new URL('/settings?error=No advertising profiles found for this account', request.url)
      )
    }

    // For now, auto-select the first seller profile
    // In a multi-account app, you'd let the user choose
    const sellerProfile = profiles.find(p => p.accountInfo.type === 'seller') || profiles[0]

    // Update credentials with profile ID
    await saveAdsCredentials({
      clientId: process.env.AMAZON_ADS_CLIENT_ID!,
      clientSecret: process.env.AMAZON_ADS_CLIENT_SECRET!,
      refreshToken,
      accessToken,
      accessTokenExpiry: Date.now() + (expiresIn * 1000),
      profileId: sellerProfile.profileId.toString(),
    })

    console.log('Amazon Ads API connected successfully!')
    console.log('Profile:', sellerProfile.accountInfo.name, '- ID:', sellerProfile.profileId)

    // Redirect to settings with success message
    return NextResponse.redirect(
      new URL('/settings?success=Amazon Ads API connected successfully', request.url)
    )

  } catch (error: any) {
    console.error('Amazon Ads OAuth callback error:', error)
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(error.message)}`, request.url)
    )
  }
}
