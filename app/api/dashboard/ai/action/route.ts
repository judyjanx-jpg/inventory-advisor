import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { pendingActions } from '@/lib/pending-actions'

// Only create client if API key exists
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { command } = body

    if (!command?.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Please provide a command'
      }, { status: 400 })
    }

    if (!anthropic) {
      return NextResponse.json({
        success: false,
        error: 'AI features require ANTHROPIC_API_KEY to be configured. Please add it to your environment variables.'
      }, { status: 503 })
    }

    // Get some context about available SKUs and data
    const products = await prisma.product.findMany({
      take: 50,
      select: { sku: true, title: true, cost: true }
    })
    
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { status: { notIn: ['received', 'cancelled'] } },
      take: 20,
      select: { poNumber: true, status: true }
    })

    const systemPrompt = `You are a helpful assistant that parses business commands for an Amazon FBA inventory system.

Available data:
- Products/SKUs: ${products.slice(0, 20).map(p => p.sku).join(', ')}${products.length > 20 ? '...' : ''}
- Pending POs: ${purchaseOrders.map(po => po.poNumber).join(', ') || '(none)'}
- Dashboard cards that can be added/removed: goals, top_products, inventory_summary

Parse the user's command and return a JSON object:

{
  "understood": true/false,
  "needsClarification": true/false,
  "question": "Clarification question if needed",
  "action": {
    "type": "update_inventory" | "update_cost" | "create_po" | "update_po" | "dismiss_recommendations" | "add_card" | "remove_card" | "unknown",
    "sku": "SKU-123",
    "poNumber": "PO-123",
    "cardType": "goals",
    "field": "field_name",
    "fromValue": "current value",
    "toValue": "new value",
    "quantity": 500,
    "description": "Human readable description of the action"
  }
}

IMPORTANT: Be flexible in understanding user intent. Here are examples of commands you should understand:

DASHBOARD CARD management:
- "Add a goals card" → add_card, cardType: "goals"
- "Add the goals card to the dashboard" → add_card, cardType: "goals"
- "I want to see my goals" → add_card, cardType: "goals"
- "Show me top products" → add_card, cardType: "top_products"
- "Add inventory summary" → add_card, cardType: "inventory_summary"
- "Remove the goals card" → remove_card, cardType: "goals"
- "Hide the schedule card" → remove_card, cardType: "schedule"
- "I don't need the profit card" → remove_card, cardType: "profit"

Available card types: goals, top_products, inventory_summary, tasks, profit, schedule

COST/COGS updates (all mean the same thing - updating product cost):
- "Update cost for SKU-123 to $4.50" → update_cost
- "Change COGS for SKU-123 to 4.50" → update_cost
- "Set the cost of SKU-123 to $4.50" → update_cost
- "Add COGS for SKU-123 to $2.54" → update_cost
- "The cost for SKU-123 is $4.50" → update_cost
- "SKU-123 costs $4.50" → update_cost

Inventory updates:
- "Change warehouse qty for SKU-123 to 500" → update_inventory
- "Set inventory for SKU-123 to 500" → update_inventory
- "Update stock for SKU-123 to 500" → update_inventory

PO updates:
- "Mark PO #1234 as received" → update_po
- "PO 1234 has been received" → update_po
- "Received PO #1234" → update_po

When parsing:
- Strip $ symbols from monetary values
- Convert values like "$2.54" to 2.54
- The SKU might appear anywhere in the command
- "COGS" and "cost" mean the same thing
- Always set understood: true if you can figure out the intent

If you need more info (like quantity for creating a PO), set needsClarification: true.
Only set understood: false if you truly cannot figure out what the user wants.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: command }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    let parsed
    try {
      let jsonStr = content.text.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
      }
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({
        success: false,
        error: "Sorry, I couldn't understand that command. Try being more specific."
      })
    }

    if (!parsed.understood) {
      return NextResponse.json({
        success: false,
        error: "I'm not sure what you're asking. Try something like 'Update warehouse qty for SKU-123 to 500'."
      })
    }

    if (parsed.needsClarification) {
      return NextResponse.json({
        success: true,
        needsClarification: true,
        question: parsed.question
      })
    }

    // Look up current values for context
    const action = parsed.action
    let currentValue = null

    if (action.type === 'update_inventory' && action.sku) {
      const inv = await prisma.inventoryLevel.findFirst({
        where: { masterSku: action.sku }
      })
      currentValue = inv?.warehouseAvailable
      action.fromValue = currentValue
    } else if (action.type === 'update_cost' && action.sku) {
      const product = await prisma.product.findFirst({
        where: { sku: action.sku }
      })
      currentValue = product?.cost
      action.fromValue = currentValue ? Number(currentValue) : null
    } else if (action.type === 'update_po' && action.poNumber) {
      const po = await prisma.purchaseOrder.findFirst({
        where: { poNumber: action.poNumber }
      })
      currentValue = po?.status
      action.fromValue = currentValue
    }

    // Create action ID and store pending action
    const actionId = randomUUID()
    pendingActions.set(actionId, {
      ...action,
      command,
      createdAt: new Date()
    })

    // Auto-expire pending actions after 5 minutes
    setTimeout(() => pendingActions.delete(actionId), 5 * 60 * 1000)

    return NextResponse.json({
      success: true,
      preview: {
        actionId,
        action: action.type,
        description: action.description,
        changes: action.fromValue !== undefined ? [{
          field: action.field || action.type.replace('update_', ''),
          from: action.fromValue,
          to: action.toValue
        }] : undefined
      }
    })
  } catch (error) {
    console.error('AI Action error:', error)
    return NextResponse.json({
      success: false,
      error: 'Something went wrong. Please try again.'
    }, { status: 500 })
  }
}

