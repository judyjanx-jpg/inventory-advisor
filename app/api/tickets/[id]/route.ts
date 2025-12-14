import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Get ticket details with messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ticketId = parseInt(id)

    if (isNaN(ticketId)) {
      return NextResponse.json(
        { error: 'Invalid ticket ID' },
        { status: 400 }
      )
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        }
      }
    })

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      )
    }

    // Get related order if exists
    let order = null
    if (ticket.orderId) {
      order = await prisma.order.findUnique({
        where: { id: ticket.orderId },
        include: {
          orderItems: {
            include: {
              product: {
                select: {
                  sku: true,
                  title: true,
                  displayName: true,
                }
              }
            }
          }
        }
      })
    }

    return NextResponse.json({
      ticket: {
        ...ticket,
        messages: ticket.messages.map(m => ({
          id: m.id,
          senderType: m.senderType,
          senderName: m.senderName,
          content: m.content,
          attachments: m.attachments ? JSON.parse(m.attachments) : [],
          createdAt: m.createdAt,
        }))
      },
      order: order ? {
        id: order.id,
        purchaseDate: order.purchaseDate,
        status: order.status,
        items: order.orderItems.map(item => ({
          sku: item.masterSku,
          name: item.product.displayName || item.product.title,
          quantity: item.quantity,
          price: Number(item.itemPrice),
        }))
      } : null,
    })
  } catch (error) {
    console.error('[Ticket] Get error:', error)
    return NextResponse.json(
      { error: 'Unable to fetch ticket' },
      { status: 500 }
    )
  }
}

// PATCH - Update ticket status, priority, assignment, etc.
export async function PATCH(
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

    const { status, priority, category, assignedTo, resolutionNotes } = body

    const updateData: any = {}

    if (status) {
      updateData.status = status
      if (status === 'RESOLVED' || status === 'CLOSED') {
        updateData.resolvedAt = new Date()
      }
    }

    if (priority) updateData.priority = priority
    if (category) updateData.category = category
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo
    if (resolutionNotes !== undefined) updateData.resolutionNotes = resolutionNotes

    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    })

    console.log(`[Ticket] Updated ${ticket.ticketNumber}: ${JSON.stringify(updateData)}`)

    return NextResponse.json({ success: true, ticket })
  } catch (error) {
    console.error('[Ticket] Update error:', error)
    return NextResponse.json(
      { error: 'Unable to update ticket' },
      { status: 500 }
    )
  }
}

