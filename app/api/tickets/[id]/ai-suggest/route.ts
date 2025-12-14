import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// POST - Generate AI-suggested response for a ticket
export async function POST(
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

    if (!anthropic) {
      return NextResponse.json(
        { error: 'AI features require ANTHROPIC_API_KEY' },
        { status: 503 }
      )
    }

    // Get ticket with messages
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

    // Get order context if available
    let orderContext = ''
    if (ticket.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: ticket.orderId },
        include: {
          orderItems: {
            include: {
              product: {
                select: {
                  sku: true,
                  title: true,
                  displayName: true,
                  isWarrantied: true,
                }
              }
            }
          }
        }
      })

      if (order) {
        orderContext = `
ORDER CONTEXT:
- Order ID: ${order.id}
- Purchase Date: ${order.purchaseDate.toLocaleDateString()}
- Status: ${order.status}
- Items:
${order.orderItems.map(item => `  - ${item.product.displayName || item.product.title} (${item.masterSku}), Qty: ${item.quantity}, $${Number(item.itemPrice).toFixed(2)}, Warranty: ${item.product.isWarrantied ? 'Yes' : 'No'}`).join('\n')}
`
      }
    }

    // Build conversation context
    const conversationHistory = ticket.messages.map(m => 
      `[${m.senderType}${m.senderName ? ` - ${m.senderName}` : ''}]: ${m.content}`
    ).join('\n\n')

    // Get resolved similar tickets for learning
    let similarResolutions = ''
    try {
      const similarTickets = await prisma.supportTicket.findMany({
        where: {
          category: ticket.category,
          status: { in: ['RESOLVED', 'CLOSED'] },
          resolutionNotes: { not: null },
        },
        select: {
          subject: true,
          resolutionNotes: true,
        },
        take: 3,
        orderBy: { resolvedAt: 'desc' },
      })

      if (similarTickets.length > 0) {
        similarResolutions = `
SIMILAR RESOLVED TICKETS:
${similarTickets.map(t => `- Subject: ${t.subject}\n  Resolution: ${t.resolutionNotes}`).join('\n\n')}
`
      }
    } catch (e) {
      // Ignore errors fetching similar tickets
    }

    const systemPrompt = `You are a helpful customer support agent for KISPER Jewelry. Generate a professional, empathetic response to the customer's inquiry.

COMPANY POLICIES:
- Lifetime warranty on all jewelry
- 30-day return policy for unused items
- Free shipping on orders over $25
- Returns/warranty claims go through /support/warranty portal
- Order tracking through Amazon "Your Orders"

${orderContext}

${similarResolutions}

TICKET INFO:
- Ticket Number: ${ticket.ticketNumber}
- Category: ${ticket.category}
- Priority: ${ticket.priority}
- Subject: ${ticket.subject}
${ticket.aiSummary ? `- AI Summary: ${ticket.aiSummary}` : ''}

CONVERSATION HISTORY:
${conversationHistory}

GUIDELINES:
1. Be warm, professional, and empathetic
2. Address the customer's specific concern
3. Provide clear next steps
4. If warranty/return needed, direct to /support/warranty
5. If order tracking needed, direct to Amazon's Your Orders
6. Keep response concise (3-5 sentences usually)
7. Sign off professionally

Generate a helpful response to send to the customer. Do not include a subject line, just the message body.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: 'Generate a response to this support ticket.' }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    return NextResponse.json({
      success: true,
      suggestion: content.text,
      ticketNumber: ticket.ticketNumber,
    })
  } catch (error) {
    console.error('[AI Suggest] Error:', error)
    return NextResponse.json(
      { error: 'Unable to generate suggestion' },
      { status: 500 }
    )
  }
}


