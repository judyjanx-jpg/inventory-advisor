import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// Escalation triggers
const ESCALATION_KEYWORDS = [
  'speak to human', 'talk to human', 'real person', 'agent', 'representative',
  'manager', 'supervisor', 'lawyer', 'legal', 'sue', 'lawsuit', 'attorney',
  'injured', 'hurt', 'allergic', 'choking', 'emergency', 'unsafe', 'dangerous',
  'furious', 'outraged', 'disgusted', 'terrible', 'worst', 'scam', 'fraud',
  'bbb', 'better business', 'attorney general', 'ftc', 'report you'
]

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// Build RAG context from database
async function buildSupportContext(sessionId: string, orderContext?: string): Promise<string> {
  let context = `SUPPORT KNOWLEDGE BASE:

COMPANY INFO:
- Company: CHOE Jewelers (also sold under KISPER brand)
- Products: Fashion jewelry, rings, necklaces, bracelets, earrings
- Platform: Amazon FBA

WARRANTY POLICY:
- Lifetime warranty on all jewelry products
- Covers: manufacturing defects, tarnishing, breakage from normal wear
- NOT covered: damage from misuse, accidents, lost items, normal wear of plating
- Process: Customer gets prepaid return label, ships item back, we process refund or send replacement
- One warranty claim per order

SHIPPING INFO:
- Standard shipping: 3-5 business days (continental US)
- Expedited options available at checkout
- Ships from Amazon fulfillment centers
- Tracking provided via email once shipped

RETURN POLICY:
- 30-day return window for unused items in original packaging
- Returns initiated through Amazon or our warranty portal
- Refunds processed within 3-5 business days after receipt

SIZING:
- Rings: US standard sizing, recommend going up if between sizes
- Necklaces: Measure neck, add 2-4 inches for comfort
- Ring sizer tools available, or visit local jeweler for accurate measurement

CARE INSTRUCTIONS:
- Clean with soft lint-free cloth
- Use mild soap and warm water for deeper cleaning
- Avoid chlorine, salt water, harsh chemicals
- Remove before swimming, showering, exercising
- Store pieces separately to prevent scratching
- Keep in cool, dry place

COMMON ISSUES & SOLUTIONS:
- Tarnishing: Normal over time, covered by warranty for replacement
- Wrong size: Free exchanges available
- Broken clasp/chain: Covered by warranty
- Color fading: If excessive, covered by warranty
- Allergic reaction: Stop wearing, contact support for return

`

  // Get order info if we have order context
  if (orderContext) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderContext },
        include: {
          orderItems: {
            include: {
              product: {
                select: {
                  sku: true,
                  title: true,
                  displayName: true,
                  careInstructions: true,
                  sizingGuide: true,
                  isWarrantied: true,
                }
              }
            }
          }
        }
      })

      if (order) {
        context += `
CUSTOMER'S ORDER (${order.id}):
- Purchase Date: ${order.purchaseDate.toLocaleDateString()}
- Status: ${order.status}
- Items:
${order.orderItems.map(item => `  - ${item.product.displayName || item.product.title} (SKU: ${item.masterSku}, Qty: ${item.quantity}, $${Number(item.itemPrice).toFixed(2)})
    Warranty eligible: ${item.product.isWarrantied ? 'Yes' : 'No'}
    ${item.product.careInstructions ? `Care: ${item.product.careInstructions}` : ''}
    ${item.product.sizingGuide ? `Sizing: ${item.product.sizingGuide}` : ''}`).join('\n')}
`
      }
    } catch (e) {
      console.error('Error fetching order context:', e)
    }
  }

  // Get recent FAQ articles
  try {
    const articles = await prisma.knowledgeArticle.findMany({
      where: { isPublished: true },
      select: { title: true, excerpt: true, category: true },
      take: 10,
    })

    if (articles.length > 0) {
      context += `
FAQ ARTICLES:
${articles.map(a => `- [${a.category}] ${a.title}: ${a.excerpt || ''}`).join('\n')}
`
    }
  } catch (e) {
    // No articles yet, that's fine
  }

  return context
}

// Check if message should trigger escalation
function shouldEscalate(message: string, conversationHistory: Message[]): { escalate: boolean; reason?: string } {
  const lower = message.toLowerCase()
  
  // Check for explicit escalation keywords
  for (const keyword of ESCALATION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { escalate: true, reason: `Customer mentioned: "${keyword}"` }
    }
  }

  // Check conversation length - escalate if too many back-and-forths
  if (conversationHistory.length >= 8) {
    return { escalate: true, reason: 'Extended conversation without resolution' }
  }

  // Check for repeated questions (customer frustration)
  const userMessages = conversationHistory.filter(m => m.role === 'user').map(m => m.content.toLowerCase())
  if (userMessages.length >= 3) {
    const lastTwo = userMessages.slice(-2)
    const similarity = lastTwo[0].split(' ').filter(word => lastTwo[1]?.includes(word)).length
    if (similarity > 5) {
      return { escalate: true, reason: 'Customer appears to be repeating themselves' }
    }
  }

  return { escalate: false }
}

