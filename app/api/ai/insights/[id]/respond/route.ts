import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// POST /api/ai/insights/[id]/respond - User responds to an insight
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!anthropic) {
      return NextResponse.json({
        success: false,
        error: 'AI features require ANTHROPIC_API_KEY'
      }, { status: 500 })
    }

    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    const observationId = parseInt(params.id)
    const body = await request.json()
    const { message, quickResponse } = body

    // Get the observation
    const observation = await prisma.aiObservation.findFirst({
      where: {
        id: observationId,
        userId: profile.id
      },
      include: {
        conversations: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!observation) {
      return NextResponse.json({
        success: false,
        error: 'Observation not found'
      }, { status: 404 })
    }

    // Save user's response
    await prisma.aiInsightConversation.create({
      data: {
        observationId,
        role: 'user',
        content: message || quickResponse || '',
        quickResponse: quickResponse || null
      }
    })

    // Update observation status
    await prisma.aiObservation.update({
      where: { id: observationId },
      data: {
        status: 'responded',
        viewedAt: new Date()
      }
    })

    // Get business context to inform AI response
    const relevantContext = await prisma.aiBusinessContext.findMany({
      where: {
        userId: profile.id,
        subject: observation.data ? (observation.data as any).sku : null
      },
      take: 5
    })

    // Generate AI response using Claude
    const systemPrompt = `You are a helpful business advisor analyzing inventory and sales data. 
The user has responded to an observation you made. Generate a thoughtful, conversational response that:
1. Acknowledges their input
2. Provides relevant insights based on their response
3. Suggests actionable next steps if appropriate
4. Asks follow-up questions to learn more

Previous context about this business:
${relevantContext.map(c => `- ${c.contextType}: ${c.context}`).join('\n')}

Be conversational and helpful, not robotic.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Observation: ${observation.title}\n${observation.description || ''}\n\nUser said: ${message || quickResponse}`
        }
      ]
    })

    const aiResponse = response.content[0]
    if (aiResponse.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    // Save AI's response
    await prisma.aiInsightConversation.create({
      data: {
        observationId,
        role: 'ai',
        content: aiResponse.text
      }
    })

    // Check if AI suggests creating a tool or learning something
    const suggestedActions: string[] = []
    const followUpQuestion: string | null = null

    // TODO: Parse AI response to extract suggested actions and follow-up questions

    return NextResponse.json({
      success: true,
      aiResponse: aiResponse.text,
      suggestedActions,
      followUpQuestion
    })
  } catch (error) {
    console.error('Respond to insight error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to process response'
    }, { status: 500 })
  }
}

