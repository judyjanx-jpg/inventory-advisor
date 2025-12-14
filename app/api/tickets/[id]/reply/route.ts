import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Add a reply to a ticket
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ticketId = parseInt(id)
    const body = await request.json()

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      )
    }

    const { content, senderType = 'AGENT', senderName = 'Support Agent' } = body

    if (!content?.trim()) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      )
    }

    // Verify ticket exists
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
    })

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      )
    }

    // Create the message
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId,
        senderType,
        senderName,
        content: content.trim(),
      }
    })

    // Update ticket status to PENDING if it was OPEN (waiting for customer response)
    if (ticket.status === 'OPEN' && senderType === 'AGENT') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'PENDING' }
      })
    }

    // If customer replied and ticket was PENDING, set back to OPEN
    if (ticket.status === 'PENDING' && senderType === 'CUSTOMER') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'OPEN' }
      })
    }

    console.log(`[Ticket] Reply added to ${ticket.ticketNumber} by ${senderType}`)

    // TODO: Send email notification to customer if agent replied
    // TODO: Send notification to agent if customer replied

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        senderType: message.senderType,
        senderName: message.senderName,
        content: message.content,
        createdAt: message.createdAt,
      }
    })
  } catch (error) {
    console.error('[Ticket Reply] Error:', error)
    return NextResponse.json(
      { error: 'Unable to add reply' },
      { status: 500 }
    )
  }
}

