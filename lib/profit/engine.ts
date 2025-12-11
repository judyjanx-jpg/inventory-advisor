/**
 * Unified Profit Calculation Engine
 *
 * This is the SINGLE SOURCE OF TRUTH for profit calculations.
 * All profit-related endpoints should use this module.
 *
 * Sellerboard-level accuracy:
 * - Revenue priority: actual_revenue (settlements) → gross_revenue → components → estimated
 * - Unified amazon_fees with estimation fallback (15% + $3.50/unit)
 * - Includes: promos, refunds, ad costs, COGS
 * - Uses PST day boundaries (America/Los_Angeles) to match Amazon Seller Central
 */

import { query, queryOne } from '@/lib/db'
import { getQuickFeeEstimate } from '@/lib/fee-estimation'
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  addDays,
  subMonths,
  format,
} from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

// Amazon uses PST/PDT for their day boundaries in Seller Central
export const AMAZON_TIMEZONE = 'America/Los_Angeles'

// ============================================================================
// TYPES
// ============================================================================

export interface DebugInfo {
  dateRange: { start: string; end: string }
  orderItemCount: number
  itemsWithActualFees: number
  itemsWithEstimatedFees: number
  totalActualFees: number
  totalEstimatedFees: number
  estimatedItemsCount?: number
  estimatedSalesAmount?: number
  sampleItems?: Array<{
    itemPrice: number
    quantity: number
    amazonFees: number
    estimatedFees: number
  }>
  settlementAccuracy?: {
    itemsWithActualRevenue: number
    actualRevenueTotal: number
    settlementCoverageRate: number
  }
}

export interface PeriodData {
  sales: number
  orders: number
  lineItems: number
  units: number
  promos: number
  refunds: number
  refundCount: number
  adCost: number
  adCostSP: number
  adCostSB: number
  adCostSD: number
  amazonFees: number
  amazonFeesEstimated: number
  cogs: number
  feeEstimationRate: number
  debug?: DebugInfo
}

export interface DerivedMetrics {
  grossProfit: number
  netProfit: number
  estPayout: number
  margin: number
  roi: number
  acos: number | null
  tacos: number | null
  realAcos: number | null
}

export interface ProfitSummary extends PeriodData, DerivedMetrics {}

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Convert a PST date to UTC for database queries
 */
export function pstToUTC(date: Date): Date {
  return fromZonedTime(date, AMAZON_TIMEZONE)
}

/**
 * Convert current time to PST
 */
export function nowInPST(): Date {
  return toZonedTime(new Date(), AMAZON_TIMEZONE)
}

/**
 * Get date range for a named period (in UTC, ready for DB queries)
 */
