// app/api/profit/products/route.ts
// Returns product-level profit data for the selected period
// Uses the same revenue priority chain as the shared profit engine for Sellerboard-level accuracy

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getQuickFeeEstimate } from '@/lib/fee-estimation'
import {
  getDateRangeForPeriod,
  getCustomDateRange,
  AMAZON_TIMEZONE,
} from '@/lib/profit/engine'

export const dynamic = 'force-dynamic'

interface ProductProfit {
  id: string
  sku: string
  asin: string
  parentAsin?: string
  displayName?: string  // Internal SKU/name set by user
  title: string         // Amazon product title
  imageUrl?: string
  brand?: string
  supplier?: string
  channel?: string
  unitsSold: number
  refunds: number
  refundAmount: number  // Dollar amount of refunds
  refundRate: number
  sales: number
  promos: number        // Promo discounts
  adSpend: number
  cogs: number
  cogsTotal: number
  amazonFees: number
  amazonFeesEstimated: number  // Portion that was estimated
  grossProfit: number   // Sales - Promos - Amazon Fees - COGS
  netProfit: number     // Gross Profit - Ad Spend - Refunds
  margin: number
  roi: number
  realAcos: number | null
  sessions: number
  unitSessionPct: number
  bsr?: number
  bsrChange?: number
}

// Helper to get date range - uses the shared engine's date utilities
function getDateRange(period: string, startDateParam?: string, endDateParam?: string): { startDate: Date; endDate: Date } {
  if (period === 'custom' && startDateParam && endDateParam) {
    const { start, end } = getCustomDateRange(startDateParam, endDateParam)
    return { startDate: start, endDate: end }
  }

  const range = getDateRangeForPeriod(period)
  return { startDate: range.start, endDate: range.end }
}

