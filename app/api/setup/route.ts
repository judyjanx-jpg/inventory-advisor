import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const profile = await prisma.businessProfile.findFirst()
    return NextResponse.json(profile)
  } catch (error: any) {
    console.error('Error fetching business profile:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      businessName,
      businessType,
      primaryMarketplace,
      additionalMarketplaces,
      currency,
      warehouseLocations,
      defaultLeadTime,
      reorderBuffer,
      targetDaysOfStock,
    } = body

    // Check if profile already exists
    const existingProfile = await prisma.businessProfile.findFirst()

    let profile
    if (existingProfile) {
      profile = await prisma.businessProfile.update({
        where: { id: existingProfile.id },
        data: {
          businessName,
          businessType,
          primaryMarketplace,
          additionalMarketplaces,
          currency,
          warehouseLocations,
          defaultLeadTime: parseInt(defaultLeadTime) || 14,
          reorderBuffer: parseInt(reorderBuffer) || 7,
          targetDaysOfStock: parseInt(targetDaysOfStock) || 30,
          isSetupComplete: true,
          updatedAt: new Date(),
        },
      })
    } else {
      profile = await prisma.businessProfile.create({
        data: {
          businessName,
          businessType,
          primaryMarketplace,
          additionalMarketplaces,
          currency,
          warehouseLocations,
          defaultLeadTime: parseInt(defaultLeadTime) || 14,
          reorderBuffer: parseInt(reorderBuffer) || 7,
          targetDaysOfStock: parseInt(targetDaysOfStock) || 30,
          isSetupComplete: true,
        },
      })
    }

    return NextResponse.json(profile)
  } catch (error: any) {
    console.error('Error saving business profile:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save profile' },
      { status: 500 }
    )
  }
}