export function getDateRangeForPeriod(period: string, referenceTime?: Date): {
  start: Date
  end: Date
  label: string
} {
  const nowPST = referenceTime ? toZonedTime(referenceTime, AMAZON_TIMEZONE) : nowInPST()
  const toUTC = (date: Date) => pstToUTC(date)

  switch (period) {
    case 'today': {
      const todayStart = startOfDay(nowPST)
      const tomorrowStart = startOfDay(addDays(nowPST, 1))
      return { start: toUTC(todayStart), end: toUTC(tomorrowStart), label: format(nowPST, 'd MMMM yyyy') }
    }
    case 'yesterday': {
      const yesterdayStart = startOfDay(subDays(nowPST, 1))
      const todayStart = startOfDay(nowPST)
      return { start: toUTC(yesterdayStart), end: toUTC(todayStart), label: format(subDays(nowPST, 1), 'd MMMM yyyy') }
    }
    case '2daysAgo': {
      const twoDaysAgoStart = startOfDay(subDays(nowPST, 2))
      const yesterdayStart = startOfDay(subDays(nowPST, 1))
      return { start: toUTC(twoDaysAgoStart), end: toUTC(yesterdayStart), label: format(subDays(nowPST, 2), 'd MMMM yyyy') }
    }
    case '3daysAgo': {
      const threeDaysAgoStart = startOfDay(subDays(nowPST, 3))
      const twoDaysAgoStart = startOfDay(subDays(nowPST, 2))
      return { start: toUTC(threeDaysAgoStart), end: toUTC(twoDaysAgoStart), label: format(subDays(nowPST, 3), 'd MMMM yyyy') }
    }
    case '7days': {
      const sevenDaysAgoStart = startOfDay(subDays(nowPST, 6))
      const todayStart = startOfDay(nowPST)
      return { start: toUTC(sevenDaysAgoStart), end: toUTC(todayStart), label: `${format(subDays(nowPST, 6), 'd MMM')} - ${format(subDays(nowPST, 1), 'd MMMM yyyy')}` }
    }
    case '14days': {
      const fourteenDaysAgoStart = startOfDay(subDays(nowPST, 13))
      const todayStart = startOfDay(nowPST)
      return { start: toUTC(fourteenDaysAgoStart), end: toUTC(todayStart), label: `${format(subDays(nowPST, 13), 'd MMM')} - ${format(subDays(nowPST, 1), 'd MMMM yyyy')}` }
    }
    case '30days': {
      const thirtyDaysAgoStart = startOfDay(subDays(nowPST, 30))
      const todayStart = startOfDay(nowPST)
      const yesterday = subDays(nowPST, 1)
      return { start: toUTC(thirtyDaysAgoStart), end: toUTC(todayStart), label: `${format(thirtyDaysAgoStart, 'd MMMM')} - ${format(yesterday, 'd MMMM yyyy')}` }
    }
    case 'mtd': {
      const monthStart = startOfMonth(nowPST)
      const tomorrowStart = startOfDay(addDays(nowPST, 1))
      return { start: toUTC(monthStart), end: toUTC(tomorrowStart), label: `${format(startOfMonth(nowPST), 'd')}-${format(nowPST, 'd MMMM yyyy')}` }
    }
    case 'lastMonth': {
      const lastMonthStart = startOfMonth(subMonths(nowPST, 1))
      const thisMonthStart = startOfMonth(nowPST)
      return { start: toUTC(lastMonthStart), end: toUTC(thisMonthStart), label: `${format(startOfMonth(subMonths(nowPST, 1)), 'd')}-${format(endOfMonth(subMonths(nowPST, 1)), 'd MMMM yyyy')}` }
    }
    default: {
      // Default to yesterday
      const yesterdayStart = startOfDay(subDays(nowPST, 1))
      const todayStart = startOfDay(nowPST)
      return { start: toUTC(yesterdayStart), end: toUTC(todayStart), label: format(subDays(nowPST, 1), 'd MMMM yyyy') }
    }
  }
}

/**
 * Get custom date range (dates should be in PST or will be converted)
 */
export function getCustomDateRange(startDateStr: string, endDateStr: string): {
  start: Date
  end: Date
  label: string
} {
  const startDatePST = toZonedTime(new Date(startDateStr), AMAZON_TIMEZONE)
  const endDatePST = toZonedTime(new Date(endDateStr), AMAZON_TIMEZONE)

  return {
    start: pstToUTC(startOfDay(startDatePST)),
    end: pstToUTC(startOfDay(addDays(endDatePST, 1))),
    label: `${format(startDatePST, 'd MMMM')} - ${format(endDatePST, 'd MMMM yyyy')}`
  }
}

// ============================================================================
// PRICE LOOKUP CACHE (to avoid recomputing for each period)
// ============================================================================

interface PriceLookup {
  master_sku: string
  recent_unit_price: number | null
  avg_30d_price: number | null
  avg_180d_price: number | null
}

/**
 * Pre-compute price lookups once - these don't change between periods
 * This avoids running the heavy CTEs multiple times
 */
export async function precomputePriceLookups(): Promise<Map<string, PriceLookup>> {
  const lookups = await query<{
    master_sku: string
    recent_unit_price: string | null
    avg_30d_price: string | null
    avg_180d_price: string | null
  }>(`
    WITH recent_sales AS (
      -- Get all sales data needed for price calculations in one scan
      SELECT
        oi.master_sku,
        oi.item_price / NULLIF(oi.quantity, 0) as unit_price,
        o.purchase_date
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= NOW() - INTERVAL '180 days'
        AND oi.item_price > 0
        AND oi.quantity > 0
        AND o.status NOT IN ('Cancelled', 'Canceled')
    ),
    most_recent_prices AS (
      SELECT DISTINCT ON (master_sku)
        master_sku,
        unit_price as recent_unit_price
      FROM recent_sales
      WHERE purchase_date >= NOW() - INTERVAL '90 days'
      ORDER BY master_sku, purchase_date DESC
    ),
    avg_30d_prices AS (
      SELECT
        master_sku,
        AVG(unit_price) as avg_30d_price
      FROM recent_sales
      WHERE purchase_date >= NOW() - INTERVAL '30 days'
      GROUP BY master_sku
    ),
    avg_180d_prices AS (
      SELECT
        master_sku,
        AVG(unit_price) as avg_180d_price
      FROM recent_sales
      GROUP BY master_sku
    )
    SELECT
      COALESCE(mrp.master_sku, a30.master_sku, a180.master_sku) as master_sku,
      mrp.recent_unit_price::text,
      a30.avg_30d_price::text,
      a180.avg_180d_price::text
    FROM most_recent_prices mrp
    FULL OUTER JOIN avg_30d_prices a30 ON mrp.master_sku = a30.master_sku
    FULL OUTER JOIN avg_180d_prices a180 ON COALESCE(mrp.master_sku, a30.master_sku) = a180.master_sku
  `)

  const map = new Map<string, PriceLookup>()
  for (const row of lookups) {
    map.set(row.master_sku, {
      master_sku: row.master_sku,
      recent_unit_price: row.recent_unit_price ? parseFloat(row.recent_unit_price) : null,
      avg_30d_price: row.avg_30d_price ? parseFloat(row.avg_30d_price) : null,
      avg_180d_price: row.avg_180d_price ? parseFloat(row.avg_180d_price) : null,
    })
  }
  return map
}

