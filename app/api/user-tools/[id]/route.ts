import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT /api/user-tools/[id] - Update a tool
export async function PUT(
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

    const toolId = parseInt(params.id)
    const body = await request.json()
    const { title, config, position, isActive, size } = body

    const tool = await prisma.userTool.updateMany({
      where: {
        id: toolId,
        userId: profile.id
      },
      data: {
        ...(title !== undefined && { title }),
        ...(config !== undefined && { config }),
        ...(position !== undefined && { position }),
        ...(isActive !== undefined && { isActive }),
        ...(size !== undefined && { size })
      }
    })

    if (tool.count === 0) {
      return NextResponse.json({
        success: false,
        error: 'Tool not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true
    })
  } catch (error) {
    console.error('Update tool error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update tool'
    }, { status: 500 })
  }
}

// DELETE /api/user-tools/[id] - Delete a tool
export async function DELETE(
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

    const toolId = parseInt(params.id)

    await prisma.userTool.deleteMany({
      where: {
        id: toolId,
        userId: profile.id
      }
    })

    return NextResponse.json({
      success: true
    })
  } catch (error) {
    console.error('Delete tool error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete tool'
    }, { status: 500 })
  }
}

