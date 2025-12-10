import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// Intent classification patterns
const QUERY_PATTERNS = [
  'what is', 'what are', 'show me', 'how many', 'how much',
  'compare', 'top', 'best', 'worst', 'trend', 'average',
  'total', 'list', 'which', 'who', 'when', 'where'
]

const ACTION_PATTERNS = {
  'update_inventory': ['change qty', 'update quantity', 'set stock', 'adjust inventory', 'warehouse qty'],
  'update_cost': ['change cost', 'update cost', 'set price', 'adjust cost'],
  'create_po': ['create po', 'new purchase order', 'order from supplier', 'reorder'],
  'receive_po': ['receive po', 'mark received', 'po arrived', 'shipment arrived'],
  'dismiss_recommendation': ['dismiss', 'ignore recommendation', 'skip']
}

const TOOL_PATTERNS = {
  'data_card': ['add a card', 'card showing', 'card with', 'on my dashboard', 'dashboard card'],
  'notepad': ['notepad', 'notes', 'write down', 'remember', 'memo'],
  'chart': ['chart', 'graph', 'visualize', 'trend line'],
  'quick_action': ['quick button', 'one-click', 'shortcut button'],
  'filtered_list': ['list of', 'filter', 'only show', 'items where'],
  'growth_tracker': ['growth', 'skus to grow', 'optimize', 'monitor skus', 'track growth']
}

const TOO_COMPLEX_RESPONSES = [
  "Ooh, that's a spicy one! 🌶️ I'd need the dev team's help to build that properly.",
  "Okay I'm good, but I'm not THAT good! 😅 This one needs some engineering magic.",
  "Love the ambition! This is beyond my toolbox though.",
  "My circuits are tingling... this is a job for the humans!",
  "That's a great idea! It's also above my pay grade. Let me write it up for the team.",
  "*sweats in AI* ... Yeah, gonna need backup on this one."
]

function classifyIntent(input: string): 'query' | 'action' | 'create_tool' | 'feature_request' {
  const lower = input.toLowerCase()

  // Check for query patterns
  if (QUERY_PATTERNS.some(pattern => lower.includes(pattern))) {
    return 'query'
  }

  // Check for action patterns
  for (const [action, patterns] of Object.entries(ACTION_PATTERNS)) {
    if (patterns.some(pattern => lower.includes(pattern))) {
      return 'action'
    }
  }

  // Check for tool creation patterns
  for (const [toolType, patterns] of Object.entries(TOOL_PATTERNS)) {
    if (patterns.some(pattern => lower.includes(pattern))) {
      return 'create_tool'
    }
  }

  // Default to feature request if nothing matches
  return 'feature_request'
}

async function handleQuery(input: string, profile: any) {
  if (!anthropic) {
    return {
      success: false,
      error: 'AI features require ANTHROPIC_API_KEY'
    }
  }

  // Use Claude to generate a query response
  const systemPrompt = `You are a helpful inventory management assistant. Answer questions about inventory, sales, products, and business data.

You can access:
- Products and inventory levels
- Sales and profit data
- Purchase orders
- Recommendations

Be conversational and helpful. If you need specific data, mention what you're looking for.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: input }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    // TODO: Parse response to extract data queries and execute them
    // For now, return the text response

    return {
      success: true,
      answer: content.text,
      intent: 'query'
    }
  } catch (error) {
    console.error('Query error:', error)
    return {
      success: false,
      error: 'Failed to process query'
    }
  }
}

async function handleAction(input: string, profile: any) {
  if (!anthropic) {
    return {
      success: false,
      error: 'AI features require ANTHROPIC_API_KEY'
    }
  }

  // Use Claude to parse the action and generate a preview
  const systemPrompt = `You are an inventory management assistant. Parse user commands to execute actions.

Available actions:
- update_inventory: Change warehouse or Amazon quantity for a SKU
- update_cost: Change product cost
- create_po: Create a purchase order
- receive_po: Mark a PO as received
- dismiss_recommendation: Dismiss a recommendation

Parse the user's command and return a JSON object with:
{
  "action": "action_name",
  "params": { ... },
  "description": "Human-readable description",
  "changes": [{"field": "...", "from": "...", "to": "..."}]
}

Be specific about what will change.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: input }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    // Try to parse JSON from response
    let preview
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        preview = JSON.parse(jsonMatch[0])
      } else {
        // Fallback: create a simple preview
        preview = {
          action: 'unknown',
          description: content.text,
          changes: []
        }
      }
    } catch (e) {
      preview = {
        action: 'unknown',
        description: content.text,
        changes: []
      }
    }

    // Generate action ID for confirmation
    const actionId = `action_${Date.now()}`

    // Log the action
    await prisma.aiActionLog.create({
      data: {
        userId: profile.id,
        actionType: 'action',
        input,
        intent: 'action',
        actionTaken: preview.description
      }
    })

    return {
      success: true,
      intent: 'action',
      preview: {
        ...preview,
        actionId
      },
      answer: `I'll ${preview.description.toLowerCase()}. Please confirm:`
    }
  } catch (error) {
    console.error('Action error:', error)
    return {
      success: false,
      error: 'Failed to process action'
    }
  }
}

