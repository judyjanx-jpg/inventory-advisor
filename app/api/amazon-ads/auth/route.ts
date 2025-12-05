// app/api/amazon-ads/auth/route.ts
// Initiates the Amazon Ads API OAuth flow

import { NextResponse } from 'next/server'
import { getAdsAuthUrl } from '@/lib/amazon-ads-api'

export async function GET() {
  try {
    const authUrl = getAdsAuthUrl()
    return NextResponse.redirect(authUrl)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
