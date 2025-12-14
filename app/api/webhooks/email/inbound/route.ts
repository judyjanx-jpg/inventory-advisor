import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTicketConfirmation } from '@/lib/email'

/**
 * Inbound Email Webhook
 *
 * Receives incoming emails from email service providers and creates support tickets.
 * Supports:
 * - SendGrid Inbound Parse
 * - Postmark Inbound
 * - Mailgun Routes
 * - Generic JSON format
 *
 * Configure your email service to forward support@yourdomain.com to this endpoint.
 */

// Shared secret for webhook verification (set in environment)
const INBOUND_EMAIL_SECRET = process.env.INBOUND_EMAIL_SECRET

// Generate a unique ticket number
function generateTicketNumber(): string {
  const random = Math.floor(Math.random() * 900000) + 100000
  return `TKT-${random}`
}

// Extract email address from "Name <email@domain.com>" format
function extractEmail(emailStr: string): string {
  const match = emailStr.match(/<([^>]+)>/)
  return match ? match[1] : emailStr.trim()
}

// Extract name from "Name <email@domain.com>" format
function extractName(emailStr: string): string | null {
  const match = emailStr.match(/^([^<]+)</)
  return match ? match[1].trim() : null
}

// Parse SendGrid Inbound Parse format (multipart/form-data)
async function parseSendGridFormat(request: NextRequest): Promise<{
  from: string
  fromName: string | null
  to: string
  subject: string
  body: string
  html?: string
  attachments?: any[]
} | null> {
  try {
    const formData = await request.formData()

    const from = formData.get('from') as string
    const to = formData.get('to') as string
    const subject = formData.get('subject') as string
    const text = formData.get('text') as string
    const html = formData.get('html') as string

    if (!from || !subject) return null

    return {
      from: extractEmail(from),
      fromName: extractName(from),
      to: extractEmail(to || ''),
      subject,
      body: text || '',
      html: html || undefined,
    }
  } catch {
    return null
  }
}

// Parse Postmark Inbound format (JSON)
async function parsePostmarkFormat(body: any): Promise<{
  from: string
  fromName: string | null
  to: string
  subject: string
  body: string
  html?: string
  attachments?: any[]
} | null> {
  if (!body.From || !body.Subject) return null

  return {
    from: body.FromFull?.Email || extractEmail(body.From),
    fromName: body.FromFull?.Name || extractName(body.From),
    to: body.ToFull?.[0]?.Email || extractEmail(body.To || ''),
    subject: body.Subject,
    body: body.TextBody || body.StrippedTextReply || '',
    html: body.HtmlBody,
    attachments: body.Attachments?.map((a: any) => ({
      name: a.Name,
      contentType: a.ContentType,
      content: a.Content,
    })),
  }
}

// Parse Mailgun format (JSON or form-data)
async function parseMailgunFormat(body: any): Promise<{
  from: string
  fromName: string | null
  to: string
  subject: string
  body: string
  html?: string
  attachments?: any[]
} | null> {
  const sender = body.sender || body.from
  if (!sender || !body.subject) return null

  return {
    from: extractEmail(sender),
    fromName: extractName(sender),
    to: extractEmail(body.recipient || body.to || ''),
    subject: body.subject,
    body: body['body-plain'] || body.text || '',
    html: body['body-html'] || body.html,
  }
}

// Parse generic JSON format
function parseGenericFormat(body: any): {
  from: string
  fromName: string | null
  to: string
  subject: string
  body: string
  html?: string
  attachments?: any[]
} | null {
  const from = body.from || body.sender || body.email
  const subject = body.subject || body.title
  const text = body.body || body.text || body.content || body.message

  if (!from || !subject) return null

  return {
    from: extractEmail(from),
    fromName: body.name || body.fromName || extractName(from),
    to: extractEmail(body.to || body.recipient || ''),
    subject,
    body: text,
    html: body.html || body.htmlBody,
    attachments: body.attachments,
  }
}

// Detect if this is a reply to an existing ticket
function detectTicketReply(subject: string): string | null {
  // Match patterns like "Re: [TKT-123456] Original Subject"
  const match = subject.match(/\[?(TKT-\d{6})\]?/i)
  return match ? match[1].toUpperCase() : null
}

// Categorize email based on subject/content
function categorizeEmail(subject: string, body: string): string {
  const lowerSubject = subject.toLowerCase()
  const lowerBody = body.toLowerCase()
  const combined = `${lowerSubject} ${lowerBody}`

  if (combined.includes('warranty') || combined.includes('broken') || combined.includes('defect')) {
    return 'WARRANTY'
  }
  if (combined.includes('ship') || combined.includes('delivery') || combined.includes('tracking')) {
    return 'SHIPPING'
  }
  if (combined.includes('order') || combined.includes('purchase') || combined.includes('refund')) {
    return 'ORDER'
  }
  if (combined.includes('size') || combined.includes('fit') || combined.includes('measurement')) {
    return 'PRODUCT'
  }
  return 'OTHER'
}

