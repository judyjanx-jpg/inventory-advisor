import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/ai/insights - Get all insights for the user
export async function GET(request: NextRequest) {
  try {
    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    const status = request.nextUrl.searchParams.get('status') || 'new'
    
    const observations = await prisma.aiObservation.findMany({
      where: {
        userId: profile.id,
        ...(status !== 'all' ? { status } : {})
      },
      include: {
        conversations: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 50
    })

    const newCount = observations.filter(o => o.status === 'new').length

    return NextResponse.json({
      success: true,
      insights: observations,
      newCount
    })
  } catch (error) {
    console.error('Get insights error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch insights'
    }, { status: 500 })
  }
}

// POST /api/ai/insights - Create a new observation (for background jobs)
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
    const { observationType, title, description, data, priority = 'normal' } = body

    if (!observationType || !title) {
      return NextResponse.json({
        success: false,
        error: 'observationType and title are required'
      }, { status: 400 })
    }

    const observation = await prisma.aiObservation.create({
      data: {
        userId: profile.id,
        observationType,
        title,
        description,
        data: data || null,
        priority
      }
    })

    return NextResponse.json({
      success: true,
      observation
    })
  } catch (error) {
    console.error('Create insight error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create insight'
    }, { status: 500 })
  }
}