// Build the GROUP BY column based on the groupBy parameter
function getGroupByColumn(groupBy: string): { column: string; label: string } {
  switch (groupBy) {
    case 'asin':
      return { column: 'COALESCE(p.asin, oi.asin)', label: 'ASIN' }
    case 'parent':
      return { column: 'COALESCE(p.parent_sku, oi.master_sku)', label: 'Parent' }
    case 'brand':
      return { column: "COALESCE(p.brand, 'Unknown')", label: 'Brand' }
    case 'supplier':
      return { column: "COALESCE(s.name, 'Unknown')", label: 'Supplier' }
    case 'channel':
      return { column: "'Amazon'", label: 'Channel' } // Only Amazon for now
    case 'sku':
    default:
      return { column: 'oi.master_sku', label: 'SKU' }
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'yesterday'
    const groupBy = searchParams.get('groupBy') || 'sku'
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    const { startDate, endDate } = getDateRange(period, startDateParam || undefined, endDateParam || undefined)
    const { column: groupByColumn } = getGroupByColumn(groupBy)

    // Get product-level data with Sellerboard-level accuracy
    // Revenue priority: actual_revenue → gross_revenue → item_price + shipping → estimated
    // Also tracks promos for proper profit calculation
    const salesByProduct = await query<{
      sku: string
      asin: string | null
      title: string | null
      display_name: string | null
      brand: string | null
      supplier_name: string | null
      parent_sku: string | null
      cost: string | null
      units_sold: string
      total_sales: string
      total_promos: string
      sales_estimated: string
      actual_fees: string
      items_with_fees: string
      total_items: string
      unique_orders: string
      line_items: string
      items_with_actual_revenue: string
    }>(`
      WITH most_recent_prices AS (
        -- Most recent price per SKU (preferred for pending orders)
        -- Limited to last 90 days for performance
        SELECT
          master_sku,
          recent_unit_price
        FROM (
          SELECT
            oi.master_sku,
            (oi.item_price / NULLIF(oi.quantity, 0)) as recent_unit_price,
            ROW_NUMBER() OVER (PARTITION BY oi.master_sku ORDER BY o.purchase_date DESC) as rn
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE o.purchase_date >= NOW() - INTERVAL '90 days'
            AND oi.item_price > 0
            AND oi.quantity > 0
            AND o.status NOT IN ('Cancelled', 'Canceled')
        ) ranked
        WHERE rn = 1
      ),
      recent_avg_prices AS (
        -- Recent 30-day average prices (fallback for products without recent sales)
        SELECT
          oi.master_sku,
          AVG(oi.item_price / NULLIF(oi.quantity, 0)) as avg_unit_price
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date >= NOW() - INTERVAL '30 days'
          AND oi.item_price > 0
          AND oi.quantity > 0
          AND o.status NOT IN ('Cancelled', 'Canceled')
        GROUP BY oi.master_sku
      ),
      historical_avg_prices AS (
        -- 180-day average prices (fallback for products without recent 30-day sales)
        SELECT
          oi.master_sku,
          AVG(oi.item_price / NULLIF(oi.quantity, 0)) as avg_unit_price
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date >= NOW() - INTERVAL '180 days'
          AND oi.item_price > 0
          AND oi.quantity > 0
          AND o.status NOT IN ('Cancelled', 'Canceled')
        GROUP BY oi.master_sku
      )
      SELECT
        ${groupByColumn} as sku,
        MAX(COALESCE(p.asin, oi.asin)) as asin,
        MAX(COALESCE(p.title, oi.master_sku)) as title,
        MAX(COALESCE(parent_p.display_name, p.display_name)) as display_name,
        MAX(p.brand) as brand,
        MAX(s.name) as supplier_name,
        MAX(p.parent_sku) as parent_sku,
        COALESCE(AVG(p.cost), 0)::text as cost,
        COALESCE(SUM(oi.quantity), 0)::text as units_sold,
        -- SELLERBOARD-LEVEL ACCURACY: Same revenue priority as profit engine
        COALESCE(SUM(
          CASE
            -- Priority 1: actual_revenue from financial events (settlement data - most accurate)
            WHEN COALESCE(oi.actual_revenue, 0) > 0
            THEN oi.actual_revenue
            -- Priority 2: gross_revenue calculated from orders
            WHEN COALESCE(oi.gross_revenue, 0) > 0
            THEN oi.gross_revenue
            -- Priority 3: Calculate from item components
            WHEN oi.item_price > 0
            THEN oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
            -- Priority 4: Most recent price for this SKU (best for pending orders)
            WHEN COALESCE(mrp.recent_unit_price, 0) > 0
            THEN (mrp.recent_unit_price * oi.quantity) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
            -- Priority 5: Recent 30-day avg price
            WHEN COALESCE(rap.avg_unit_price, 0) > 0
            THEN (rap.avg_unit_price * oi.quantity) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
            -- Priority 6: Historical 180-day avg price
            WHEN COALESCE(hap.avg_unit_price, 0) > 0
            THEN (hap.avg_unit_price * oi.quantity) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
            -- Priority 7: Catalog price × 0.95
            WHEN COALESCE(p.price, 0) > 0
            THEN (p.price * oi.quantity * 0.95) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
            ELSE COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
          END
        ), 0)::text as total_sales,
        -- Track promos for proper profit calculation
        ROUND(COALESCE(SUM(COALESCE(oi.promo_discount, 0)), 0), 2)::text as total_promos,
        -- Track estimated sales amount
        ROUND(COALESCE(SUM(
          CASE
            WHEN COALESCE(oi.actual_revenue, 0) = 0 AND COALESCE(oi.gross_revenue, 0) = 0 AND (oi.item_price = 0 OR oi.item_price IS NULL)
            THEN CASE
              WHEN COALESCE(mrp.recent_unit_price, 0) > 0
              THEN (mrp.recent_unit_price * oi.quantity) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
              WHEN COALESCE(rap.avg_unit_price, 0) > 0
              THEN (rap.avg_unit_price * oi.quantity) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
              WHEN COALESCE(hap.avg_unit_price, 0) > 0
              THEN (hap.avg_unit_price * oi.quantity) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
              WHEN COALESCE(p.price, 0) > 0
              THEN (p.price * oi.quantity * 0.95) + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
              ELSE COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
            END
            ELSE 0
          END
        ), 0), 2)::text as sales_estimated,
        COALESCE(SUM(oi.amazon_fees), 0)::text as actual_fees,
        COUNT(CASE WHEN oi.amazon_fees > 0 THEN 1 END)::text as items_with_fees,
        COUNT(oi.id)::text as total_items,
        COUNT(DISTINCT o.id)::text as unique_orders,
        COUNT(oi.id)::text as line_items,
        -- Track items with actual revenue (settlement data coverage)
        COALESCE(SUM(CASE WHEN COALESCE(oi.actual_revenue, 0) > 0 THEN 1 ELSE 0 END), 0)::text as items_with_actual_revenue
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      LEFT JOIN most_recent_prices mrp ON oi.master_sku = mrp.master_sku
      LEFT JOIN recent_avg_prices rap ON oi.master_sku = rap.master_sku
      LEFT JOIN historical_avg_prices hap ON oi.master_sku = hap.master_sku
      LEFT JOIN products p ON oi.master_sku = p.sku
      LEFT JOIN products parent_p ON p.parent_sku = parent_p.sku
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE o.purchase_date >= $1
        AND o.purchase_date < $2
        AND o.status NOT IN ('Cancelled', 'Canceled')
        AND (o.sales_channel IS NULL OR o.sales_channel = 'Amazon.com')  -- Exclude MCF orders from other channels
      GROUP BY ${groupByColumn}
      ORDER BY SUM(
        CASE
          WHEN COALESCE(oi.actual_revenue, 0) > 0 THEN oi.actual_revenue
          WHEN COALESCE(oi.gross_revenue, 0) > 0 THEN oi.gross_revenue
          WHEN oi.item_price > 0 THEN oi.item_price
          WHEN COALESCE(mrp.recent_unit_price, 0) > 0 THEN mrp.recent_unit_price * oi.quantity
          WHEN COALESCE(rap.avg_unit_price, 0) > 0 THEN rap.avg_unit_price * oi.quantity
          WHEN COALESCE(hap.avg_unit_price, 0) > 0 THEN hap.avg_unit_price * oi.quantity
          WHEN COALESCE(p.price, 0) > 0 THEN p.price * oi.quantity * 0.95
          ELSE 0
        END
      ) DESC
    `, [startDate, endDate])

    // Get refunds by product (count and amount)
    let refundsByProduct: Array<{ sku: string; refund_count: string; refund_amount: string }> = []
    try {
      refundsByProduct = await query<{
        sku: string
        refund_count: string
        refund_amount: string
      }>(`
        SELECT
          master_sku as sku,
          COALESCE(SUM(quantity), 0)::text as refund_count,
          COALESCE(SUM(refund_amount), 0)::text as refund_amount
        FROM returns
        WHERE return_date >= $1
          AND return_date < $2
        GROUP BY master_sku
      `, [startDate, endDate])
    } catch {
      // Returns table might not have data
    }

    // If refund_amount is 0, try to estimate from order item prices
    if (refundsByProduct.length > 0 && refundsByProduct.every(r => parseFloat(r.refund_amount) === 0)) {
      try {
        refundsByProduct = await query<{
          sku: string
          refund_count: string
          refund_amount: string
        }>(`
          SELECT
            r.master_sku as sku,
            COALESCE(SUM(r.quantity), 0)::text as refund_count,
            COALESCE(SUM(oi.item_price * r.quantity / NULLIF(oi.quantity, 1)), 0)::text as refund_amount
          FROM returns r
          LEFT JOIN order_items oi ON r.order_id = oi.order_id AND r.master_sku = oi.master_sku
          WHERE r.return_date >= $1
            AND r.return_date < $2
          GROUP BY r.master_sku
        `, [startDate, endDate])
      } catch {
        // Estimation failed
      }
    }

    // Get ad spend by ASIN from Amazon Ads data
    let adSpendByAsin: Array<{ asin: string; sku: string | null; spend: string }> = []
    try {
      adSpendByAsin = await query<{
        asin: string
        sku: string | null
        spend: string
      }>(`
        SELECT
          asin,
          sku,
          COALESCE(SUM(spend), 0)::text as spend
        FROM ad_product_spend
        WHERE start_date <= $2::date
          AND end_date >= $1::date
        GROUP BY asin, sku
      `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]])
    } catch {
      // Ad spend table might not have data yet
    }

    // Create lookup maps
    const refundsMap = new Map(refundsByProduct.map(r => [r.sku, r]))
    const adSpendByAsinMap = new Map(adSpendByAsin.map(a => [a.asin, parseFloat(a.spend) || 0]))
    const adSpendBySkuMap = new Map(adSpendByAsin.filter(a => a.sku).map(a => [a.sku!, parseFloat(a.spend) || 0]))

    // Build product profit data with fee estimation
    const products: ProductProfit[] = salesByProduct.map((sale) => {
      const refund = refundsMap.get(sale.sku)

      const unitsSold = parseInt(sale.units_sold || '0', 10)
      const totalSales = parseFloat(sale.total_sales || '0')
      const totalPromos = parseFloat(sale.total_promos || '0')
      const salesEstimated = parseFloat(sale.sales_estimated || '0')
      const refundCount = parseInt(refund?.refund_count || '0', 10)
      const refundAmount = parseFloat(refund?.refund_amount || '0')
      const actualFees = parseFloat(sale.actual_fees || '0')
      const itemsWithFees = parseInt(sale.items_with_fees || '0', 10)
      const totalItems = parseInt(sale.total_items || '0', 10)

      // Get ad spend from Amazon Ads data (by ASIN first, then SKU)
      const adSpend = (sale.asin ? adSpendByAsinMap.get(sale.asin) : 0) || adSpendBySkuMap.get(sale.sku) || 0

      const cogs = parseFloat(sale.cost || '0')
      const cogsTotal = cogs * unitsSold

      // Calculate estimated fees for items without actual fees
      let estimatedFees = 0
      const itemsWithoutFees = totalItems - itemsWithFees
      if (itemsWithoutFees > 0 && totalSales > 0) {
        // Estimate based on average sale price per item
        const avgPricePerItem = totalSales / totalItems
        const estimatedSalesWithoutFees = avgPricePerItem * itemsWithoutFees
        const estimate = getQuickFeeEstimate(estimatedSalesWithoutFees, itemsWithoutFees)
        estimatedFees = estimate.totalFees
      }

      const totalFees = actualFees + estimatedFees

      const refundRate = unitsSold > 0 ? (refundCount / unitsSold) * 100 : 0

      // SELLERBOARD-LEVEL ACCURACY: Match the shared engine's profit formulas
      // Gross Profit = Sales - Promos - Amazon Fees - COGS
      const grossProfit = totalSales - totalPromos - totalFees - cogsTotal
      // Net Profit = Gross Profit - Ad Spend - Refunds
      const netProfit = grossProfit - adSpend - refundAmount

      const margin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0
      const roi = cogsTotal > 0 ? (netProfit / cogsTotal) * 100 : 0
      const realAcos = netProfit > 0 && adSpend > 0 ? (adSpend / netProfit) * 100 : null

      return {
        id: sale.sku,
        sku: sale.sku,
        asin: sale.asin || '',
        parentAsin: sale.parent_sku || undefined,
        displayName: sale.display_name || undefined,
        title: sale.title || sale.sku,
        imageUrl: undefined,
        brand: sale.brand || undefined,
        supplier: sale.supplier_name || undefined,
        channel: 'Amazon',
        unitsSold,
        refunds: refundCount,
        refundAmount,
        refundRate,
        sales: totalSales,
        promos: totalPromos,
        adSpend,
        cogs,
        cogsTotal,
        amazonFees: totalFees,
        amazonFeesEstimated: estimatedFees,
        grossProfit,
        netProfit,
        margin,
        roi,
        realAcos,
        sessions: 0,
        unitSessionPct: 0,
        bsr: undefined,
        bsrChange: undefined,
      }
    })

    // Sort by net profit descending
    products.sort((a, b) => b.netProfit - a.netProfit)

    // Calculate summary stats
    const totalEstimatedFees = products.reduce((sum, p) => sum + p.amazonFeesEstimated, 0)
    const totalActualFees = products.reduce((sum, p) => sum + (p.amazonFees - p.amazonFeesEstimated), 0)
    const totalFees = totalEstimatedFees + totalActualFees
    const feeEstimationRate = totalFees > 0 ? (totalEstimatedFees / totalFees) * 100 : 0

    // Calculate totals
    const totalSalesEstimated = salesByProduct.reduce((sum, s) => sum + parseFloat(s.sales_estimated || '0'), 0)
    const totalUniqueOrders = salesByProduct.reduce((sum, s) => sum + parseInt(s.unique_orders || '0', 10), 0)
    const totalLineItems = salesByProduct.reduce((sum, s) => sum + parseInt(s.line_items || '0', 10), 0)
    const totalPromos = products.reduce((sum, p) => sum + p.promos, 0)
    const totalRefundAmount = products.reduce((sum, p) => sum + p.refundAmount, 0)
    const totalItemsWithActualRevenue = salesByProduct.reduce((sum, s) => sum + parseInt(s.items_with_actual_revenue || '0', 10), 0)
    const totalItems = salesByProduct.reduce((sum, s) => sum + parseInt(s.total_items || '0', 10), 0)
    const settlementCoverageRate = totalItems > 0 ? (totalItemsWithActualRevenue / totalItems) * 100 : 0

    return NextResponse.json({
      products,
      meta: {
        totalActualFees: Number(totalActualFees.toFixed(2)),
        totalEstimatedFees: Number(totalEstimatedFees.toFixed(2)),
        feeEstimationRate: Number(feeEstimationRate.toFixed(1)),
        salesEstimated: Number(totalSalesEstimated.toFixed(2)),
        totalPromos: Number(totalPromos.toFixed(2)),
        totalRefunds: Number(totalRefundAmount.toFixed(2)),
        uniqueOrders: totalUniqueOrders,
        lineItems: totalLineItems,
        settlementCoverageRate: Number(settlementCoverageRate.toFixed(1)),
        note: feeEstimationRate > 10
          ? 'Some fees are estimated. Run financial-events sync for actual fees.'
          : settlementCoverageRate < 50
            ? 'Low settlement coverage. Run financial-events sync for actual revenue data.'
            : undefined,
      },
    })

  } catch (error: unknown) {
    const err = error as Error
    console.error('Error fetching product profit data:', err)
    return NextResponse.json(
      {
        error: err.message,
        products: [],
        errorCode: (error as { code?: string }).code,
        errorMeta: (error as { meta?: unknown }).meta,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      },
      { status: 500 }
    )
  }
}
