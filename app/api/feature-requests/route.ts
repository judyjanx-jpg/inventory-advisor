import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/feature-requests - Get all feature requests
export async function GET(request: NextRequest) {
  try {
    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    const requests = await prisma.featureRequest.findMany({
      where: {
        userId: profile.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({
      success: true,
      requests
    })
  } catch (error) {
    console.error('Get feature requests error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch feature requests'
    }, { status: 500 })
  }
}

// POST /api/feature-requests - Create a feature request (usually done by AI)
export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    const body = await request.json()
    const { requestText, aiAnalysis, aiSuggestedApproach } = body

    if (!requestText) {
      return NextResponse.json({
        success: false,
        error: 'requestText is required'
      }, { status: 400 })
    }

    const request = await prisma.featureRequest.create({
      data: {
        userId: profile.id,
        requestText,
        aiAnalysis,
        aiSuggestedApproach
      }
    })

    return NextResponse.json({
      success: true,
      request
    })
  } catch (error) {
    console.error('Create feature request error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create feature request'
    }, { status: 500 })
  }
}

