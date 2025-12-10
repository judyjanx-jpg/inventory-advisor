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
  const yesterday = subDays(today, 1)
  const sameYesterdayLastYear = new Date(yesterday)
  sameYesterdayLastYear.setFullYear(sameYesterdayLastYear.getFullYear() - 1)

  // Get summary stats using raw SQL
  const [
    productCountResult, 
    topProductsResult, 
    lowStockResult, 
    pendingPOsResult, 
    dailySalesResult,
    dateRangeResult,
    yesterdaySalesResult,
    lastYearSameDayResult
  ] = await Promise.all([
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
    `, [subDays(today, 7).toISOString()]),

    // Date range of available data
    query<{ min_date: string; max_date: string }>(`
      SELECT 
        MIN(DATE(purchase_date)) as min_date,
        MAX(DATE(purchase_date)) as max_date
      FROM orders
    `, []),

    // Yesterday's sales
    query<{ revenue: number; profit: number; orders: number; units: number }>(`
      SELECT 
        SUM((oi.item_price + oi.shipping_price) * oi.quantity) as revenue,
        SUM(
          (oi.item_price + oi.shipping_price) * oi.quantity 
          - (oi.referral_fee + oi.fba_fee + oi.other_fees + oi.amazon_fees)
          - COALESCE(p.cost, 0) * oi.quantity
        ) as profit,
        COUNT(DISTINCT o.id) as orders,
        SUM(oi.quantity) as units
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE DATE(o.purchase_date) = DATE($1) AND o.status != 'Cancelled'
    `, [yesterday.toISOString()]),

    // Same day last year
    query<{ revenue: number; profit: number; orders: number; units: number }>(`
      SELECT 
        SUM((oi.item_price + oi.shipping_price) * oi.quantity) as revenue,
        SUM(
          (oi.item_price + oi.shipping_price) * oi.quantity 
          - (oi.referral_fee + oi.fba_fee + oi.other_fees + oi.amazon_fees)
          - COALESCE(p.cost, 0) * oi.quantity
        ) as profit,
        COUNT(DISTINCT o.id) as orders,
        SUM(oi.quantity) as units
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE DATE(o.purchase_date) = DATE($1) AND o.status != 'Cancelled'
    `, [sameYesterdayLastYear.toISOString()])
  ])

  const productCount = productCountResult[0]?.count || 0
  const topProducts = topProductsResult
  const lowStockItems = lowStockResult
  const pendingPOs = pendingPOsResult
  const dailySales = dailySalesResult
  const dateRange = dateRangeResult[0]
  const yesterdaySales = yesterdaySalesResult[0]
  const lastYearSameDay = lastYearSameDayResult[0]

  // Calculate totals
  let totalRevenue = 0
  let totalProfit = 0
  let totalOrders = 0
  for (const day of dailySales) {
    totalRevenue += Number(day.revenue || 0)
    totalProfit += Number(day.profit || 0)
    totalOrders += Number(day.orders || 0)
  }

  // Format yesterday and last year dates
  const yesterdayStr = format(yesterday, 'MMMM d, yyyy')
  const lastYearStr = format(sameYesterdayLastYear, 'MMMM d, yyyy')
  
  // Calculate YoY change
  const hasLastYearData = lastYearSameDay && Number(lastYearSameDay.revenue || 0) > 0
  let yoyRevenueChange = 'N/A'
  let yoyOrdersChange = 'N/A'
  if (hasLastYearData && yesterdaySales) {
    const yesterdayRev = Number(yesterdaySales.revenue || 0)
    const lastYearRev = Number(lastYearSameDay.revenue || 0)
    const revChange = ((yesterdayRev - lastYearRev) / lastYearRev) * 100
    yoyRevenueChange = `${revChange >= 0 ? '+' : ''}${revChange.toFixed(1)}%`
    
    const yesterdayOrders = Number(yesterdaySales.orders || 0)
    const lastYearOrders = Number(lastYearSameDay.orders || 0)
    if (lastYearOrders > 0) {
      const ordersChange = ((yesterdayOrders - lastYearOrders) / lastYearOrders) * 100
      yoyOrdersChange = `${ordersChange >= 0 ? '+' : ''}${ordersChange.toFixed(1)}%`
    }
  }

  // Build context string
  let context = `DATABASE SUMMARY:

DATA AVAILABILITY:
- Earliest order data: ${dateRange?.min_date || 'N/A'}
- Latest order data: ${dateRange?.max_date || 'N/A'}
- Total Products: ${productCount}

YESTERDAY'S PERFORMANCE (${yesterdayStr}):
- Revenue: $${Number(yesterdaySales?.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Profit: $${Number(yesterdaySales?.profit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Orders: ${Number(yesterdaySales?.orders || 0)}
- Units Sold: ${Number(yesterdaySales?.units || 0)}

SAME DAY LAST YEAR (${lastYearStr}):
${hasLastYearData ? `- Revenue: $${Number(lastYearSameDay.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Profit: $${Number(lastYearSameDay.profit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Orders: ${Number(lastYearSameDay.orders || 0)}
- Units Sold: ${Number(lastYearSameDay.units || 0)}` : '(No data available for this date last year)'}

YEAR-OVER-YEAR COMPARISON:
${hasLastYearData ? `- Revenue Change: ${yoyRevenueChange}
- Orders Change: ${yoyOrdersChange}` : '(Cannot calculate - no data from last year)'}

LAST 7 DAYS SUMMARY:
- Total Revenue: $${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Total Profit: $${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- Total Orders: ${totalOrders}

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

DAILY BREAKDOWN (last 7 days):
${dailySales.map(day => `${day.date}: $${Number(day.revenue).toFixed(2)} revenue, $${Number(day.profit).toFixed(2)} profit, ${day.orders} orders`).join('\n')}
`

  return context
}
