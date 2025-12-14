import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `You are a friendly and helpful customer support assistant for an e-commerce company. Your role is to assist customers with:

1. **Order Tracking**: Help customers find information about their orders. If they provide an order number, guide them to use the "Track Package" feature in the portal.

2. **Returns & Replacements**: Explain the return process and help with replacement tracking. Our return policy is 30 days from purchase for most items.

3. **Warranty Claims**: Guide customers through the warranty claim process. Most products have a 1-year manufacturer warranty. Direct them to the "Warranty Claim" section of the portal.

4. **Product Issues**: Help troubleshoot common product issues before suggesting returns or warranty claims.

5. **General Questions**: Answer questions about shipping times (typically 3-5 business days), payment methods, and other policies.

**Guidelines:**
- Be warm, professional, and empathetic
- Keep responses concise but helpful (2-4 sentences when possible)
- If you can't help with something, suggest they contact human support
- Never make up order information - direct them to use the tracking tools
- For warranty claims, always ask for the order number and description of the issue
- Use bullet points or numbered lists for multi-step instructions

**Common Policies:**
- Free shipping on orders over $50
- 30-day return window for most items
- 1-year manufacturer warranty on electronics
- 2-year warranty on furniture
- Replacements ship within 2-3 business days after approval`

export async function POST(request: NextRequest) {
  try {
    const { message, history } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Build conversation history for context
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          })
        }
      }
    }

    // Add the current message
    messages.push({
      role: 'user',
      content: message
    })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages
    })

    // Extract text response
    const textContent = response.content.find(block => block.type === 'text')
    const responseText = textContent && 'text' in textContent ? textContent.text : 'I apologize, but I was unable to generate a response.'

    return NextResponse.json({
      success: true,
      response: responseText
    })

  } catch (error: unknown) {
    console.error('Support chat error:', error)

    // Check if it's an API key error
    if (error instanceof Error && error.message?.includes('API key')) {
      return NextResponse.json({
        error: 'I apologize, but I am temporarily unavailable. Please try again later or contact support directly.'
      }, { status: 500 })
    }

    return NextResponse.json({
      error: 'I apologize, but I encountered an issue. Please try again or contact our support team directly.'
    }, { status: 500 })
  }
}
