// app/api/debug/profit-diagnostics/route.ts
// Diagnostic queries to help pinpoint profit calculation issues

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const results: any = {}

    // Query 1: Check what order statuses exist and their counts
    const statusCounts = await prisma.$queryRaw<Array<{ status: string | null; order_count: bigint }>>`
      SELECT status, COUNT(*)::bigint as order_count 
      FROM orders 
      WHERE purchase_date >= NOW() - INTERVAL '1 day'
      GROUP BY status
      ORDER BY order_count DESC
    `
    results.orderStatuses = statusCounts.map((row: { status: string | null; order_count: bigint }) => ({
      status: row.status,
      order_count: Number(row.order_count)
    }))

    // Query 2: Check if item_price is per-unit or line total
    const sampleItems = await prisma.$queryRaw<Array<{
      master_sku: string;
      quantity: number;
      item_price: number;
      price_per_unit_if_total: number | null;
      shipping_price: number | null;
      gift_wrap_price: number | null;
      gross_revenue: number | null;
    }>>`
      SELECT 
        master_sku,
        quantity,
        item_price,
        item_price / NULLIF(quantity, 0) as price_per_unit_if_total,
        shipping_price,
        gift_wrap_price,
        gross_revenue
      FROM order_items 
      ORDER BY id DESC
      LIMIT 10
    `
    results.sampleItems = sampleItems

    // Query 3: Compare totals with and without status filter (yesterday)
    const yesterdayTotals = await prisma.$queryRaw<Array<{
      orders: bigint;
      units: bigint | null;
      sales_current_calc: number | null;
      sales_with_gross_revenue: number | null;
      sales_if_per_unit: number | null;
    }>>`
      SELECT 
        COUNT(DISTINCT o.id)::bigint as orders,
        SUM(oi.quantity)::bigint as units,
        SUM(oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)) as sales_current_calc,
        SUM(COALESCE(oi.gross_revenue, oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0))) as sales_with_gross_revenue,
        SUM((oi.item_price * oi.quantity) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)) as sales_if_per_unit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
    `
    const totals = yesterdayTotals[0]
    results.yesterdayTotals = totals ? {
      orders: Number(totals.orders),
      units: Number(totals.units || 0),
      sales_current_calc: Number(totals.sales_current_calc || 0),
      sales_with_gross_revenue: Number(totals.sales_with_gross_revenue || 0),
      sales_if_per_unit: Number(totals.sales_if_per_unit || 0)
    } : {}

    // Query 4: Check orders by status for yesterday
    const yesterdayByStatus = await prisma.$queryRaw<Array<{
      status: string | null;
      orders: bigint;
      units: bigint | null;
      sales: number | null;
    }>>`
      SELECT 
        o.status,
        COUNT(DISTINCT o.id)::bigint as orders,
        SUM(oi.quantity)::bigint as units,
        SUM(COALESCE(oi.gross_revenue, oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0))) as sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
      GROUP BY o.status
      ORDER BY orders DESC
    `
    results.yesterdayByStatus = yesterdayByStatus.map((row: { status: string | null; orders: bigint; units: bigint | null; sales: number | null }) => ({
      status: row.status,
      orders: Number(row.orders),
      units: Number(row.units || 0),
      sales: Number(row.sales || 0)
    }))

    // Query 5: Check for orders without items
    const ordersWithoutItems = await prisma.$queryRaw<Array<{ order_count: bigint }>>`
      SELECT 
        COUNT(*)::bigint as order_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
        AND oi.id IS NULL
    `
    results.ordersWithoutItems = Number(ordersWithoutItems[0]?.order_count || 0)

    // Query 6: Check for items with NULL or 0 gross_revenue
    const itemsWithoutGrossRevenue = await prisma.$queryRaw<Array<{
      item_count: bigint;
      calculated_sales: number | null;
    }>>`
      SELECT 
        COUNT(*)::bigint as item_count,
        SUM(oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)) as calculated_sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
        AND (oi.gross_revenue IS NULL OR oi.gross_revenue = 0)
    `
    const itemsWithoutGross = itemsWithoutGrossRevenue[0]
    results.itemsWithoutGrossRevenue = itemsWithoutGross ? {
      item_count: Number(itemsWithoutGross.item_count),
      calculated_sales: Number(itemsWithoutGross.calculated_sales || 0)
    } : {}

    // Query 7: Check items with $0 item_price by status
    const zeroPriceItems = await prisma.$queryRaw<Array<{
      status: string | null;
      items: bigint;
      units: bigint | null;
    }>>`
      SELECT 
        o.status,
        COUNT(*)::bigint as items,
        SUM(oi.quantity)::bigint as units
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND (oi.item_price = 0 OR oi.item_price IS NULL)
      GROUP BY o.status
    `
    results.zeroPriceItemsByStatus = zeroPriceItems.map((row: { status: string | null; items: bigint; units: bigint | null }) => ({
      status: row.status,
      items: Number(row.items),
      units: Number(row.units || 0)
    }))

    // Query 8: Check for orders without ANY items
    const ordersWithoutAnyItems = await prisma.$queryRaw<Array<{ orders_without_items: bigint }>>`
      SELECT COUNT(*)::bigint as orders_without_items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND oi.id IS NULL
    `
    results.ordersWithoutAnyItems = Number(ordersWithoutAnyItems[0]?.orders_without_items || 0)

    // Query 9: Total orders in database vs orders with items (yesterday)
    const orderComparison = await prisma.$queryRaw<Array<{
      total_orders_in_db: bigint;
      orders_with_items: bigint;
      orders_without_items: bigint;
    }>>`
      SELECT 
        COUNT(DISTINCT o.id)::bigint as total_orders_in_db,
        COUNT(DISTINCT CASE WHEN oi.id IS NOT NULL THEN o.id END)::bigint as orders_with_items,
        COUNT(DISTINCT CASE WHEN oi.id IS NULL THEN o.id END)::bigint as orders_without_items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
    `
    const orderComp = orderComparison[0]
    results.orderComparison = orderComp ? {
      total_orders_in_db: Number(orderComp.total_orders_in_db),
      orders_with_items: Number(orderComp.orders_with_items),
      orders_without_items: Number(orderComp.orders_without_items)
    } : {}

    // Query 10: Orders by status breakdown (yesterday) - to see which statuses are missing
    const ordersByStatus = await prisma.$queryRaw<Array<{
      status: string | null;
      order_count: bigint;
      orders_with_items: bigint;
      orders_without_items: bigint;
    }>>`
      SELECT 
        o.status,
        COUNT(DISTINCT o.id)::bigint as order_count,
        COUNT(DISTINCT CASE WHEN oi.id IS NOT NULL THEN o.id END)::bigint as orders_with_items,
        COUNT(DISTINCT CASE WHEN oi.id IS NULL THEN o.id END)::bigint as orders_without_items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
      GROUP BY o.status
      ORDER BY order_count DESC
    `
    results.ordersByStatusBreakdown = ordersByStatus.map((row: { status: string | null; order_count: bigint; orders_with_items: bigint; orders_without_items: bigint }) => ({
      status: row.status,
      order_count: Number(row.order_count),
      orders_with_items: Number(row.orders_with_items),
      orders_without_items: Number(row.orders_without_items)
    }))

    // Query 11: Sample of Pending orders with $0 items
    const pendingZeroPriceOrders = await prisma.$queryRaw<Array<{
      amazon_order_id: string;
      purchase_date: Date;
      status: string;
      synced_at: Date;
      master_sku: string;
      quantity: number;
      item_price: number | null;
      asin: string | null;
    }>>`
      SELECT 
        o.id as amazon_order_id,
        o.purchase_date,
        o.status,
        o.created_at as synced_at,
        oi.master_sku,
        oi.quantity,
        oi.item_price,
        oi.asin
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status = 'Pending'
        AND (oi.item_price = 0 OR oi.item_price IS NULL)
      LIMIT 10
    `
    results.pendingZeroPriceOrders = pendingZeroPriceOrders.map((row: { amazon_order_id: string; purchase_date: Date; status: string; synced_at: Date; master_sku: string; quantity: number; item_price: number | null; asin: string | null }) => ({
      amazon_order_id: row.amazon_order_id,
      purchase_date: row.purchase_date.toISOString(),
      status: row.status,
      synced_at: row.synced_at.toISOString(),
      master_sku: row.master_sku,
      quantity: row.quantity,
      item_price: row.item_price,
      asin: row.asin
    }))

    // Query 12: Compare distinct orders vs order line items for yesterday
    const yesterdayOrderComparison = await prisma.$queryRaw<Array<{
      unique_orders: bigint;
      unique_amazon_orders: bigint;
      order_line_items: bigint;
      total_units: bigint | null;
    }>>`
      SELECT 
        COUNT(DISTINCT o.id)::bigint as unique_orders,
        COUNT(DISTINCT o.amazon_order_id)::bigint as unique_amazon_orders,
        COUNT(oi.id)::bigint as order_line_items,
        SUM(oi.quantity)::bigint as total_units
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '1 day'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
    `
    const yesterdayComp = yesterdayOrderComparison[0]
    results.yesterdayOrderComparison = yesterdayComp ? {
      unique_orders: Number(yesterdayComp.unique_orders),
      unique_amazon_orders: Number(yesterdayComp.unique_amazon_orders),
      order_line_items: Number(yesterdayComp.order_line_items),
      total_units: Number(yesterdayComp.total_units || 0),
      note: 'SellerBoard counts order_line_items (line items), not unique_orders'
    } : {}

    // Query 13: Compare distinct orders vs order line items for 30 days
    const thirtyDayOrderComparison = await prisma.$queryRaw<Array<{
      unique_orders: bigint;
      order_line_items: bigint;
      total_units: bigint | null;
    }>>`
      SELECT 
        COUNT(DISTINCT o.id)::bigint as unique_orders,
        COUNT(oi.id)::bigint as order_line_items,
        SUM(oi.quantity)::bigint as total_units
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= CURRENT_DATE - INTERVAL '30 days'
        AND o.purchase_date < CURRENT_DATE
        AND o.status NOT IN ('Cancelled', 'Canceled')
    `
    const thirtyDayComp = thirtyDayOrderComparison[0]
    results.thirtyDayOrderComparison = thirtyDayComp ? {
      unique_orders: Number(thirtyDayComp.unique_orders),
      order_line_items: Number(thirtyDayComp.order_line_items),
      total_units: Number(thirtyDayComp.total_units || 0),
      note: 'SellerBoard counts order_line_items (line items), not unique_orders'
    } : {}

    return NextResponse.json(results, { status: 200 })
  } catch (error: any) {
    console.error('Error running diagnostics:', error)
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    )
  }
}

