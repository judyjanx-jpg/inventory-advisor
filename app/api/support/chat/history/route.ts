import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET endpoint to retrieve all chat sessions with messages
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')

    const sessions = await prisma.chatSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    return NextResponse.json({
      sessions: sessions.map(session => ({
        id: session.id,
        sessionToken: session.sessionToken,
        customerEmail: session.customerEmail,
        customerName: session.customerName,
        orderContextId: session.orderContextId,
        createdAt: session.createdAt.toISOString(),
        escalatedToTicketId: session.escalatedToTicketId,
        messages: session.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      })),
      count: sessions.length,
    })
  } catch (error) {
    console.error('Get chat history error:', error)
    return NextResponse.json(
      { error: 'Failed to get chat history' },
      { status: 500 }
    )
  }
}