// Create support ticket from chat escalation
async function createEscalationTicket(
  sessionId: string,
  customerEmail: string | null,
  customerName: string | null,
  messages: Message[],
  escalationReason: string
): Promise<string> {
  // Generate ticket number
  const ticketNumber = `TKT-${Math.floor(Math.random() * 900000) + 100000}`

  // Create AI summary of the conversation
  let aiSummary = `Escalated from chat: ${escalationReason}\n\nConversation summary:\n`
  aiSummary += messages.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 200)}...`).join('\n')

  const ticket = await prisma.supportTicket.create({
    data: {
      ticketNumber,
      customerEmail: customerEmail || 'chat@support.local',
      customerName,
      status: 'OPEN',
      priority: escalationReason.includes('legal') || escalationReason.includes('injur') ? 'URGENT' : 'HIGH',
      category: 'OTHER',
      channel: 'CHAT',
      subject: `Chat escalation: ${escalationReason.substring(0, 50)}`,
      aiSummary,
    }
  })

  // Add conversation as first message
  await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      senderType: 'AI',
      senderName: 'Support Bot',
      content: `Chat conversation escalated to human support.\n\nReason: ${escalationReason}\n\n--- CONVERSATION HISTORY ---\n\n${messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n')}`,
    }
  })

  // Update chat session
  await prisma.chatSession.update({
    where: { sessionToken: sessionId },
    data: { escalatedToTicketId: ticket.id }
  })

  return ticketNumber
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, message, orderContext } = body

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!anthropic) {
      return new Response(JSON.stringify({ 
        error: 'AI chat is not configured. Please contact support directly.',
        fallbackAction: 'contact'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get or create session
    let session = sessionId 
      ? await prisma.chatSession.findUnique({ where: { sessionToken: sessionId } })
      : null

    if (!session) {
      const newSessionToken = uuidv4()
      session = await prisma.chatSession.create({
        data: {
          sessionToken: newSessionToken,
          orderContextId: orderContext || null,
        }
      })
    }

    // Get conversation history
    const history = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: 20, // Limit history for context window
    })

    const conversationHistory: Message[] = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Check for escalation
    const escalationCheck = shouldEscalate(message, conversationHistory)
    
    if (escalationCheck.escalate) {
      // Save user message
      await prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'user',
          content: message,
        }
      })

      // Create ticket
      const ticketNumber = await createEscalationTicket(
        session.sessionToken,
        session.customerEmail,
        session.customerName,
        [...conversationHistory, { role: 'user', content: message }],
        escalationCheck.reason || 'Customer requested human support'
      )

      // Save escalation response
      const escalationResponse = `I understand you'd like to speak with a human. I've created support ticket ${ticketNumber} and our team will respond within 24 hours. In the meantime, is there anything else I can help you with?`
      
      await prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'assistant',
          content: escalationResponse,
          shouldEscalate: true,
        }
      })

      return new Response(JSON.stringify({
        sessionId: session.sessionToken,
        message: escalationResponse,
        escalated: true,
        ticketNumber,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Save user message
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'user',
        content: message,
      }
    })

    // Build RAG context
    const supportContext = await buildSupportContext(
      session.sessionToken,
      orderContext || session.orderContextId || undefined
    )

    const systemPrompt = `You are a friendly, helpful customer support assistant for CHOE Jewelers (also known as KISPER).

${supportContext}

GUIDELINES:
1. Be warm, conversational, and empathetic
2. Use the knowledge base to answer questions accurately
3. For warranty claims, guide customers to the warranty portal at /support/warranty
4. For order tracking, direct them to Amazon's "Your Orders" page
5. If you can't answer something, offer to connect them with a human
6. Never make up information - if unsure, say so
7. Keep responses concise (2-3 sentences usually)
8. Use emojis sparingly but appropriately 😊
9. If customer seems frustrated, acknowledge their feelings first
10. Always offer next steps or follow-up questions

DO NOT:
- Request reviews or ratings
- Direct customers off Amazon (except to our support portal)
- Make promises about specific refund amounts or timelines
- Share other customers' information
- Discuss competitors

If the customer needs human help or you can't resolve their issue, say something like:
"I'd be happy to connect you with our support team who can help further. Would you like me to create a support ticket?"

Respond naturally as a helpful support agent.`

    // Build messages for Claude
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...conversationHistory,
      { role: 'user', content: message }
    ]

    // Stream response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = ''

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            system: systemPrompt,
            messages,
            stream: true,
          })

          for await (const event of response) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const text = event.delta.text
              fullResponse += text
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            }
          }

          // Save assistant message
          await prisma.chatMessage.create({
            data: {
              sessionId: session!.id,
              role: 'assistant',
              content: fullResponse,
            }
          })

          // Send final event with session ID
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            done: true, 
            sessionId: session!.sessionToken 
          })}\n\n`))
          
          controller.close()
        } catch (error) {
          console.error('Stream error:', error)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            error: 'Sorry, I encountered an error. Please try again.' 
          })}\n\n`))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Support chat error:', error)
    return new Response(JSON.stringify({ 
      error: 'Something went wrong. Please try again or contact support directly.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// GET endpoint to retrieve chat history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const session = await prisma.chatSession.findUnique({
      where: { sessionToken: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        }
      }
    })

    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      sessionId: session.sessionToken,
      messages: session.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.createdAt,
      })),
      escalatedToTicket: session.escalatedToTicketId,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Get chat history error:', error)
    return new Response(JSON.stringify({ error: 'Failed to get chat history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

