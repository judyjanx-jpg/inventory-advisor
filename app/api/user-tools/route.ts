import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/user-tools - Get all user tools
export async function GET(request: NextRequest) {
  try {
    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    const tools = await prisma.userTool.findMany({
      where: {
        userId: profile.id,
        isActive: true
      },
      orderBy: {
        position: 'asc'
      }
    })

    return NextResponse.json({
      success: true,
      tools
    })
  } catch (error) {
    console.error('Get user tools error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch tools'
    }, { status: 500 })
  }
}

// POST /api/user-tools - Create a new tool
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
    const { toolType, title, config, size = 'medium', createdBy = 'user' } = body

    if (!toolType || !title || !config) {
      return NextResponse.json({
        success: false,
        error: 'toolType, title, and config are required'
      }, { status: 400 })
    }

    // Get max position
    const maxPosition = await prisma.userTool.aggregate({
      where: { userId: profile.id },
      _max: { position: true }
    })

    const tool = await prisma.userTool.create({
      data: {
        userId: profile.id,
        toolType,
        title,
        config,
        size,
        position: (maxPosition._max.position || 0) + 1,
        createdBy
      }
    })

    return NextResponse.json({
      success: true,
      tool
    })
  } catch (error) {
    console.error('Create user tool error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create tool'
    }, { status: 500 })
  }
}

// PUT /api/user-tools/reorder - Reorder tools
export async function PUT(request: NextRequest) {
  try {
    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    const body = await request.json()
    const { toolIds } = body

    if (!Array.isArray(toolIds)) {
      return NextResponse.json({
        success: false,
        error: 'toolIds must be an array'
      }, { status: 400 })
    }

    // Update positions
    await Promise.all(
      toolIds.map((toolId: number, index: number) =>
        prisma.userTool.updateMany({
          where: {
            id: toolId,
            userId: profile.id
          },
          data: {
            position: index
          }
        })
      )
    )

    return NextResponse.json({
      success: true
    })
  } catch (error) {
    console.error('Reorder tools error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to reorder tools'
    }, { status: 500 })
  }
}

