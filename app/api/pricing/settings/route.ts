// app/api/pricing/settings/route.ts
// API for managing global pricing settings

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const settings = await prisma.pricingSettings.findFirst()
    
    return NextResponse.json({
      success: true,
      settings: settings ? {
        targetType: settings.targetType,
        targetValue: Number(settings.targetValue),
        maxRaisePercent: Number(settings.maxRaisePercent)
      } : {
        targetType: 'dollar',
        targetValue: 5,
        maxRaisePercent: 8
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { targetType, targetValue, maxRaisePercent } = body

    // Upsert settings (create or update the single row)
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

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