// Extract order ID from email content
function extractOrderId(subject: string, body: string): string | null {
  const combined = `${subject} ${body}`
  // Match Amazon order ID pattern: XXX-XXXXXXX-XXXXXXX
  const match = combined.match(/\b(\d{3}-\d{7}-\d{7})\b/)
  return match ? match[1] : null
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if configured
    if (INBOUND_EMAIL_SECRET) {
      const authHeader = request.headers.get('authorization')
      const providedSecret = request.headers.get('x-webhook-secret')

      if (authHeader !== `Bearer ${INBOUND_EMAIL_SECRET}` && providedSecret !== INBOUND_EMAIL_SECRET) {
        console.warn('[Inbound Email] Invalid webhook secret')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Determine content type and parse accordingly
    const contentType = request.headers.get('content-type') || ''
    let emailData: {
      from: string
      fromName: string | null
      to: string
      subject: string
      body: string
      html?: string
      attachments?: any[]
    } | null = null

    if (contentType.includes('multipart/form-data')) {
      // SendGrid Inbound Parse format
      emailData = await parseSendGridFormat(request)
    } else if (contentType.includes('application/json')) {
      const body = await request.json()

      // Try different JSON formats
      if (body.FromFull || body.TextBody) {
        // Postmark format
        emailData = await parsePostmarkFormat(body)
      } else if (body['body-plain'] || body.sender) {
        // Mailgun format
        emailData = await parseMailgunFormat(body)
      } else {
        // Generic JSON
        emailData = parseGenericFormat(body)
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported content type' },
        { status: 400 }
      )
    }

    if (!emailData) {
      return NextResponse.json(
        { error: 'Could not parse email data' },
        { status: 400 }
      )
    }

    console.log(`[Inbound Email] Received from ${emailData.from}: ${emailData.subject}`)

    // Check if this is a reply to existing ticket
    const existingTicketNumber = detectTicketReply(emailData.subject)

    if (existingTicketNumber) {
      // Add reply to existing ticket
      const ticket = await prisma.supportTicket.findUnique({
        where: { ticketNumber: existingTicketNumber },
      })

      if (ticket) {
        await prisma.ticketMessage.create({
          data: {
            ticketId: ticket.id,
            senderType: 'CUSTOMER',
            senderName: emailData.fromName || emailData.from,
            content: emailData.body,
            attachments: emailData.attachments ? JSON.stringify(emailData.attachments) : null,
          },
        })

        // Reopen ticket if it was closed
        if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
          await prisma.supportTicket.update({
            where: { id: ticket.id },
            data: { status: 'OPEN' },
          })
        }

        console.log(`[Inbound Email] Added reply to ticket ${existingTicketNumber}`)

        return NextResponse.json({
          success: true,
          action: 'reply_added',
          ticketNumber: existingTicketNumber,
        })
      }
    }

    // Create new ticket
    let ticketNumber = generateTicketNumber()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.supportTicket.findUnique({
        where: { ticketNumber },
      })
      if (!existing) break
      ticketNumber = generateTicketNumber()
      attempts++
    }

    const category = categorizeEmail(emailData.subject, emailData.body)
    const orderId = extractOrderId(emailData.subject, emailData.body)

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        customerEmail: emailData.from,
        customerName: emailData.fromName,
        orderId,
        category,
        channel: 'EMAIL',
        subject: emailData.subject,
        status: 'OPEN',
        priority: 'MEDIUM',
      },
    })

    // Create initial message
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: 'CUSTOMER',
        senderName: emailData.fromName || emailData.from,
        content: emailData.body,
        attachments: emailData.attachments ? JSON.stringify(emailData.attachments) : null,
      },
    })

    console.log(`[Inbound Email] Created ticket ${ticketNumber} from ${emailData.from}`)

    // Send confirmation email (non-blocking)
    sendTicketConfirmation({
      to: emailData.from,
      customerName: emailData.fromName || '',
      ticketNumber,
      subject: emailData.subject,
    }).catch(err => console.error('[Inbound Email] Confirmation failed:', err))

    return NextResponse.json({
      success: true,
      action: 'ticket_created',
      ticketNumber,
      category,
    })
  } catch (error: any) {
    console.error('[Inbound Email] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process inbound email', details: error.message },
      { status: 500 }
    )
  }
}

// GET - Health check for webhook
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'inbound-email-webhook',
    supportedFormats: ['sendgrid', 'postmark', 'mailgun', 'generic-json'],
  })
}
