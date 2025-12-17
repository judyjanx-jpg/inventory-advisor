import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = parseInt(params.id)

    // Get the session with entries count
    const session = await prisma.auditSession.findUnique({
      where: { id: sessionId },
      include: {
        _count: {
          select: { entries: true }
        }
      }
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Audit session not found' },
        { status: 404 }
      )
    }

    // If the audit has entries, save it to the log as completed
    if (session._count.entries > 0) {
      await prisma.auditSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      })

      return NextResponse.json({ 
        action: 'saved',
        message: 'Audit saved to log with entries'
      })
    } else {
      // If no entries, just delete the empty session
      await prisma.auditSession.delete({
        where: { id: sessionId },
      })

      return NextResponse.json({ 
        action: 'deleted',
        message: 'Empty audit session removed'
      })
    }
  } catch (error: any) {
    console.error('Error closing audit session:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to close audit session' },
      { status: 500 }
    )
  }
}

