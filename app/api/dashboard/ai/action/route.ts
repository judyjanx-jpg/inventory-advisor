import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { pendingActions } from '@/lib/pending-actions'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// Database schema context for the AI
const DATABASE_SCHEMA = `
DATABASE TABLES AND FIELDS:

products:
  - sku (string, unique) - Product SKU
  - title (string) - Product title  
  - cost (decimal) - Cost/COGS per unit
  - price (decimal) - Selling price
  - weight (decimal) - Product weight
  - length, width, height (decimal) - Dimensions
  - supplierId (int) - Link to supplier
  - isActive (boolean) - Whether product is active

inventory_levels:
  - masterSku (string) - Links to products.sku
  - fbaAvailable (int) - FBA available quantity
  - warehouseAvailable (int) - Warehouse quantity
  - fbaReserved (int) - FBA reserved

purchase_orders:
  - poNumber (string, unique) - PO number
  - status (string) - draft, sent, confirmed, shipped, partial, received, cancelled
  - supplierId (int) - Link to supplier
  - subtotal, total (decimal) - Order totals
  - expectedArrivalDate (date)

purchase_order_items:
  - poId (int) - Link to purchase_orders.id
  - masterSku (string) - Product SKU
  - quantityOrdered (int)
  - quantityReceived (int)
  - unitCost (decimal)

suppliers:
  - name (string) - Supplier name
  - email (string) - Contact email
  - leadTimeDays (int) - Lead time

goals:
  - title (string) - Goal title
  - targetValue (decimal) - Target number
  - currentValue (decimal) - Current progress
  - isCompleted (boolean)
  - color (string) - Display color

dashboard_cards:
  - cardType (string) - tasks, profit, schedule, goals, etc.
  - isEnabled (boolean) - Whether card is visible
  - column (string) - left or right

calendar_events:
  - title (string) - Event title
  - startDate (date)
  - startTime (string) - HH:MM format
  - eventType (string) - appointment, reminder, time_off
`

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
        error: 'AI features require ANTHROPIC_API_KEY to be configured.'
      }, { status: 503 })
    }

    // Get some sample data for context
    const [products, purchaseOrders, suppliers, goals] = await Promise.all([
      prisma.product.findMany({ take: 30, select: { sku: true, title: true, cost: true } }),
      prisma.purchaseOrder.findMany({ 
        where: { status: { notIn: ['received', 'cancelled'] } },
        take: 20, 
        select: { poNumber: true, status: true, supplierId: true }
      }),
      prisma.supplier.findMany({ take: 20, select: { id: true, name: true } }),
      prisma.goal.findMany({ take: 10, select: { id: true, title: true, isCompleted: true } })
    ])

    const systemPrompt = `You are a powerful AI assistant for an Amazon FBA inventory management system. You can execute a WIDE variety of actions on the database.

${DATABASE_SCHEMA}

CURRENT DATA CONTEXT:
- Products: ${products.slice(0, 15).map(p => `${p.sku} ($${p.cost || 'no cost'})`).join(', ')}${products.length > 15 ? '...' : ''}
- Pending POs: ${purchaseOrders.map(po => po.poNumber).join(', ') || '(none)'}
- Suppliers: ${suppliers.map(s => `${s.name} (id:${s.id})`).join(', ') || '(none)'}
- Goals: ${goals.map(g => `"${g.title}" (id:${g.id}, ${g.isCompleted ? 'done' : 'active'})`).join(', ') || '(none)'}

Parse the user's command and return a JSON object with the operation to perform:

{
  "understood": true,
  "operation": {
    "type": "update" | "create" | "delete" | "custom",
    "table": "products" | "inventory_levels" | "purchase_orders" | "suppliers" | "goals" | "dashboard_cards" | "calendar_events",
    "where": { "field": "value" },  // For update/delete
    "data": { "field": "value" },   // For update/create
    "description": "Human-readable description of what will happen"
  }
}

EXAMPLES:

1. "Update cost for SKU-123 to $4.50"
→ { "understood": true, "operation": { "type": "update", "table": "products", "where": { "sku": "SKU-123" }, "data": { "cost": 4.50 }, "description": "Update cost for SKU-123 to $4.50" } }

2. "Add a goal: Hit $100k revenue this month"
→ { "understood": true, "operation": { "type": "create", "table": "goals", "data": { "title": "Hit $100k revenue this month", "targetValue": 100000 }, "description": "Create new goal: Hit $100k revenue this month" } }

3. "Delete the goal about revenue"
→ { "understood": true, "operation": { "type": "delete", "table": "goals", "where": { "id": 1 }, "description": "Delete goal: Hit $100k revenue this month" } }

4. "Mark PO-2024-001 as received"
→ { "understood": true, "operation": { "type": "update", "table": "purchase_orders", "where": { "poNumber": "PO-2024-001" }, "data": { "status": "received" }, "description": "Mark PO-2024-001 as received" } }

5. "Set warehouse quantity for SKU-ABC to 500"
→ { "understood": true, "operation": { "type": "update", "table": "inventory_levels", "where": { "masterSku": "SKU-ABC" }, "data": { "warehouseAvailable": 500 }, "description": "Update warehouse quantity for SKU-ABC to 500" } }

6. "Add the goals card to dashboard"
→ { "understood": true, "operation": { "type": "update", "table": "dashboard_cards", "where": { "cardType": "goals" }, "data": { "isEnabled": true }, "upsert": true, "description": "Add goals card to dashboard" } }

7. "Create a new supplier called China Direct with email china@example.com"
→ { "understood": true, "operation": { "type": "create", "table": "suppliers", "data": { "name": "China Direct", "email": "china@example.com" }, "description": "Create new supplier: China Direct" } }

8. "Remind me to call the supplier tomorrow at 2pm"  
→ { "understood": true, "operation": { "type": "create", "table": "calendar_events", "data": { "title": "Call the supplier", "startDate": "2025-12-11", "startTime": "14:00", "eventType": "reminder" }, "description": "Add reminder: Call the supplier tomorrow at 2pm" } }

9. "Deactivate product SKU-OLD"
→ { "understood": true, "operation": { "type": "update", "table": "products", "where": { "sku": "SKU-OLD" }, "data": { "isActive": false }, "description": "Deactivate product SKU-OLD" } }

BE FLEXIBLE! Understand natural language variations:
- "change", "update", "set", "make" → update operation
- "add", "create", "new" → create operation  
- "remove", "delete", "hide" → delete or update with isEnabled: false
- "cost", "COGS", "unit cost" all mean the cost field
- "qty", "quantity", "stock", "inventory" mean inventory quantities

If the user's request is unclear, return:
{ "understood": false, "clarification": "What specifically would you like to do?" }

Return ONLY the JSON object, no other text.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: command }]
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

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
        error: "Sorry, I couldn't understand that. Try rephrasing your request."
      })
    }

    if (!parsed.understood) {
      return NextResponse.json({
        success: false,
        error: parsed.clarification || "I'm not sure what you want to do. Can you be more specific?"
      })
    }

    // Look up current values for update operations
    const operation = parsed.operation
    let currentData: any = null

    if (operation.type === 'update' && operation.where) {
      try {
        const model = (prisma as any)[operation.table]
        if (model) {
          currentData = await model.findFirst({ where: operation.where })
        }
      } catch (e) {
        // Ignore lookup errors
      }
    }

    // Create action ID and store pending action
    const actionId = randomUUID()
    pendingActions.set(actionId, {
      ...operation,
      command,
      currentData,
      createdAt: new Date()
    })

    setTimeout(() => pendingActions.delete(actionId), 5 * 60 * 1000)

    // Build preview
    const changes = operation.data && currentData ? 
      Object.keys(operation.data).map(field => ({
        field,
        from: currentData[field],
        to: operation.data[field]
      })) : undefined

    return NextResponse.json({
      success: true,
      preview: {
        actionId,
        action: `${operation.type} ${operation.table}`,
        description: operation.description,
        changes
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
