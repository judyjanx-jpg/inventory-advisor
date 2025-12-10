import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { pendingActions } from '@/lib/pending-actions'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// Database schema context for the AI
const DATABASE_SCHEMA = `
DATABASE TABLES - USER EDITABLE FIELDS:

products (user can edit):
  - cost (decimal) - Cost/COGS per unit ✓ EDITABLE
  - supplierId (int) - Link to supplier ✓ EDITABLE
  - isActive (boolean) - Whether product is active ✓ EDITABLE
  - weight, length, width, height (decimal) - Dimensions ✓ EDITABLE
  - NOTE: sku, asin, title come from Amazon - READ ONLY

inventory_levels (user can edit):
  - warehouseAvailable (int) - User's own warehouse quantity ✓ EDITABLE
  - warehouseReserved (int) - Reserved in warehouse ✓ EDITABLE
  - NOTE: fbaAvailable, fbaReserved, fbaInbound* come from Amazon API - READ ONLY, cannot be changed

purchase_orders (user can edit):
  - poNumber (string, unique) ✓ EDITABLE
  - status (string) - draft, sent, confirmed, shipped, partial, received, cancelled ✓ EDITABLE
  - supplierId (int) ✓ EDITABLE
  - expectedArrivalDate (date) ✓ EDITABLE
  - notes (text) ✓ EDITABLE

purchase_order_items (user can edit):
  - quantityOrdered (int) ✓ EDITABLE
  - quantityReceived (int) ✓ EDITABLE
  - unitCost (decimal) ✓ EDITABLE

suppliers (user can edit):
  - name (string) ✓ EDITABLE
  - email (string) ✓ EDITABLE
  - phone (string) ✓ EDITABLE
  - leadTimeDays (int) ✓ EDITABLE
  - minimumOrderQty (int) ✓ EDITABLE

goals (user can edit - all fields):
  - title (string) ✓ EDITABLE
  - targetValue (decimal) ✓ EDITABLE
  - currentValue (decimal) ✓ EDITABLE
  - isCompleted (boolean) ✓ EDITABLE
  - color (string) ✓ EDITABLE

dashboard_cards (user can edit):
  - isEnabled (boolean) ✓ EDITABLE
  - column (string) - left or right ✓ EDITABLE

calendar_events (user can edit - all fields):
  - title (string) ✓ EDITABLE
  - startDate (date) ✓ EDITABLE
  - startTime (string) ✓ EDITABLE
  - eventType (string) ✓ EDITABLE

IMPORTANT - READ-ONLY DATA (from Amazon API, cannot be changed):
  - Product ASIN, title, category, brand (synced from Amazon)
  - FBA inventory levels (fbaAvailable, fbaReserved, fbaInbound*)
  - Order data (orders, order_items) - historical sales data
  - Amazon fees (referral_fee, fba_fee, etc.)
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

    // Get available dashboard cards
    const dashboardCards = await prisma.dashboardCard.findMany({
      where: { userId: 1 },
      select: { cardType: true, isEnabled: true }
    })

    const systemPrompt = `You are a powerful AI assistant for an Amazon FBA inventory management system. You can execute a WIDE variety of actions on the database.

${DATABASE_SCHEMA}

AVAILABLE DASHBOARD CARDS (can be shown/hidden):
- tasks: Today's tasks summary (enabled: ${dashboardCards.find(c => c.cardType === 'tasks')?.isEnabled ?? true})
- profit: Quick profit metrics (enabled: ${dashboardCards.find(c => c.cardType === 'profit')?.isEnabled ?? true})
- schedule: Calendar & work hours (enabled: ${dashboardCards.find(c => c.cardType === 'schedule')?.isEnabled ?? true})
- goals: My Goals list - USE THIS for tracking items, to-dos, notes, new products, ideas! (enabled: ${dashboardCards.find(c => c.cardType === 'goals')?.isEnabled ?? false})

CURRENT DATA CONTEXT:
- Products: ${products.slice(0, 15).map(p => `${p.sku} ($${p.cost || 'no cost'})`).join(', ')}${products.length > 15 ? '...' : ''}
- Pending POs: ${purchaseOrders.map(po => po.poNumber).join(', ') || '(none)'}
- Suppliers: ${suppliers.map(s => `${s.name} (id:${s.id})`).join(', ') || '(none)'}
- Goals/Items list: ${goals.map(g => `"${g.title}" (id:${g.id}, ${g.isCompleted ? 'done' : 'active'})`).join(', ') || '(none)'}

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

6. "Add the goals card to dashboard" or "Show goals card" or "I want to track new items"
→ { "understood": true, "operation": { "type": "update", "table": "dashboard_cards", "where": { "cardType": "goals" }, "data": { "isEnabled": true }, "upsert": true, "description": "Enable Goals card on dashboard - use this to track items, ideas, and notes!" } }

6b. "Hide the profit card" or "Remove schedule card"
→ { "understood": true, "operation": { "type": "update", "table": "dashboard_cards", "where": { "cardType": "profit" }, "data": { "isEnabled": false }, "upsert": true, "description": "Hide profit card from dashboard" } }

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

IMPORTANT - CUSTOM CARD/LIST REQUESTS:
When user asks for a "new card", "custom list", "track items", "new items list", "to-do list", "notes card", etc.:
1. First, ENABLE the "goals" card (it's a flexible list for tracking anything)
2. Then optionally add items to the goals list
Example: "Create a card for tracking new products I'm researching"
→ { "understood": true, "operation": { "type": "update", "table": "dashboard_cards", "where": { "cardType": "goals" }, "data": { "isEnabled": true }, "upsert": true, "description": "Enable Goals card - perfect for tracking new products, ideas, and to-do items!" } }

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
