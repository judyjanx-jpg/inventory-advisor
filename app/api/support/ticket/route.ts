import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTicketConfirmation } from '@/lib/email'

// Generate a unique ticket number
function generateTicketNumber(): string {
  const random = Math.floor(Math.random() * 900000) + 100000 // 6-digit random
  return `TKT-${random}`
}

// Public API - Create support ticket
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, orderId, category, subject, message } = body

    // Validate required fields
    if (!email || !subject || !message) {
      return NextResponse.json(
        { error: 'Email, subject, and message are required' },
        { status: 400 }
      )
    }

    // Validate email format (using indexOf to avoid ReDoS)
    const emailStr = String(email)
    const atIndex = emailStr.indexOf('@')
    const hasValidAt = atIndex > 0 && atIndex === emailStr.lastIndexOf('@')
    const dotIndex = emailStr.indexOf('.', atIndex)
    const hasValidDot = dotIndex > atIndex + 1 && dotIndex < emailStr.length - 1
    const hasNoSpaces = !emailStr.includes(' ')

    if (!hasValidAt || !hasValidDot || !hasNoSpaces) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      )
    }

    // Generate unique ticket number
    let ticketNumber = generateTicketNumber()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.supportTicket.findUnique({
        where: { ticketNumber }
      })
      if (!existing) break
      ticketNumber = generateTicketNumber()
      attempts++
    }

    // Create the ticket
    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        customerEmail: email,
        customerName: name || null,
        orderId: orderId || null,
        category: category || 'OTHER',
        channel: 'FORM',
        subject,
        status: 'OPEN',
        priority: 'MEDIUM',
      }
    })

    // Create the initial message
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: 'CUSTOMER',
        senderName: name || email,
        content: message,
      }
    })

    console.log(`[Support] Created ticket ${ticketNumber} from ${email}`)

    // Send confirmation email to customer (non-blocking)
    sendTicketConfirmation({
      to: email,
      customerName: name || '',
      ticketNumber,
      subject,
    }).catch(err => console.error('[Support] Email failed:', err))

    return NextResponse.json({
      success: true,
      ticketNumber: ticket.ticketNumber,
      message: 'Your message has been received. We will respond within 24 hours.'
    })
  } catch (error) {
    console.error('Ticket creation error:', error)
    return NextResponse.json(
      { error: 'Unable to submit your message. Please try again.' },
      { status: 500 }
    )
  }
}