async function handleCreateTool(input: string, profile: any) {
  if (!anthropic) {
    return {
      success: false,
      error: 'AI features require ANTHROPIC_API_KEY'
    }
  }

  // Use Claude to determine tool type and config
  const systemPrompt = `You are an inventory management assistant. Create user tools based on requests.

Available tool types:
- data_card: Display metrics or data (needs queryType, limit, display, columns)
- notepad: Free-form text storage (needs content)
- chart: Visualizations (needs queryType, days, chartType)
- quick_action: One-click buttons (needs action, params, buttonLabel)
- filtered_list: Custom data views (needs source, filters, columns, sort, limit)
- growth_tracker: Monitor SKUs for growth (needs skus array, readyThreshold, display)

Parse the user's request and return a JSON object with:
{
  "toolType": "tool_type",
  "title": "Tool Title",
  "config": { ... }
}

Be creative and helpful.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: input }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    // Parse tool config from response
    let toolConfig
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        toolConfig = JSON.parse(jsonMatch[0])
      } else {
        // Fallback: create a notepad
        toolConfig = {
          toolType: 'notepad',
          title: 'My Notes',
          config: { content: '' }
        }
      }
    } catch (e) {
      toolConfig = {
        toolType: 'notepad',
        title: 'My Notes',
        config: { content: '' }
      }
    }

    // Create the tool
    const maxPosition = await prisma.userTool.aggregate({
      where: { userId: profile.id },
      _max: { position: true }
    })

    const tool = await prisma.userTool.create({
      data: {
        userId: profile.id,
        toolType: toolConfig.toolType,
        title: toolConfig.title,
        config: toolConfig.config,
        position: (maxPosition._max.position || 0) + 1,
        createdBy: 'ai'
      }
    })

    // Log the action
    await prisma.aiActionLog.create({
      data: {
        userId: profile.id,
        actionType: 'create_tool',
        input,
        intent: 'create_tool',
        actionTaken: `Created ${toolConfig.toolType} tool: ${toolConfig.title}`,
        result: { toolId: tool.id }
      }
    })

    return {
      success: true,
      intent: 'create_tool',
      answer: `Done! ✨ I've created "${toolConfig.title}" and added it to your tools.`,
      toolCreated: {
        id: tool.id,
        title: tool.title,
        toolType: tool.toolType
      }
    }
  } catch (error) {
    console.error('Create tool error:', error)
    return {
      success: false,
      error: 'Failed to create tool'
    }
  }
}

async function handleFeatureRequest(input: string, profile: any) {
  if (!anthropic) {
    return {
      success: false,
      error: 'AI features require ANTHROPIC_API_KEY'
    }
  }

  // Use Claude to analyze the request
  const systemPrompt = `You are a helpful assistant. When users request complex features you can't build, analyze the request and suggest an approach.

Return a JSON object with:
{
  "funnyMessage": "A friendly, humorous response",
  "suggestedApproach": "What would be needed to build this"
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        { role: 'user', content: input }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    let analysis
    try {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        analysis = {
          funnyMessage: TOO_COMPLEX_RESPONSES[Math.floor(Math.random() * TOO_COMPLEX_RESPONSES.length)],
          suggestedApproach: 'This feature would require engineering work beyond my capabilities.'
        }
      }
    } catch (e) {
      analysis = {
        funnyMessage: TOO_COMPLEX_RESPONSES[Math.floor(Math.random() * TOO_COMPLEX_RESPONSES.length)],
        suggestedApproach: 'This feature would require engineering work beyond my capabilities.'
      }
    }

    // Create feature request
    const featureRequest = await prisma.featureRequest.create({
      data: {
        userId: profile.id,
        requestText: input,
        aiAnalysis: analysis.suggestedApproach,
        aiSuggestedApproach: analysis.suggestedApproach
      }
    })

    // Log the action
    await prisma.aiActionLog.create({
      data: {
        userId: profile.id,
        actionType: 'feature_request',
        input,
        intent: 'feature_request',
        actionTaken: 'Created feature request',
        result: { featureRequestId: featureRequest.id }
      }
    })

    return {
      success: true,
      intent: 'feature_request',
      answer: analysis.funnyMessage,
      featureRequest: {
        id: featureRequest.id,
        funnyMessage: analysis.funnyMessage,
        suggestedApproach: analysis.suggestedApproach
      }
    }
  } catch (error) {
    console.error('Feature request error:', error)
    return {
      success: false,
      error: 'Failed to create feature request'
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!anthropic) {
      return NextResponse.json({
        success: false,
        error: 'AI features require ANTHROPIC_API_KEY to be configured'
      }, { status: 500 })
    }

    const { input } = await request.json()

    if (!input || typeof input !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Input is required'
      }, { status: 400 })
    }

    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    // Classify intent
    const intent = classifyIntent(input)

    // Route to appropriate handler
    let result
    switch (intent) {
      case 'query':
        result = await handleQuery(input, profile)
        break
      case 'action':
        result = await handleAction(input, profile)
        break
      case 'create_tool':
        result = await handleCreateTool(input, profile)
        break
      case 'feature_request':
        result = await handleFeatureRequest(input, profile)
        break
      default:
        result = {
          success: false,
          error: 'Unknown intent'
        }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('AI Assist error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to process request'
    }, { status: 500 })
  }
}
