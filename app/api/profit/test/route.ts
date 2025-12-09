// app/api/profit/test/route.ts
// Simple test endpoint to verify profit API is working

import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Test 1: Check database connection
    const dbTest = await queryOne<{ test: string }>(`SELECT 'OK' as test`)
    console.log('Database connection test:', dbTest)

    // Test 2: Check if we have any orders
    const orderCount = await queryOne<{ count: string }>(`
      SELECT COUNT(*)::text as count 
      FROM orders 
      WHERE status NOT IN ('Cancelled', 'Canceled')
      LIMIT 1
    `)
    console.log('Order count:', orderCount)

    // Test 3: Check if we have any order items
    const itemCount = await queryOne<{ count: string }>(`
      SELECT COUNT(*)::text as count 
      FROM order_items 
      LIMIT 1
    `)
    console.log('Order item count:', itemCount)

    // Test 4: Check yesterday's data
    const yesterdayData = await queryOne<{
      orders: string
      items: string
      units: string
    }>(`
      SELECT 
        COUNT(DISTINCT o.id)::text as orders,
        COUNT(oi.id)::text as items,
        COALESCE(SUM(oi.quantity), 0)::text as units
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
    `)

    return NextResponse.json({
      success: true,
      database: dbTest?.test || 'FAILED',
      totalOrders: orderCount?.count || '0',
      totalItems: itemCount?.count || '0',
      yesterday: yesterdayData || { orders: '0', items: '0', units: '0' },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Test endpoint error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

