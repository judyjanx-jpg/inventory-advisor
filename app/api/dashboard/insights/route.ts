import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { subDays, startOfDay, format } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import {
  getNetProfitForRange,
  nowInPST,
  pstToUTC,
  AMAZON_TIMEZONE,
} from '@/lib/profit/engine'

export const dynamic = 'force-dynamic'

interface Insight {
  id: string
  type: 'critical' | 'warning' | 'opportunity' | 'info'
  message: string
  urgency?: number // For sorting within same priority (lower = more urgent)
  sku?: string
  poNumber?: string
  shipmentId?: string
  metadata?: Record<string, any>
}

/**
 * Generate AI insights based on inventory, sales, POs, and shipments
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10), 100)
    
    const insights: Insight[] = []
    const now = new Date()
    const today = startOfDay(now)

    // ============================================
    // CRITICAL INSIGHTS (Priority 1)
    // ============================================

    // 1. Stockout risk (item will stock out before reorder arrives)
    let stockoutRisk: any[] = []
    try {
      stockoutRisk = await query<{
      sku: string
      title: string
      days_of_supply: number
      lead_time_days: number
      total_qty: number
      has_open_po: boolean
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
      ),
      open_pos AS (
        SELECT DISTINCT poi.master_sku
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.id
        WHERE po.status NOT IN ('received', 'cancelled')
      ),
      product_data AS (
        SELECT
          p.sku,
          p.title,
          COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0) as total_qty,
          COALESCE(v.avg_daily_sales, 0) as avg_daily_sales,
          COALESCE(s.lead_time_days, 30) as lead_time_days,
          CASE
            WHEN COALESCE(v.avg_daily_sales, 0) > 0
            THEN ROUND((COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) / v.avg_daily_sales)
            ELSE 999
          END as days_of_supply,
          CASE WHEN op.master_sku IS NOT NULL THEN true ELSE false END as has_open_po
        FROM products p
        LEFT JOIN inventory_levels il ON p.sku = il.master_sku
        LEFT JOIN velocity v ON p.sku = v.sku
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN open_pos op ON p.sku = op.master_sku
        WHERE p.is_hidden = false
          AND COALESCE(v.avg_daily_sales, 0) > 0.1
      )
      SELECT
        sku,
        title,
        total_qty,
        days_of_supply,
        lead_time_days,
        has_open_po
      FROM product_data
      WHERE days_of_supply < (lead_time_days + 14)
        AND days_of_supply < 999
        AND NOT has_open_po
        AND days_of_supply > 0
      ORDER BY days_of_supply ASC
      LIMIT 10
    `, [])
    } catch (error) {
      console.error('Error fetching stockout risk:', error)
    }

    for (const item of stockoutRisk) {
      const daysUntilStockout = Math.round(Number(item.days_of_supply))
      insights.push({
        id: `stockout-${item.sku}`,
        type: 'critical',
        message: `${item.sku} stocks out in ${daysUntilStockout} days — no PO placed`,
        urgency: daysUntilStockout,
        sku: item.sku,
      })
    }

    // 2. Late POs (past expected arrival date and not received)
    let latePOs: any[] = []
    try {
      latePOs = await prisma.purchaseOrder.findMany({
      where: {
        expectedArrivalDate: {
          lt: today,
        },
        status: {
          notIn: ['received', 'cancelled'],
        },
      },
      include: {
        supplier: true,
      },
      take: 10,
    })
    } catch (error) {
      console.error('Error fetching late POs:', error)
    }

    for (const po of latePOs) {
      if (po.expectedArrivalDate) {
        const daysLate = Math.floor(
          (now.getTime() - po.expectedArrivalDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        insights.push({
          id: `late-po-${po.poNumber}`,
          type: 'critical',
          message: `PO #${po.poNumber} is ${daysLate} day${daysLate !== 1 ? 's' : ''} late`,
          urgency: daysLate,
          poNumber: po.poNumber,
        })
      }
    }

    // 3. Late/stuck FBA shipments
    let lateShipments: any[] = []
    try {
      lateShipments = await prisma.fbaShipment.findMany({
      where: {
        estimatedArrival: {
          lt: today,
        },
        status: {
          notIn: ['closed', 'checked_in', 'cancelled'],
        },
      },
      take: 10,
    })
    } catch (error) {
      console.error('Error fetching late shipments:', error)
    }

    for (const shipment of lateShipments) {
      if (shipment.estimatedArrival) {
        const daysLate = Math.floor(
          (now.getTime() - shipment.estimatedArrival.getTime()) / (1000 * 60 * 60 * 24)
        )
        insights.push({
          id: `late-shipment-${shipment.id}`,
          type: 'critical',
          message: `FBA shipment ${shipment.shipmentId || shipment.id} is delayed`,
          urgency: daysLate,
          shipmentId: shipment.shipmentId || String(shipment.id),
        })
      }
    }

    // 4. Out of stock items (FBA available = 0 but has recent sales)
    let outOfStock: any[] = []
    try {
      outOfStock = await query<{ sku: string; title: string }>(`
      SELECT DISTINCT
        p.sku,
        p.title
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      WHERE p.is_hidden = false
        AND COALESCE(il.fba_available, 0) = 0
        AND COALESCE(il.warehouse_available, 0) = 0
        AND EXISTS (
          SELECT 1 FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE oi.master_sku = p.sku
          AND o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.status != 'Cancelled'
        )
      LIMIT 5
    `, [])
    } catch (error) {
      console.error('Error fetching out of stock items:', error)
    }

    for (const item of outOfStock) {
      insights.push({
        id: `out-of-stock-${item.sku}`,
        type: 'critical',
        message: `${item.sku} out of stock now`,
        urgency: 0,
        sku: item.sku,
      })
    }

    // ============================================
    // WARNING INSIGHTS (Priority 2)
    // ============================================

    // 5. Sales spikes (50%+ above average for 3+ days)
    let salesSpikes: any[] = []
    try {
      salesSpikes = await query<{
      sku: string
      title: string
      current_velocity: number
      avg_velocity: number
      percent_change: number
    }>(`
      WITH recent_sales AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 3.0 as current_velocity
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '3 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      ),
      avg_sales AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 30.0 as avg_velocity
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.purchase_date <= NOW() - INTERVAL '3 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      )
      SELECT
        rs.sku,
        p.title,
        rs.current_velocity,
        COALESCE(av.avg_velocity, 0) as avg_velocity,
        CASE
          WHEN COALESCE(av.avg_velocity, 0) > 0
          THEN ROUND(((rs.current_velocity - av.avg_velocity) / av.avg_velocity) * 100)
          ELSE 0
        END as percent_change
      FROM recent_sales rs
      JOIN products p ON rs.sku = p.sku
      LEFT JOIN avg_sales av ON rs.sku = av.sku
      WHERE p.is_hidden = false
        AND rs.current_velocity >= (COALESCE(av.avg_velocity, 0) * 1.5)
        AND COALESCE(av.avg_velocity, 0) > 0.1
      ORDER BY percent_change DESC
      LIMIT 5
    `, [])
    } catch (error) {
      console.error('Error fetching sales spikes:', error)
    }

    for (const item of salesSpikes) {
      const percentChange = Math.round(Number(item.percent_change))
      insights.push({
        id: `sales-spike-${item.sku}`,
        type: 'warning',
        message: `${item.sku} sales up ${percentChange}% — consider early reorder`,
        urgency: 100 - percentChange, // Lower urgency number = higher priority
        sku: item.sku,
      })
    }

    // 6. Sales drops (50%+ below average for 3+ days)
    let salesDrops: any[] = []
    try {
      salesDrops = await query<{
      sku: string
      title: string
      current_velocity: number
      avg_velocity: number
      percent_change: number
    }>(`
      WITH recent_sales AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 3.0 as current_velocity
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '3 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      ),
      avg_sales AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 30.0 as avg_velocity
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.purchase_date <= NOW() - INTERVAL '3 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      )
      SELECT
        rs.sku,
        p.title,
        rs.current_velocity,
        COALESCE(av.avg_velocity, 0) as avg_velocity,
        CASE
          WHEN COALESCE(av.avg_velocity, 0) > 0
          THEN ROUND(((av.avg_velocity - rs.current_velocity) / av.avg_velocity) * 100)
          ELSE 0
        END as percent_change
      FROM recent_sales rs
      JOIN products p ON rs.sku = p.sku
      LEFT JOIN avg_sales av ON rs.sku = av.sku
      WHERE p.is_hidden = false
        AND rs.current_velocity <= (COALESCE(av.avg_velocity, 0) * 0.5)
        AND COALESCE(av.avg_velocity, 0) > 0.1
        AND rs.current_velocity < av.avg_velocity
      ORDER BY percent_change DESC
      LIMIT 5
    `, [])
    } catch (error) {
      console.error('Error fetching sales drops:', error)
    }

    for (const item of salesDrops) {
      const percentChange = Math.round(Number(item.percent_change))
      insights.push({
        id: `sales-drop-${item.sku}`,
        type: 'warning',
        message: `${item.sku} sales down ${percentChange}% — check listing`,
        urgency: 100 - percentChange,
        sku: item.sku,
      })
    }

    // 7. Return rate spikes (current return rate > 2x average)
    // Simplified: Only flag items with 3+ returns in last 30 days
    let returnSpikes: any[] = []
    try {
      returnSpikes = await query<{
      sku: string
      title: string
      return_count: number
    }>(`
      SELECT
        r.master_sku as sku,
        p.title,
        SUM(r.quantity) as return_count
      FROM returns r
      JOIN products p ON r.master_sku = p.sku
      WHERE r.return_date > NOW() - INTERVAL '30 days'
        AND p.is_hidden = false
      GROUP BY r.master_sku, p.title
      HAVING SUM(r.quantity) >= 3
      ORDER BY return_count DESC
      LIMIT 5
    `, [])
    } catch (error) {
      console.error('Error fetching return spikes:', error)
    }

    for (const item of returnSpikes) {
      insights.push({
        id: `return-spike-${item.sku}`,
        type: 'warning',
        message: `Unusual return rate on ${item.sku}`,
        urgency: 50,
        sku: item.sku,
      })
    }

    // 8. Cost increases (recent PO cost > 10% higher than previous)
    let costIncreases: any[] = []
    try {
      costIncreases = await query<{
      sku: string
      title: string
      new_cost: number
      old_cost: number
      percent_increase: number
    }>(`
      WITH recent_pos AS (
        SELECT
          poi.master_sku,
          poi.unit_cost as new_cost,
          po.created_date,
          ROW_NUMBER() OVER (PARTITION BY poi.master_sku ORDER BY po.created_date DESC) as rn
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.id
        WHERE po.status IN ('received', 'confirmed', 'shipped')
          AND po.created_date > NOW() - INTERVAL '90 days'
      ),
      previous_pos AS (
        SELECT
          poi.master_sku,
          poi.unit_cost as old_cost,
          ROW_NUMBER() OVER (PARTITION BY poi.master_sku ORDER BY po.created_date DESC) as rn
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.id
        WHERE po.status IN ('received', 'confirmed', 'shipped')
          AND po.created_date > NOW() - INTERVAL '180 days'
          AND po.created_date <= NOW() - INTERVAL '30 days'
      )
      SELECT
        rp.master_sku as sku,
        p.title,
        rp.new_cost,
        pp.old_cost,
        CASE
          WHEN pp.old_cost > 0
          THEN ROUND(((rp.new_cost - pp.old_cost) / pp.old_cost) * 100)
          ELSE 0
        END as percent_increase
      FROM recent_pos rp
      JOIN previous_pos pp ON rp.master_sku = pp.master_sku
      JOIN products p ON rp.master_sku = p.sku
      WHERE rp.rn = 1
        AND pp.rn = 1
        AND p.is_hidden = false
        AND rp.new_cost > (pp.old_cost * 1.1)
      ORDER BY percent_increase DESC
      LIMIT 5
    `, [])
    } catch (error) {
      console.error('Error fetching cost increases:', error)
    }

    for (const item of costIncreases) {
      const percentIncrease = Math.round(Number(item.percent_increase))
      insights.push({
        id: `cost-increase-${item.sku}`,
        type: 'warning',
        message: `Cost up ${percentIncrease}% on ${item.sku}`,
        urgency: 100 - percentIncrease,
        sku: item.sku,
      })
    }

    // 9. Supplier reliability (late on recent orders)
    let supplierIssues: any[] = []
    try {
      supplierIssues = await query<{
      supplier_id: number
      supplier_name: string
      late_count: number
      total_count: number
    }>(`
      SELECT
        s.id as supplier_id,
        s.name as supplier_name,
        COUNT(CASE WHEN po.expected_arrival_date < NOW() AND po.status NOT IN ('received', 'cancelled') THEN 1 END) as late_count,
        COUNT(*) as total_count
      FROM suppliers s
      JOIN purchase_orders po ON s.id = po.supplier_id
      WHERE po.created_date > NOW() - INTERVAL '90 days'
      GROUP BY s.id, s.name
      HAVING COUNT(CASE WHEN po.expected_arrival_date < NOW() AND po.status NOT IN ('received', 'cancelled') THEN 1 END) >= 2
      ORDER BY late_count DESC
      LIMIT 3
    `, [])
    } catch (error) {
      console.error('Error fetching supplier issues:', error)
    }

    for (const supplier of supplierIssues) {
      const lateRate = Math.round((Number(supplier.late_count) / Number(supplier.total_count)) * 100)
      insights.push({
        id: `supplier-issue-${supplier.supplier_id}`,
        type: 'warning',
        message: `${supplier.supplier_name} reliability slipping (${supplier.late_count} late order${supplier.late_count !== 1 ? 's' : ''})`,
        urgency: 100 - lateRate,
        metadata: { supplierId: supplier.supplier_id },
      })
    }

    // ============================================
    // OPPORTUNITY INSIGHTS (Priority 3)
    // ============================================

    // 10. Reorder early opportunities (selling faster than expected)
    let reorderOpportunities: any[] = []
    try {
      reorderOpportunities = await query<{
      sku: string
      title: string
      actual_sales: number
      forecasted_sales: number
      percent_above: number
    }>(`
      WITH velocity AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 30.0 as actual_velocity
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      ),
      historical_velocity AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 60.0 as forecasted_velocity
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '90 days'
          AND o.purchase_date <= NOW() - INTERVAL '30 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      )
      SELECT
        v.sku,
        p.title,
        v.actual_velocity * 30 as actual_sales,
        COALESCE(hv.forecasted_velocity, 0) * 30 as forecasted_sales,
        CASE
          WHEN COALESCE(hv.forecasted_velocity, 0) > 0
          THEN ROUND(((v.actual_velocity - hv.forecasted_velocity) / hv.forecasted_velocity) * 100)
          ELSE 0
        END as percent_above
      FROM velocity v
      JOIN products p ON v.sku = p.sku
      LEFT JOIN historical_velocity hv ON v.sku = hv.sku
      WHERE p.is_hidden = false
        AND v.actual_velocity > (COALESCE(hv.forecasted_velocity, 0) * 1.3)
        AND COALESCE(hv.forecasted_velocity, 0) > 0
      ORDER BY percent_above DESC
      LIMIT 5
    `, [])
    } catch (error) {
      console.error('Error fetching reorder opportunities:', error)
    }

    for (const item of reorderOpportunities) {
      insights.push({
        id: `reorder-early-${item.sku}`,
        type: 'opportunity',
        message: `${item.sku} selling faster than expected — reorder early`,
        urgency: 50,
        sku: item.sku,
      })
    }

    // 11. Pricing opportunities (high margin + growing velocity)
    let pricingOpportunities: any[] = []
    try {
      pricingOpportunities = await query<{
      sku: string
      title: string
      margin: number
      velocity_7d: number
      velocity_30d: number
    }>(`
      WITH velocity_7d AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 7.0 as velocity_7d
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '7 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      ),
      velocity_30d AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 30.0 as velocity_30d
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.purchase_date <= NOW() - INTERVAL '7 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      ),
      margins AS (
        SELECT
          oi.master_sku as sku,
          AVG(
            (oi.item_price - COALESCE(p.cost, 0) - COALESCE(oi.amazon_fees, 0)) / NULLIF(oi.item_price, 0) * 100
          ) as margin
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.master_sku = p.sku
        WHERE o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.status != 'Cancelled'
          AND oi.item_price > 0
        GROUP BY oi.master_sku
        HAVING AVG(
          (oi.item_price - COALESCE(p.cost, 0) - COALESCE(oi.amazon_fees, 0)) / NULLIF(oi.item_price, 0) * 100
        ) > 40
      )
      SELECT
        m.sku,
        p.title,
        m.margin,
        COALESCE(v7.velocity_7d, 0) as velocity_7d,
        COALESCE(v30.velocity_30d, 0) as velocity_30d
      FROM margins m
      JOIN products p ON m.sku = p.sku
      LEFT JOIN velocity_7d v7 ON m.sku = v7.sku
      LEFT JOIN velocity_30d v30 ON m.sku = v30.sku
      WHERE p.is_hidden = false
        AND COALESCE(v7.velocity_7d, 0) > COALESCE(v30.velocity_30d, 0)
      ORDER BY m.margin DESC
      LIMIT 5
    `, [])
    } catch (error) {
      console.error('Error fetching pricing opportunities:', error)
    }

    for (const item of pricingOpportunities) {
      insights.push({
        id: `pricing-opportunity-${item.sku}`,
        type: 'opportunity',
        message: `${item.sku} has room to raise price`,
        urgency: 50,
        sku: item.sku,
      })
    }

    // ============================================
    // INFO INSIGHTS (Priority 4)
    // ============================================

    // 12. Yesterday's profit vs average
    try {
      const currentPST = nowInPST()
      const yesterdayStart = pstToUTC(startOfDay(subDays(currentPST, 1)))
      const yesterdayEnd = pstToUTC(startOfDay(currentPST))
      const yesterdayProfit = await getNetProfitForRange(yesterdayStart, yesterdayEnd)

      const thirtyDaysAgoStart = pstToUTC(startOfDay(subDays(currentPST, 30)))
      const avgProfit = await getNetProfitForRange(thirtyDaysAgoStart, yesterdayEnd)
      const avgDailyProfit = avgProfit / 30

      const profitChange = avgDailyProfit !== 0
        ? Math.round(((yesterdayProfit - avgDailyProfit) / Math.abs(avgDailyProfit)) * 100)
        : 0

      if (Math.abs(profitChange) > 5) {
        const sign = profitChange > 0 ? '+' : ''
        insights.push({
          id: 'yesterday-profit',
          type: 'info',
          message: `Yesterday: $${Math.round(yesterdayProfit).toLocaleString()} profit, ${sign}${profitChange}% ${profitChange > 0 ? 'above' : 'below'} average`,
          urgency: 100,
        })
      }
    } catch (error) {
      console.error('Error calculating yesterday profit:', error)
    }

    // 13. Top performer yesterday
    let topPerformer: any[] = []
    try {
      const currentPST2 = nowInPST()
      const yesterdayStart = pstToUTC(startOfDay(subDays(currentPST2, 1)))
      const yesterdayEnd = pstToUTC(startOfDay(currentPST2))
      topPerformer = await query<{
      sku: string
      title: string
      profit: number
    }>(`
      SELECT
        oi.master_sku as sku,
        p.title,
        SUM(
          COALESCE(oi.item_price, 0) - COALESCE(p.cost, 0) - COALESCE(oi.amazon_fees, 0)
        ) as profit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE o.purchase_date >= $1
        AND o.purchase_date < $2
        AND o.status != 'Cancelled'
      GROUP BY oi.master_sku, p.title
      ORDER BY profit DESC
      LIMIT 1
    `, [yesterdayStart, yesterdayEnd])
    } catch (error) {
      console.error('Error fetching top performer:', error)
    }

    if (topPerformer.length > 0 && Number(topPerformer[0].profit) > 50) {
      insights.push({
        id: 'top-performer-yesterday',
        type: 'info',
        message: `Top performer yesterday: ${topPerformer[0].sku}`,
        urgency: 100,
        sku: topPerformer[0].sku,
      })
    }

    // Sort insights by priority (critical -> warning -> opportunity -> info)
    // Then by urgency within same priority
    const priorityOrder = { critical: 1, warning: 2, opportunity: 3, info: 4 }
    insights.sort((a, b) => {
      const priorityDiff = priorityOrder[a.type] - priorityOrder[b.type]
      if (priorityDiff !== 0) return priorityDiff
      return (a.urgency || 100) - (b.urgency || 100)
    })

    // TEMPORARY: Add a test insight to verify the endpoint is working
    // Remove this after confirming the endpoint works
    if (insights.length === 0) {
      insights.push({
        id: 'test-insight',
        type: 'info',
        message: 'Insights system is active — analyzing your data...',
        urgency: 100,
      })
    }

    // Limit insights based on query parameter
    const limitedInsights = insights.slice(0, limit)

    // Log for debugging
    console.log(`Generated ${insights.length} total insights, returning ${limitedInsights.length}`)
    console.log('Sample insight:', limitedInsights[0] ? JSON.stringify(limitedInsights[0], null, 2) : 'No insights')

    return NextResponse.json({
      success: true,
      insights: limitedInsights,
      total: insights.length,
    })
  } catch (error) {
    console.error('Error generating insights:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate insights',
        insights: [],
        total: 0,
      },
      { status: 500 }
    )
  }
}

