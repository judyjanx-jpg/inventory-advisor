import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/ai/insights/[id]/dismiss - Dismiss an insight
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    const observationId = parseInt(params.id)

    await prisma.aiObservation.update({
      where: {
        id: observationId,
        userId: profile.id
      },
      data: {
        status: 'dismissed',
        viewedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true
    })
  } catch (error) {
    console.error('Dismiss insight error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to dismiss insight'
    }, { status: 500 })
  }
}

