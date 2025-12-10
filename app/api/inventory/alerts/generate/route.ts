import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Clear old unresolved alerts
    await prisma.inventoryAlert.deleteMany({
      where: { isResolved: false }
    })

    const alerts: any[] = []

    // Calculate velocity from recent orders (last 30 days) since forecast table may not have avg_daily_velocity
    // 1. STOCKOUT RISK - Products with low days of supply based on recent sales velocity
    const stockoutRiskProducts = await query<{
      sku: string
      title: string
      total_inventory: number
      avg_daily_sales: number
      days_of_supply: number
      recommended_qty: number
    }>(`
      WITH velocity AS (
        SELECT 
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 30.0 as avg_daily_sales
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      )
      SELECT 
        p.sku,
        p.title,
        COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0) as total_inventory,
        COALESCE(v.avg_daily_sales, 0) as avg_daily_sales,
        CASE 
          WHEN COALESCE(v.avg_daily_sales, 0) > 0 
          THEN (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) / v.avg_daily_sales
          ELSE 999
        END as days_of_supply,
        CASE 
          WHEN COALESCE(v.avg_daily_sales, 0) > 0 
          THEN CEIL(v.avg_daily_sales * 45) - (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0))
          ELSE 100
        END as recommended_qty
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      LEFT JOIN velocity v ON p.sku = v.sku
      WHERE p.is_hidden = false
        AND COALESCE(v.avg_daily_sales, 0) > 0.1
        AND CASE 
          WHEN COALESCE(v.avg_daily_sales, 0) > 0 
          THEN (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) / v.avg_daily_sales
          ELSE 999
        END < 21
      ORDER BY days_of_supply ASC
      LIMIT 50
    `, [])

    for (const product of stockoutRiskProducts) {
      const daysOfSupply = Math.round(Number(product.days_of_supply))
      const severity = daysOfSupply < 7 ? 'critical' : daysOfSupply < 14 ? 'high' : 'medium'
      
      alerts.push({
        masterSku: product.sku,
        alertType: 'stockout_risk',
        severity,
        title: `Low Stock: ${product.sku}`,
        message: `${product.title || product.sku} has only ${daysOfSupply} days of supply remaining. Current inventory: ${product.total_inventory} units, selling ${Number(product.avg_daily_sales).toFixed(1)} units/day.`,
        recommendedAction: `Order ${Math.max(0, Math.round(Number(product.recommended_qty)))} units to reach 45-day supply`,
        recommendedQuantity: Math.max(0, Math.round(Number(product.recommended_qty))),
        context: JSON.stringify({
          currentInventory: product.total_inventory,
          avgDailySales: Number(product.avg_daily_sales),
          daysOfSupply
        })
      })
    }

    // 2. FBA REPLENISHMENT - Have warehouse stock but low FBA stock
    const fbaReplenishmentProducts = await query<{
      sku: string
      title: string
      warehouse_qty: number
      fba_qty: number
      avg_daily_sales: number
      fba_days_of_supply: number
    }>(`
      WITH velocity AS (
        SELECT 
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 30.0 as avg_daily_sales
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      )
      SELECT 
        p.sku,
        p.title,
        COALESCE(il.warehouse_available, 0) as warehouse_qty,
        COALESCE(il.fba_available, 0) as fba_qty,
        COALESCE(v.avg_daily_sales, 0) as avg_daily_sales,
        CASE 
          WHEN COALESCE(v.avg_daily_sales, 0) > 0 
          THEN COALESCE(il.fba_available, 0) / v.avg_daily_sales
          ELSE 999
        END as fba_days_of_supply
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      LEFT JOIN velocity v ON p.sku = v.sku
      WHERE p.is_hidden = false
        AND COALESCE(il.warehouse_available, 0) > 10
        AND COALESCE(v.avg_daily_sales, 0) > 0.1
        AND CASE 
          WHEN COALESCE(v.avg_daily_sales, 0) > 0 
          THEN COALESCE(il.fba_available, 0) / v.avg_daily_sales
          ELSE 999
        END < 14
      ORDER BY fba_days_of_supply ASC
      LIMIT 30
    `, [])

    for (const product of fbaReplenishmentProducts) {
      const daysOfSupply = Math.round(Number(product.fba_days_of_supply))
      const severity = daysOfSupply < 5 ? 'critical' : daysOfSupply < 10 ? 'high' : 'medium'
      const shipQty = Math.min(product.warehouse_qty, Math.ceil(Number(product.avg_daily_sales) * 30))
      
      alerts.push({
        masterSku: product.sku,
        alertType: 'fba_replenishment',
        severity,
        title: `Ship to FBA: ${product.sku}`,
        message: `${product.title || product.sku} has ${daysOfSupply} days of FBA supply. You have ${product.warehouse_qty} units in warehouse ready to ship.`,
        recommendedAction: `Ship ${shipQty} units to Amazon FBA`,
        recommendedQuantity: shipQty,
        context: JSON.stringify({
          warehouseQty: product.warehouse_qty,
          fbaQty: product.fba_qty,
          avgDailySales: Number(product.avg_daily_sales),
          fbaDaysOfSupply: daysOfSupply
        })
      })
    }

    // 3. OUT OF STOCK - Products with zero FBA inventory that have recent sales
    const outOfStockProducts = await query<{
      sku: string
      title: string
      recent_orders: number
    }>(`
      SELECT 
        p.sku,
        p.title,
        COUNT(DISTINCT o.id) as recent_orders
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      JOIN order_items oi ON oi.master_sku = p.sku
      JOIN orders o ON oi.order_id = o.id
      WHERE p.is_hidden = false
        AND COALESCE(il.fba_available, 0) = 0
        AND o.purchase_date > NOW() - INTERVAL '30 days'
        AND o.status != 'Cancelled'
      GROUP BY p.sku, p.title
      HAVING COUNT(DISTINCT o.id) > 5
      ORDER BY recent_orders DESC
      LIMIT 20
    `, [])

    for (const product of outOfStockProducts) {
      alerts.push({
        masterSku: product.sku,
        alertType: 'out_of_stock',
        severity: 'critical',
        title: `Out of Stock: ${product.sku}`,
        message: `${product.title || product.sku} is out of stock at FBA. This product had ${product.recent_orders} orders in the last 30 days.`,
        recommendedAction: 'Send inventory to FBA or order from supplier immediately',
        context: JSON.stringify({
          recentOrders: product.recent_orders
        })
      })
    }

    // 4. LOW INVENTORY (general) - Products with very low total inventory (< 20 units) that have sales
    const lowInventoryProducts = await query<{
      sku: string
      title: string
      total_qty: number
    }>(`
      SELECT 
        p.sku,
        p.title,
        COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0) as total_qty
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      WHERE p.is_hidden = false
        AND (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) BETWEEN 1 AND 20
        AND EXISTS (
          SELECT 1 FROM order_items oi 
          WHERE oi.master_sku = p.sku 
          AND oi.created_at > NOW() - INTERVAL '30 days'
        )
      ORDER BY total_qty ASC
      LIMIT 30
    `, [])

    for (const product of lowInventoryProducts) {
      alerts.push({
        masterSku: product.sku,
        alertType: 'low_inventory',
        severity: 'medium',
        title: `Low Inventory: ${product.sku}`,
        message: `${product.title || product.sku} has only ${product.total_qty} units remaining.`,
        recommendedAction: `Consider reordering`,
        recommendedQuantity: 50,
        context: JSON.stringify({
          currentQty: product.total_qty
        })
      })
    }

    // Insert all alerts
    if (alerts.length > 0) {
      await prisma.inventoryAlert.createMany({
        data: alerts
      })
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${alerts.length} inventory alerts`,
      summary: {
        stockoutRisk: stockoutRiskProducts.length,
        fbaReplenishment: fbaReplenishmentProducts.length,
        outOfStock: outOfStockProducts.length,
        lowInventory: lowInventoryProducts.length
      }
    })
  } catch (error) {
    console.error('Generate alerts error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate alerts'
    }, { status: 500 })
  }
}

// GET - Just return current alert counts
export async function GET() {
  try {
    const counts = await prisma.inventoryAlert.groupBy({
      by: ['alertType'],
      where: { isResolved: false },
      _count: true
    })

    const total = await prisma.inventoryAlert.count({
      where: { isResolved: false }
    })

    return NextResponse.json({
      success: true,
      total,
      byType: Object.fromEntries(counts.map((c: { alertType: string; _count: number }) => [c.alertType, c._count]))
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch alert counts'
    }, { status: 500 })
  }
}
