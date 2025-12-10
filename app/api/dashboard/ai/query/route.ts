import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { format, subDays } from 'date-fns'

// Only create client if API key exists
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question } = body

    if (!question?.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Please ask a question'
      }, { status: 400 })
    }

    if (!anthropic) {
      return NextResponse.json({
        success: false,
        error: 'AI features require ANTHROPIC_API_KEY to be configured. Please add it to your environment variables.'
      }, { status: 503 })
    }

    const today = new Date()

    // Build database context
    const dbContext = await buildDatabaseContext()

    const systemPrompt = `You are a helpful business analytics assistant for an Amazon FBA inventory management system.
Today's date is ${format(today, 'MMMM d, yyyy')}.

You have access to this business data:
${dbContext}

When answering questions:
1. If you can answer from the data provided, give a clear, conversational response
2. If data is missing, politely explain what data is needed
3. If the question is ambiguous, ask for clarification
4. Format numbers nicely (use $ for money, commas for large numbers)
5. Keep responses concise but informative
6. If showing multiple items, suggest a table visualization

Respond with a JSON object:
{
  "answer": "Your conversational response",
  "visualization": {
    "type": "table" | "text",
    "columns": ["Column1", "Column2"], // for tables
    "data": [{"Column1": "value1", "Column2": "value2"}] // for tables
  },
  "followUp": "Optional follow-up question suggestion",
  "needsClarification": false,
  "clarificationQuestion": "What specifically would you like to know?"
}

Only include visualization if it adds value. Keep it simple.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: question }
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
      // If parsing fails, return the text as the answer
      return NextResponse.json({
        success: true,
        answer: content.text
      })
    }

    if (parsed.needsClarification) {
      return NextResponse.json({
        success: true,
        answer: parsed.clarificationQuestion || "Could you be more specific?",
        followUp: parsed.followUp
      })
    }

    return NextResponse.json({
      success: true,
      answer: parsed.answer,
      visualization: parsed.visualization,
      followUp: parsed.followUp
    })
  } catch (error) {
    console.error('AI Query error:', error)
    return NextResponse.json({
      success: false,
      error: 'Something went wrong. Please try again.'
    }, { status: 500 })
  }
}

async function buildDatabaseContext(): Promise<string> {
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  // Get summary stats using raw SQL
  const [productCountResult, topProductsResult, lowStockResult, pendingPOsResult, dailySalesResult] = await Promise.all([
    // Product count
    query<{ count: number }>(`SELECT COUNT(*) as count FROM products`, []),
    
    // Top products by quantity sold
    query<{ sku: string; units: number; revenue: number }>(`
      SELECT 
        oi.master_sku as sku,
        SUM(oi.quantity) as units,
        SUM((oi.item_price + oi.shipping_price) * oi.quantity) as revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= $1 AND o.status != 'Cancelled'
      GROUP BY oi.master_sku
      ORDER BY units DESC
      LIMIT 10
    `, [thirtyDaysAgo.toISOString()]),

    // Low stock items
    query<{ sku: string; available: number }>(`
      SELECT master_sku as sku, fba_available as available
      FROM channel_inventory
      WHERE fba_available < 10 AND channel = 'Amazon'
      LIMIT 10
    `, []),

    // Pending POs
    prisma.purchaseOrder.findMany({
      where: { status: { notIn: ['received', 'cancelled'] } },
      select: { poNumber: true, status: true, expectedArrivalDate: true },
      take: 10
    }),

    // Daily sales last 7 days
    query<{ date: string; revenue: number; profit: number; orders: number }>(`
      SELECT 
        DATE(o.purchase_date) as date,
        SUM((oi.item_price + oi.shipping_price) * oi.quantity) as revenue,
        SUM(
          (oi.item_price + oi.shipping_price) * oi.quantity 
          - (oi.referral_fee + oi.fba_fee + oi.other_fees + oi.amazon_fees)
          - COALESCE(p.cost, 0) * oi.quantity
        ) as profit,
        COUNT(DISTINCT o.id) as orders
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE o.purchase_date >= $1 AND o.status != 'Cancelled'
      GROUP BY DATE(o.purchase_date)
      ORDER BY date DESC
      LIMIT 7
    `, [subDays(today, 7).toISOString()])
  ])

  const productCount = productCountResult[0]?.count || 0
  const topProducts = topProductsResult
  const lowStockItems = lowStockResult
  const pendingPOs = pendingPOsResult
  const dailySales = dailySalesResult

  // Calculate totals
  let totalRevenue = 0
  let totalProfit = 0
  let totalOrders = 0
  for (const day of dailySales) {
    totalRevenue += Number(day.revenue || 0)
    totalProfit += Number(day.profit || 0)
    totalOrders += Number(day.orders || 0)
  }

  // Build context string
  let context = `DATABASE SUMMARY (Last 7-30 days):

- Total Products: ${productCount}
- Total Revenue (7d): $${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Total Profit (7d): $${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Total Orders (7d): ${totalOrders}

TOP SELLING SKUs (last 30 days, by quantity):
${topProducts.slice(0, 5).map((p, i) => `${i + 1}. ${p.sku}: ${p.units} units, $${Number(p.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} revenue`).join('\n')}

LOW STOCK ITEMS (< 10 units):
${lowStockItems.length > 0 
  ? lowStockItems.map(i => `- ${i.sku}: ${i.available} units`).join('\n')
  : '(None)'}

PENDING PURCHASE ORDERS:
${pendingPOs.length > 0
  ? pendingPOs.map(po => `- ${po.poNumber}: ${po.status}${po.expectedArrivalDate ? ` (expected ${format(po.expectedArrivalDate, 'MMM d')})` : ''}`).join('\n')
  : '(None)'}

DAILY SUMMARY (last 7 days):
${dailySales.map(day => `${day.date}: $${Number(day.revenue).toFixed(2)} revenue, $${Number(day.profit).toFixed(2)} profit, ${day.orders} orders`).join('\n')}
`

  return context
}