// ============================================================================
// CORE PROFIT CALCULATION
// ============================================================================

/**
 * Get aggregated profit data for a date range
 *
 * This is the CANONICAL profit calculation that all endpoints should use.
 *
 * Revenue priority chain (Sellerboard-level accuracy):
 * 1. actual_revenue from financial events (settlement data - most accurate)
 * 2. gross_revenue calculated from orders API
 * 3. item_price + shipping_price + gift_wrap_price
 * 4. Average unit price from last 30 days × quantity
 * 5. ALL-TIME average unit price × quantity (for SKUs without recent sales)
 * 6. Catalog price × 0.95 × quantity
 *
 * @param priceLookups - Optional pre-computed price lookups to avoid heavy CTEs
 */
export async function getPeriodData(
  startDate: Date,
  endDate: Date,
  includeDebug: boolean = false
): Promise<PeriodData> {
  // Get aggregated order items data using SQL for accuracy and performance
  const summaryData = await queryOne<{
    total_sales: string
    total_units: string
    total_promo: string
    total_actual_fees: string
    total_estimated_fees: string
    items_with_fees: string
    total_items: string
    total_orders: string
    line_items: string
    estimated_items_count: string
    estimated_sales_amount: string
    items_with_actual_revenue: string
    actual_revenue_total: string
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
      -- SELLERBOARD-LEVEL ACCURACY: Use actual_revenue from settlements when available
      ROUND(COALESCE(SUM(
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
      ), 0), 2)::text as total_sales,
      COALESCE(SUM(oi.quantity), 0)::text as total_units,
      ROUND(COALESCE(SUM(COALESCE(oi.promo_discount, 0)), 0), 2)::text as total_promo,
      ROUND(COALESCE(SUM(COALESCE(oi.amazon_fees, 0)), 0), 2)::text as total_actual_fees,
      ROUND(COALESCE(SUM(
        CASE
          WHEN COALESCE(oi.amazon_fees, 0) = 0
          THEN CASE
            WHEN oi.item_price > 0
            THEN ROUND((oi.item_price * 0.15) + (3.50 * oi.quantity), 2)
            -- Fee estimation fallback chain: most recent → recent avg → historical avg → catalog × 0.95 → 0
            WHEN COALESCE(mrp.recent_unit_price, 0) > 0
            THEN ROUND((mrp.recent_unit_price * oi.quantity * 0.15) + (3.50 * oi.quantity), 2)
            WHEN COALESCE(rap.avg_unit_price, 0) > 0
            THEN ROUND((rap.avg_unit_price * oi.quantity * 0.15) + (3.50 * oi.quantity), 2)
            WHEN COALESCE(hap.avg_unit_price, 0) > 0
            THEN ROUND((hap.avg_unit_price * oi.quantity * 0.15) + (3.50 * oi.quantity), 2)
            WHEN COALESCE(p.price, 0) > 0
            THEN ROUND((p.price * oi.quantity * 0.95 * 0.15) + (3.50 * oi.quantity), 2)
            ELSE 0
          END
          ELSE 0
        END
      ), 0), 2)::text as total_estimated_fees,
      COALESCE(SUM(CASE WHEN COALESCE(oi.amazon_fees, 0) > 0 THEN 1 ELSE 0 END), 0)::text as items_with_fees,
      COUNT(*)::text as total_items,
      COUNT(DISTINCT o.id)::text as total_orders,
      COUNT(oi.id)::text as line_items,
      -- Track estimated items for transparency
      COALESCE(SUM(CASE WHEN COALESCE(oi.item_price, 0) = 0 AND COALESCE(oi.gross_revenue, 0) = 0 AND COALESCE(oi.actual_revenue, 0) = 0 THEN 1 ELSE 0 END), 0)::text as estimated_items_count,
      ROUND(COALESCE(SUM(
        CASE
          WHEN COALESCE(oi.item_price, 0) = 0 AND COALESCE(oi.gross_revenue, 0) = 0 AND COALESCE(oi.actual_revenue, 0) = 0
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
      ), 0), 2)::text as estimated_sales_amount,
      -- Track items with actual revenue from settlements (Sellerboard-level accuracy indicator)
      COALESCE(SUM(CASE WHEN COALESCE(oi.actual_revenue, 0) > 0 THEN 1 ELSE 0 END), 0)::text as items_with_actual_revenue,
      ROUND(COALESCE(SUM(COALESCE(oi.actual_revenue, 0)), 0), 2)::text as actual_revenue_total
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    LEFT JOIN most_recent_prices mrp ON oi.master_sku = mrp.master_sku
    LEFT JOIN recent_avg_prices rap ON oi.master_sku = rap.master_sku
    LEFT JOIN historical_avg_prices hap ON oi.master_sku = hap.master_sku
    LEFT JOIN products p ON oi.master_sku = p.sku
    WHERE o.purchase_date >= $1::timestamp
      AND o.purchase_date < $2::timestamp
      AND o.status NOT IN ('Cancelled', 'Canceled')
      AND (o.sales_channel IS NULL OR o.sales_channel = 'Amazon.com')  -- Exclude MCF orders from other channels
  `, [startDate, endDate])

  const totalSales = parseFloat(summaryData?.total_sales || '0')
  const totalUnits = parseInt(summaryData?.total_units || '0', 10)
  const totalPromo = parseFloat(summaryData?.total_promo || '0')
  const actualFees = parseFloat(summaryData?.total_actual_fees || '0')
  const estimatedFees = parseFloat(summaryData?.total_estimated_fees || '0')
  const itemsWithActualFees = parseInt(summaryData?.items_with_fees || '0', 10)
  const totalItems = parseInt(summaryData?.total_items || '0', 10)
  const orderCount = parseInt(summaryData?.total_orders || '0', 10)
  const lineItemsCount = parseInt(summaryData?.line_items || '0', 10)
  const itemsWithEstimatedFees = totalItems - itemsWithActualFees
  const estimatedItemsCount = parseInt(summaryData?.estimated_items_count || '0', 10)
  const estimatedSalesAmount = parseFloat(summaryData?.estimated_sales_amount || '0')
  const itemsWithActualRevenue = parseInt(summaryData?.items_with_actual_revenue || '0', 10)
  const actualRevenueTotal = parseFloat(summaryData?.actual_revenue_total || '0')

  // Collect sample items for debugging if needed
  const sampleItems: DebugInfo['sampleItems'] = []
  if (includeDebug && itemsWithEstimatedFees > 0) {
    const sampleItemsData = await query<{
      item_price: string
      quantity: string
    }>(`
      SELECT
        oi.item_price::text,
        oi.quantity::text
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= $1
        AND o.purchase_date < $2
        AND o.status NOT IN ('Cancelled', 'Canceled')
        AND COALESCE(oi.amazon_fees, 0) = 0
        AND oi.item_price > 0
      ORDER BY oi.id
      LIMIT 5
    `, [startDate, endDate])

    for (const item of sampleItemsData) {
      const itemPrice = parseFloat(item.item_price || '0')
      const quantity = parseInt(item.quantity || '1', 10)
      if (itemPrice > 0) {
        const estimate = getQuickFeeEstimate(itemPrice, quantity)
        sampleItems.push({
          itemPrice,
          quantity,
          amazonFees: 0,
          estimatedFees: estimate.totalFees,
        })
      }
    }
  }

  const feeEstimationRate = totalItems > 0 ? (itemsWithEstimatedFees / totalItems) * 100 : 0

  // Build debug info if requested
  const debug: DebugInfo | undefined = includeDebug ? {
    dateRange: {
      start: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
      end: format(endDate, 'yyyy-MM-dd HH:mm:ss'),
    },
    orderItemCount: totalItems,
    itemsWithActualFees,
    itemsWithEstimatedFees,
    totalActualFees: Number(actualFees.toFixed(2)),
    totalEstimatedFees: Number(estimatedFees.toFixed(2)),
    estimatedItemsCount,
    estimatedSalesAmount: Number(estimatedSalesAmount.toFixed(2)),
    sampleItems,
    settlementAccuracy: {
      itemsWithActualRevenue,
      actualRevenueTotal: Number(actualRevenueTotal.toFixed(2)),
      settlementCoverageRate: totalItems > 0 ? Number(((itemsWithActualRevenue / totalItems) * 100).toFixed(1)) : 0,
    },
  } : undefined

  // Get refund data - both count and dollar amount
  let refundCount = 0
  let refundAmount = 0

  // First try returns table with actual refund_amount
  try {
    const refundData = await queryOne<{ total_quantity: string; total_amount: string }>(`
      SELECT
        COALESCE(SUM(quantity), 0)::text as total_quantity,
        COALESCE(SUM(refund_amount), 0)::text as total_amount
      FROM returns
        WHERE return_date >= $1
        AND return_date < $2
    `, [startDate, endDate])
    refundCount = parseInt(refundData?.total_quantity || '0', 10)
    refundAmount = parseFloat(refundData?.total_amount || '0')
  } catch {
    // Returns table might not have data
  }

  // If refund_amount is 0 but we have refund count, estimate from order item prices
  if (refundAmount === 0 && refundCount > 0) {
    try {
      const estimatedRefunds = await queryOne<{ total: string }>(`
        SELECT COALESCE(SUM(oi.item_price * r.quantity), 0)::text as total
        FROM returns r
        JOIN order_items oi ON r.order_id = oi.order_id AND r.master_sku = oi.master_sku
        WHERE r.return_date >= $1
          AND r.return_date < $2
      `, [startDate, endDate])
      refundAmount = parseFloat(estimatedRefunds?.total || '0')
    } catch {
      // Estimation failed, continue to other sources
    }
  }

  // If still 0, try daily_summary table
  if (refundAmount === 0) {
    try {
      const summaryRefunds = await queryOne<{ total: string }>(`
        SELECT COALESCE(SUM(total_refunds), 0)::text as total
        FROM daily_summary
        WHERE date >= $1::date
          AND date < $2::date
      `, [startDate, endDate])
      refundAmount = parseFloat(summaryRefunds?.total || '0')
    } catch {
      // daily_summary might not exist
    }
  }

  // If still 0, try daily_profit table
  if (refundAmount === 0) {
    try {
      const profitRefunds = await queryOne<{ total: string }>(`
        SELECT COALESCE(SUM(refunds), 0)::text as total
        FROM daily_profit
        WHERE date >= $1::date
          AND date < $2::date
      `, [startDate, endDate])
      refundAmount = parseFloat(profitRefunds?.total || '0')
    } catch {
      // daily_profit might not exist
    }
  }

  // Get ad spend from advertising_daily (if connected), broken down by campaign type
  let adCost = 0
  let adCostSP = 0
  let adCostSB = 0
  let adCostSD = 0
  try {
    const adData = await query<{ campaign_type: string; total_spend: string }>(`
      SELECT
        campaign_type,
        COALESCE(SUM(spend), 0)::text as total_spend
      FROM advertising_daily
      WHERE date >= $1
        AND date < $2
      GROUP BY campaign_type
    `, [startDate, endDate])

    for (const row of adData) {
      const spend = parseFloat(row.total_spend || '0')
      adCost += spend
      switch (row.campaign_type) {
        case 'SP':
          adCostSP = spend
          break
        case 'SB':
          adCostSB = spend
          break
        case 'SD':
          adCostSD = spend
          break
      }
    }
  } catch {
    // Ads table might not exist yet
  }

  // Calculate COGS - use 'cost' column from products table
  let cogs = 0
  try {
    const cogsData = await queryOne<{ total_cogs: string }>(`
      SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost, 0)), 0)::text as total_cogs
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE o.purchase_date >= $1
      AND o.purchase_date < $2
      AND o.status NOT IN ('Cancelled', 'Canceled')
    `, [startDate, endDate])
    cogs = parseFloat(cogsData?.total_cogs || '0')
  } catch (e) {
    console.log('COGS query error:', e)
  }

  return {
    sales: Number(totalSales.toFixed(2)),
    orders: orderCount,
    lineItems: lineItemsCount,
    units: totalUnits,
    promos: Number(totalPromo.toFixed(2)),
    refunds: Number(refundAmount.toFixed(2)),
    refundCount,
    adCost: Number(adCost.toFixed(2)),
    adCostSP: Number(adCostSP.toFixed(2)),
    adCostSB: Number(adCostSB.toFixed(2)),
    adCostSD: Number(adCostSD.toFixed(2)),
    amazonFees: Number((actualFees + estimatedFees).toFixed(2)),
    amazonFeesEstimated: Number(estimatedFees.toFixed(2)),
    cogs: Number(cogs.toFixed(2)),
    feeEstimationRate: Number(feeEstimationRate.toFixed(1)),
    debug,
  }
}

/**
 * Lightweight version of getPeriodData that uses pre-computed price lookups
 * This avoids running heavy CTEs for each period query
 */
export async function getPeriodDataLightweight(
  startDate: Date,
  endDate: Date,
  priceLookups: Map<string, PriceLookup>,
  includeDebug: boolean = false
): Promise<PeriodData> {
  // Get aggregated order items data - simplified query without price CTEs
  const summaryData = await queryOne<{
    total_sales: string
    total_units: string
    total_promo: string
    total_actual_fees: string
    total_items: string
    total_orders: string
    line_items: string
    items_with_fees: string
    items_with_actual_revenue: string
    actual_revenue_total: string
  }>(`
    SELECT
      -- Revenue with fallback to item components (price lookups handled in JS)
      ROUND(COALESCE(SUM(
        CASE
          WHEN COALESCE(oi.actual_revenue, 0) > 0 THEN oi.actual_revenue
          WHEN COALESCE(oi.gross_revenue, 0) > 0 THEN oi.gross_revenue
          WHEN oi.item_price > 0 THEN oi.item_price + COALESCE(oi.shipping_price, 0) + COALESCE(oi.gift_wrap_price, 0)
          ELSE 0  -- Will be filled in from price lookups
        END
      ), 0), 2)::text as total_sales,
      COALESCE(SUM(oi.quantity), 0)::text as total_units,
      ROUND(COALESCE(SUM(COALESCE(oi.promo_discount, 0)), 0), 2)::text as total_promo,
      ROUND(COALESCE(SUM(COALESCE(oi.amazon_fees, 0)), 0), 2)::text as total_actual_fees,
      COUNT(*)::text as total_items,
      COUNT(DISTINCT o.id)::text as total_orders,
      COUNT(oi.id)::text as line_items,
      COALESCE(SUM(CASE WHEN COALESCE(oi.amazon_fees, 0) > 0 THEN 1 ELSE 0 END), 0)::text as items_with_fees,
      COALESCE(SUM(CASE WHEN COALESCE(oi.actual_revenue, 0) > 0 THEN 1 ELSE 0 END), 0)::text as items_with_actual_revenue,
      ROUND(COALESCE(SUM(COALESCE(oi.actual_revenue, 0)), 0), 2)::text as actual_revenue_total
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    WHERE o.purchase_date >= $1::timestamp
      AND o.purchase_date < $2::timestamp
      AND o.status NOT IN ('Cancelled', 'Canceled')
      AND (o.sales_channel IS NULL OR o.sales_channel = 'Amazon.com')
  `, [startDate, endDate])

  // Get items needing price estimation
  const itemsNeedingEstimation = await query<{
    master_sku: string
    quantity: string
    shipping_price: string
    gift_wrap_price: string
    catalog_price: string
  }>(`
    SELECT
      oi.master_sku,
      oi.quantity::text,
      COALESCE(oi.shipping_price, 0)::text as shipping_price,
      COALESCE(oi.gift_wrap_price, 0)::text as gift_wrap_price,
      COALESCE(p.price, 0)::text as catalog_price
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    LEFT JOIN products p ON oi.master_sku = p.sku
    WHERE o.purchase_date >= $1::timestamp
      AND o.purchase_date < $2::timestamp
      AND o.status NOT IN ('Cancelled', 'Canceled')
      AND (o.sales_channel IS NULL OR o.sales_channel = 'Amazon.com')
      AND COALESCE(oi.actual_revenue, 0) = 0
      AND COALESCE(oi.gross_revenue, 0) = 0
      AND COALESCE(oi.item_price, 0) = 0
  `, [startDate, endDate])

  // Calculate estimated sales and fees from price lookups
  let estimatedSales = 0
  let estimatedFees = 0
  let estimatedItemsCount = 0

  for (const item of itemsNeedingEstimation) {
    const quantity = parseInt(item.quantity || '1', 10)
    const shipping = parseFloat(item.shipping_price || '0')
    const giftWrap = parseFloat(item.gift_wrap_price || '0')
    const catalogPrice = parseFloat(item.catalog_price || '0')

    const lookup = priceLookups.get(item.master_sku)
    let unitPrice = 0

    if (lookup?.recent_unit_price) {
      unitPrice = lookup.recent_unit_price
    } else if (lookup?.avg_30d_price) {
      unitPrice = lookup.avg_30d_price
    } else if (lookup?.avg_180d_price) {
      unitPrice = lookup.avg_180d_price
    } else if (catalogPrice > 0) {
      unitPrice = catalogPrice * 0.95
    }

    if (unitPrice > 0) {
      estimatedSales += (unitPrice * quantity) + shipping + giftWrap
      estimatedFees += (unitPrice * quantity * 0.15) + (3.50 * quantity)
      estimatedItemsCount++
    }
  }

  // Get items without fees for fee estimation
  const itemsWithoutFees = await query<{
    item_price: string
    quantity: string
    master_sku: string
    catalog_price: string
  }>(`
    SELECT
      oi.item_price::text,
      oi.quantity::text,
      oi.master_sku,
      COALESCE(p.price, 0)::text as catalog_price
    FROM order_items oi
    INNER JOIN orders o ON oi.order_id = o.id
    LEFT JOIN products p ON oi.master_sku = p.sku
    WHERE o.purchase_date >= $1::timestamp
      AND o.purchase_date < $2::timestamp
      AND o.status NOT IN ('Cancelled', 'Canceled')
      AND (o.sales_channel IS NULL OR o.sales_channel = 'Amazon.com')
      AND COALESCE(oi.amazon_fees, 0) = 0
      AND oi.item_price > 0
  `, [startDate, endDate])

  // Calculate fee estimates for items with known prices but no fees
  for (const item of itemsWithoutFees) {
    const itemPrice = parseFloat(item.item_price || '0')
    const quantity = parseInt(item.quantity || '1', 10)
    if (itemPrice > 0) {
      estimatedFees += (itemPrice * 0.15) + (3.50 * quantity)
    }
  }

  const totalSales = parseFloat(summaryData?.total_sales || '0') + estimatedSales
  const totalUnits = parseInt(summaryData?.total_units || '0', 10)
  const totalPromo = parseFloat(summaryData?.total_promo || '0')
  const actualFees = parseFloat(summaryData?.total_actual_fees || '0')
  const itemsWithActualFees = parseInt(summaryData?.items_with_fees || '0', 10)
  const totalItems = parseInt(summaryData?.total_items || '0', 10)
  const orderCount = parseInt(summaryData?.total_orders || '0', 10)
  const lineItemsCount = parseInt(summaryData?.line_items || '0', 10)
  const itemsWithEstimatedFees = totalItems - itemsWithActualFees
  const itemsWithActualRevenue = parseInt(summaryData?.items_with_actual_revenue || '0', 10)
  const actualRevenueTotal = parseFloat(summaryData?.actual_revenue_total || '0')

  const feeEstimationRate = totalItems > 0 ? (itemsWithEstimatedFees / totalItems) * 100 : 0

  // Build debug info if requested
  const debug: DebugInfo | undefined = includeDebug ? {
    dateRange: {
      start: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
      end: format(endDate, 'yyyy-MM-dd HH:mm:ss'),
    },
    orderItemCount: totalItems,
    itemsWithActualFees,
    itemsWithEstimatedFees,
    totalActualFees: Number(actualFees.toFixed(2)),
    totalEstimatedFees: Number(estimatedFees.toFixed(2)),
    estimatedItemsCount,
    estimatedSalesAmount: Number(estimatedSales.toFixed(2)),
    settlementAccuracy: {
      itemsWithActualRevenue,
      actualRevenueTotal: Number(actualRevenueTotal.toFixed(2)),
      settlementCoverageRate: totalItems > 0 ? Number(((itemsWithActualRevenue / totalItems) * 100).toFixed(1)) : 0,
    },
  } : undefined

  // Get refund data
  let refundCount = 0
  let refundAmount = 0

  try {
    const refundData = await queryOne<{ total_quantity: string; total_amount: string }>(`
      SELECT
        COALESCE(SUM(quantity), 0)::text as total_quantity,
        COALESCE(SUM(refund_amount), 0)::text as total_amount
      FROM returns
      WHERE return_date >= $1
        AND return_date < $2
    `, [startDate, endDate])
    refundCount = parseInt(refundData?.total_quantity || '0', 10)
    refundAmount = parseFloat(refundData?.total_amount || '0')
  } catch {
    // Returns table might not have data
  }

  if (refundAmount === 0 && refundCount > 0) {
    try {
      const estimatedRefunds = await queryOne<{ total: string }>(`
        SELECT COALESCE(SUM(oi.item_price * r.quantity), 0)::text as total
        FROM returns r
        JOIN order_items oi ON r.order_id = oi.order_id AND r.master_sku = oi.master_sku
        WHERE r.return_date >= $1 AND r.return_date < $2
      `, [startDate, endDate])
      refundAmount = parseFloat(estimatedRefunds?.total || '0')
    } catch {
      // Estimation failed
    }
  }

  // Get ad spend
  let adCost = 0
  let adCostSP = 0
  let adCostSB = 0
  let adCostSD = 0
  try {
    const adData = await query<{ campaign_type: string; total_spend: string }>(`
      SELECT campaign_type, COALESCE(SUM(spend), 0)::text as total_spend
      FROM advertising_daily
      WHERE date >= $1 AND date < $2
      GROUP BY campaign_type
    `, [startDate, endDate])

    for (const row of adData) {
      const spend = parseFloat(row.total_spend || '0')
      adCost += spend
      switch (row.campaign_type) {
        case 'SP': adCostSP = spend; break
        case 'SB': adCostSB = spend; break
        case 'SD': adCostSD = spend; break
      }
    }
  } catch {
    // Ads table might not exist
  }

  // Calculate COGS
  let cogs = 0
  try {
    const cogsData = await queryOne<{ total_cogs: string }>(`
      SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost, 0)), 0)::text as total_cogs
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE o.purchase_date >= $1 AND o.purchase_date < $2
        AND o.status NOT IN ('Cancelled', 'Canceled')
    `, [startDate, endDate])
    cogs = parseFloat(cogsData?.total_cogs || '0')
  } catch {
    // COGS query error
  }

  return {
    sales: Number(totalSales.toFixed(2)),
    orders: orderCount,
    lineItems: lineItemsCount,
    units: totalUnits,
    promos: Number(totalPromo.toFixed(2)),
    refunds: Number(refundAmount.toFixed(2)),
    refundCount,
    adCost: Number(adCost.toFixed(2)),
    adCostSP: Number(adCostSP.toFixed(2)),
    adCostSB: Number(adCostSB.toFixed(2)),
    adCostSD: Number(adCostSD.toFixed(2)),
    amazonFees: Number((actualFees + estimatedFees).toFixed(2)),
    amazonFeesEstimated: Number(estimatedFees.toFixed(2)),
    cogs: Number(cogs.toFixed(2)),
    feeEstimationRate: Number(feeEstimationRate.toFixed(1)),
    debug,
  }
}

// ============================================================================
// DERIVED METRICS
// ============================================================================

/**
 * Calculate derived profit metrics from period data
 *
 * Formulas (matching Sellerboard):
 * - Gross Profit = Sales - Promos - Amazon Fees - COGS
 * - Net Profit = Gross Profit - Ad Cost - Refunds
 * - Est Payout = Sales - Promos - Amazon Fees - Refunds
 */
export function calculateMetrics(data: PeriodData): DerivedMetrics {
  const grossProfit = data.sales - data.promos - data.amazonFees - data.cogs
  const netProfit = grossProfit - data.adCost - data.refunds
  const estPayout = data.sales - data.promos - data.amazonFees - data.refunds
  const margin = data.sales > 0 ? (netProfit / data.sales) * 100 : 0
  const roi = data.cogs > 0 ? (netProfit / data.cogs) * 100 : 0
  const acos = data.adCost > 0 && data.sales > 0 ? (data.adCost / data.sales) * 100 : null
  const tacos = data.sales > 0 ? (data.adCost / data.sales) * 100 : null
  const realAcos = netProfit > 0 && data.adCost > 0 ? (data.adCost / netProfit) * 100 : null

  return {
    grossProfit: Number(grossProfit.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    estPayout: Number(estPayout.toFixed(2)),
    margin: Number(margin.toFixed(2)),
    roi: Number(roi.toFixed(2)),
    acos: acos !== null ? Number(acos.toFixed(2)) : null,
    tacos: tacos !== null ? Number(tacos.toFixed(2)) : null,
    realAcos: realAcos !== null ? Number(realAcos.toFixed(2)) : null,
  }
}

/**
 * Get complete profit summary for a date range (period data + derived metrics)
 */
export async function getProfitSummary(
  startDate: Date,
  endDate: Date,
  includeDebug: boolean = false
): Promise<ProfitSummary> {
  const periodData = await getPeriodData(startDate, endDate, includeDebug)
  const metrics = calculateMetrics(periodData)
  return { ...periodData, ...metrics }
}

/**
 * Get profit summary for a named period
 */
export async function getProfitForPeriod(
  period: string,
  includeDebug: boolean = false
): Promise<ProfitSummary & { period: string; dateRange: string }> {
  const range = getDateRangeForPeriod(period)
  const summary = await getProfitSummary(range.start, range.end, includeDebug)
  return {
    period,
    dateRange: range.label,
    ...summary,
  }
}

// ============================================================================
// SIMPLE PROFIT CALCULATION (for dashboard quick stats)
// ============================================================================

/**
 * Get just the net profit for a date range (lightweight query)
 * Uses the same canonical formula but returns only the net profit number.
 */
export async function getNetProfitForRange(startDate: Date, endDate: Date): Promise<number> {
  const data = await getPeriodData(startDate, endDate, false)
  const metrics = calculateMetrics(data)
  return metrics.netProfit
}
