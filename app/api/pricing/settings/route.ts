// app/api/pricing/settings/route.ts
// API for managing global pricing settings

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Default settings
const DEFAULT_SETTINGS = {
  targetType: 'dollar',
  targetValue: 5,
  maxRaisePercent: 8
}

export async function GET() {
  try {
    // Try to read from database
    try {
      const settings = await prisma.pricingSettings.findFirst()
      
      if (settings) {
        return NextResponse.json({
          success: true,
          settings: {
            targetType: settings.targetType,
            targetValue: Number(settings.targetValue),
            maxRaisePercent: Number(settings.maxRaisePercent)
          }
        })
      }
    } catch (e) {
      // Table might not exist yet
      console.log('PricingSettings table not available, using defaults')
    }
    
    // Return defaults
    return NextResponse.json({
      success: true,
      settings: DEFAULT_SETTINGS
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { targetType, targetValue, maxRaisePercent } = body

    // Try to save to database
    try {
      const existing = await prisma.pricingSettings.findFirst()
      
      if (existing) {
        await prisma.pricingSettings.update({
          where: { id: existing.id },
          data: {
            targetType,
            targetValue,
            maxRaisePercent
          }
        })
      } else {
        await prisma.pricingSettings.create({
          data: {
            targetType,
            targetValue,
            maxRaisePercent
          }
        })
      }
      
      return NextResponse.json({ success: true, saved: true })
    } catch (e: any) {
      // Table might not exist - settings will work locally until page refresh
      console.log('PricingSettings table not available:', e.message)
      return NextResponse.json({ 
        success: true, 
        saved: false,
        message: 'Settings applied locally. Database table not yet available.' 
      })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

