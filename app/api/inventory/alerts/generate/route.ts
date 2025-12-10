import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Clear old unresolved alerts (optional - comment out if you want to keep history)
    await prisma.inventoryAlert.deleteMany({
      where: { isResolved: false }
    })

    const alerts: any[] = []

    // 1. STOCKOUT RISK - Products with low days of supply
    const stockoutRiskProducts = await query<{
      sku: string
      title: string
      total_inventory: number
      avg_daily_velocity: number
      days_of_supply: number
      recommended_qty: number
    }>(`
      SELECT 
        p.sku,
        p.title,
        COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0) as total_inventory,
        COALESCE(f.avg_daily_velocity, 0) as avg_daily_velocity,
        CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) / f.avg_daily_velocity
          ELSE 999
        END as days_of_supply,
        CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN CEIL(f.avg_daily_velocity * 45) - (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0))
          ELSE 100
        END as recommended_qty
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      LEFT JOIN (
        SELECT master_sku, avg_daily_velocity
        FROM forecasts 
        WHERE channel = 'Amazon'
        AND (master_sku, created_at) IN (
          SELECT master_sku, MAX(created_at) FROM forecasts GROUP BY master_sku
        )
      ) f ON p.sku = f.master_sku
      WHERE p.is_active = true
        AND COALESCE(f.avg_daily_velocity, 0) > 0.1
        AND CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) / f.avg_daily_velocity
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
        message: `${product.title || product.sku} has only ${daysOfSupply} days of supply remaining. Current inventory: ${product.total_inventory} units, selling ${Number(product.avg_daily_velocity).toFixed(1)} units/day.`,
        recommendedAction: `Order ${Math.max(0, Math.round(Number(product.recommended_qty)))} units to reach 45-day supply`,
        recommendedQuantity: Math.max(0, Math.round(Number(product.recommended_qty))),
        context: JSON.stringify({
          currentInventory: product.total_inventory,
          avgDailyVelocity: Number(product.avg_daily_velocity),
          daysOfSupply
        })
      })
    }

    // 2. FBA REPLENISHMENT - Have warehouse stock but low FBA
    const fbaReplenishmentProducts = await query<{
      sku: string
      title: string
      warehouse_qty: number
      fba_qty: number
      avg_daily_velocity: number
      fba_days_of_supply: number
    }>(`
      SELECT 
        p.sku,
        p.title,
        COALESCE(il.warehouse_available, 0) as warehouse_qty,
        COALESCE(il.fba_available, 0) as fba_qty,
        COALESCE(f.avg_daily_velocity, 0) as avg_daily_velocity,
        CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN COALESCE(il.fba_available, 0) / f.avg_daily_velocity
          ELSE 999
        END as fba_days_of_supply
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      LEFT JOIN (
        SELECT master_sku, avg_daily_velocity
        FROM forecasts 
        WHERE channel = 'Amazon'
        AND (master_sku, created_at) IN (
          SELECT master_sku, MAX(created_at) FROM forecasts GROUP BY master_sku
        )
      ) f ON p.sku = f.master_sku
      WHERE p.is_active = true
        AND COALESCE(il.warehouse_available, 0) > 10
        AND COALESCE(f.avg_daily_velocity, 0) > 0.1
        AND CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN COALESCE(il.fba_available, 0) / f.avg_daily_velocity
          ELSE 999
        END < 14
      ORDER BY fba_days_of_supply ASC
      LIMIT 30
    `, [])

    for (const product of fbaReplenishmentProducts) {
      const daysOfSupply = Math.round(Number(product.fba_days_of_supply))
      const severity = daysOfSupply < 5 ? 'critical' : daysOfSupply < 10 ? 'high' : 'medium'
      const shipQty = Math.min(product.warehouse_qty, Math.ceil(Number(product.avg_daily_velocity) * 30))
      
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
          avgDailyVelocity: Number(product.avg_daily_velocity),
          fbaDaysOfSupply: daysOfSupply
        })
      })
    }

    // 3. OUT OF STOCK - Products with zero FBA inventory that have recent sales
    const outOfStockProducts = await query<{
      sku: string
      title: string
      recent_sales: number
    }>(`
      SELECT 
        p.sku,
        p.title,
        COUNT(DISTINCT o.id) as recent_sales
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      JOIN order_items oi ON oi.master_sku = p.sku
      JOIN orders o ON oi.order_id = o.id
      WHERE p.is_active = true
        AND COALESCE(il.fba_available, 0) = 0
        AND o.purchase_date > NOW() - INTERVAL '30 days'
      GROUP BY p.sku, p.title
      HAVING COUNT(DISTINCT o.id) > 5
      ORDER BY recent_sales DESC
      LIMIT 20
    `, [])

    for (const product of outOfStockProducts) {
      alerts.push({
        masterSku: product.sku,
        alertType: 'out_of_stock',
        severity: 'critical',
        title: `Out of Stock: ${product.sku}`,
        message: `${product.title || product.sku} is out of stock at FBA. This product had ${product.recent_sales} orders in the last 30 days.`,
        recommendedAction: 'Send inventory to FBA or order from supplier immediately',
        context: JSON.stringify({
          recentOrders: product.recent_sales
        })
      })
    }

    // 4. LOW INVENTORY (general) - Products below reorder point
    const lowInventoryProducts = await query<{
      sku: string
      title: string
      total_qty: number
      reorder_point: number
    }>(`
      SELECT 
        p.sku,
        p.title,
        COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0) as total_qty,
        COALESCE(p.reorder_point, 50) as reorder_point
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      WHERE p.is_active = true
        AND (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) < COALESCE(p.reorder_point, 50)
        AND (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) > 0
      ORDER BY total_qty ASC
      LIMIT 30
    `, [])

    for (const product of lowInventoryProducts) {
      alerts.push({
        masterSku: product.sku,
        alertType: 'low_inventory',
        severity: 'medium',
        title: `Below Reorder Point: ${product.sku}`,
        message: `${product.title || product.sku} has ${product.total_qty} units, below reorder point of ${product.reorder_point}.`,
        recommendedAction: `Order to bring inventory above ${product.reorder_point} units`,
        recommendedQuantity: product.reorder_point - product.total_qty + 50,
        context: JSON.stringify({
          currentQty: product.total_qty,
          reorderPoint: product.reorder_point
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
      byType: Object.fromEntries(counts.map(c => [c.alertType, c._count]))
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch alert counts'
    }, { status: 500 })
  }
}

