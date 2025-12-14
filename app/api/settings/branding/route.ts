import { NextRequest, NextResponse } from 'next/server'
import { getBranding, updateBranding, BrandingSettings } from '@/lib/branding'

// GET - Get current branding settings
export async function GET() {
  try {
    const branding = await getBranding()
    return NextResponse.json({ branding })
  } catch (error) {
    console.error('[Branding] Get error:', error)
    return NextResponse.json(
      { error: 'Unable to fetch branding settings' },
      { status: 500 }
    )
  }
}

// PATCH - Update branding settings
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    
    const updates: Partial<BrandingSettings> = {}
    
    if (body.brandName !== undefined) updates.brandName = body.brandName
    if (body.tagline !== undefined) updates.tagline = body.tagline
    if (body.supportEmail !== undefined) updates.supportEmail = body.supportEmail
    if (body.supportPhone !== undefined) updates.supportPhone = body.supportPhone
    if (body.supportHours !== undefined) updates.supportHours = body.supportHours
    if (body.primaryColor !== undefined) updates.primaryColor = body.primaryColor
    if (body.logoUrl !== undefined) updates.logoUrl = body.logoUrl
    
    const branding = await updateBranding(updates)
    
    console.log('[Branding] Updated:', Object.keys(updates).join(', '))
    
    return NextResponse.json({ success: true, branding })
  } catch (error) {
    console.error('[Branding] Update error:', error)
    return NextResponse.json(
      { error: 'Unable to update branding settings' },
      { status: 500 }
    )
  }
}

