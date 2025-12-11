import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getDateRangeForPeriod } from '@/lib/profit/engine'

/**
 * Debug endpoint to export orders for comparison with Sellerboard
 * Usage: GET /api/debug/orders-export?period=yesterday
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'yesterday'

    const range = getDateRangeForPeriod(period)

    // Get all order items for the period with full details
    const orders = await query<{
      amazon_order_id: string
      purchase_date: string
      status: string
      asin: string
      master_sku: string
      title: string
      quantity: number
      item_price: number
      shipping_price: number
      gift_wrap_price: number
      promo_discount: number
      actual_revenue: number
      gross_revenue: number
      amazon_fees: number
      referral_fee: number
      fba_fee: number
    }>(`
      SELECT
        o.amazon_order_id,
        o.purchase_date::text,
        o.status,
        oi.asin,
        oi.master_sku,
        oi.title,
        oi.quantity,
        COALESCE(oi.item_price, 0) as item_price,
        COALESCE(oi.shipping_price, 0) as shipping_price,
        COALESCE(oi.gift_wrap_price, 0) as gift_wrap_price,
        COALESCE(oi.promo_discount, 0) as promo_discount,
        COALESCE(oi.actual_revenue, 0) as actual_revenue,
        COALESCE(oi.gross_revenue, 0) as gross_revenue,
        COALESCE(oi.amazon_fees, 0) as amazon_fees,
        COALESCE(oi.referral_fee, 0) as referral_fee,
        COALESCE(oi.fba_fee, 0) as fba_fee
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= $1
        AND o.purchase_date < $2
      ORDER BY o.purchase_date, o.amazon_order_id
    `, [range.start, range.end])

    // Summary stats
    const summary = {
      period,
      dateRange: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        label: range.label
      },
      totalOrders: new Set(orders.map(o => o.amazon_order_id)).size,
      totalLineItems: orders.length,
      totalUnits: orders.reduce((sum, o) => sum + (o.quantity || 0), 0),
      byStatus: {} as Record<string, { orders: number, units: number }>,
    }

    // Group by status
    for (const order of orders) {
      if (!summary.byStatus[order.status]) {
        summary.byStatus[order.status] = { orders: 0, units: 0 }
      }
      summary.byStatus[order.status].units += (order.quantity || 0)
    }

    // Count unique orders per status
    const ordersByStatus = new Map<string, Set<string>>()
    for (const order of orders) {
      if (!ordersByStatus.has(order.status)) {
        ordersByStatus.set(order.status, new Set())
      }
      ordersByStatus.get(order.status)!.add(order.amazon_order_id)
    }
    for (const [status, orderSet] of ordersByStatus) {
      summary.byStatus[status].orders = orderSet.size
    }

    return NextResponse.json({
      success: true,
      summary,
      orders: orders.map(o => ({
        orderId: o.amazon_order_id,
        date: o.purchase_date,
        status: o.status,
        asin: o.asin,
        sku: o.master_sku,
        title: o.title?.substring(0, 50),
        qty: o.quantity || 0,
        itemPrice: o.item_price,
        shipping: o.shipping_price,
        giftWrap: o.gift_wrap_price,
        promo: o.promo_discount,
        actualRevenue: o.actual_revenue,
        grossRevenue: o.gross_revenue,
        amazonFees: o.amazon_fees,
      }))
    })
  } catch (error: any) {
    console.error('Debug orders export error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      stack: error.stack
    }, { status: 500 })
  }
}
