/**
 * Fee Estimation Utility
 *
 * Estimates Amazon fees for orders that don't have actual fee data yet.
 * This handles the date mismatch between purchaseDate and fee postedDate.
 *
 * Fee Structure:
 * - Referral Fee: ~15% of item price (varies by category, 8-45%)
 * - FBA Fee: Fixed based on size/weight (~$3-5 for standard items)
 */

import { prisma } from '@/lib/prisma'

// Default fee rates (conservative estimates)
const DEFAULT_REFERRAL_RATE = 0.15  // 15% - most categories
const DEFAULT_FBA_FEE = 3.50        // $3.50 - standard size small

// Category-specific referral rates
const CATEGORY_REFERRAL_RATES: Record<string, number> = {
  'jewelry': 0.20,           // 20%
  'watches': 0.16,           // 16%
  'clothing': 0.17,          // 17%
  'shoes': 0.15,             // 15%
  'electronics': 0.08,       // 8%
  'computers': 0.08,         // 8%
  'home': 0.15,              // 15%
  'kitchen': 0.15,           // 15%
  'beauty': 0.15,            // 15% (8% for items > $10)
  'health': 0.15,            // 15%
  'toys': 0.15,              // 15%
  'sports': 0.15,            // 15%
  'books': 0.15,             // 15%
  'default': 0.15,
}

interface FeeEstimate {
  referralFee: number
  fbaFee: number
  totalFees: number
  isEstimated: boolean
}

interface ProductFeeHistory {
  avgReferralRate: number
  avgFbaFee: number
  sampleSize: number
}

// Cache for product fee history
const feeHistoryCache = new Map<string, ProductFeeHistory>()
let cacheLastUpdated = 0
const CACHE_TTL = 5 * 60 * 1000  // 5 minutes

/**
 * Get historical average fee rates for a product
 */
async function getProductFeeHistory(masterSku: string): Promise<ProductFeeHistory | null> {
  // Check cache
  const now = Date.now()
  if (now - cacheLastUpdated > CACHE_TTL) {
    feeHistoryCache.clear()
    cacheLastUpdated = now
  }

  if (feeHistoryCache.has(masterSku)) {
    return feeHistoryCache.get(masterSku)!
  }

  try {
    // Get average fees from historical orders with actual fee data
    const history = await prisma.$queryRaw<Array<{
      avg_referral_rate: number
      avg_fba_fee: number
      sample_size: number
    }>>`
      SELECT
        AVG(CASE WHEN item_price > 0 THEN referral_fee / item_price ELSE 0 END) as avg_referral_rate,
        AVG(fba_fee / NULLIF(quantity, 0)) as avg_fba_fee,
        COUNT(*)::int as sample_size
      FROM order_items
      WHERE master_sku = ${masterSku}
        AND amazon_fees > 0
        AND item_price > 0
    `

    if (history[0] && history[0].sample_size >= 3) {
      const result = {
        avgReferralRate: Number(history[0].avg_referral_rate) || DEFAULT_REFERRAL_RATE,
        avgFbaFee: Number(history[0].avg_fba_fee) || DEFAULT_FBA_FEE,
        sampleSize: history[0].sample_size,
      }
      feeHistoryCache.set(masterSku, result)
      return result
    }
  } catch (e) {
    // Ignore errors, fall back to defaults
  }

  return null
}

/**
 * Estimate fees for a single order item
 */
export async function estimateOrderItemFees(
  masterSku: string,
  itemPrice: number,
  quantity: number,
  category?: string
): Promise<FeeEstimate> {
  // Try to get historical rates for this product
  const history = await getProductFeeHistory(masterSku)

  let referralRate: number
  let fbaFeePerUnit: number

  if (history && history.sampleSize >= 3) {
    // Use product-specific historical rates
    referralRate = history.avgReferralRate
    fbaFeePerUnit = history.avgFbaFee
  } else {
    // Fall back to category or default rates
    const categoryLower = category?.toLowerCase() || 'default'
    referralRate = CATEGORY_REFERRAL_RATES[categoryLower] || DEFAULT_REFERRAL_RATE
    fbaFeePerUnit = DEFAULT_FBA_FEE
  }

  const referralFee = itemPrice * referralRate
  const fbaFee = fbaFeePerUnit * quantity
  const totalFees = referralFee + fbaFee

  return {
    referralFee: Number(referralFee.toFixed(2)),
    fbaFee: Number(fbaFee.toFixed(2)),
    totalFees: Number(totalFees.toFixed(2)),
    isEstimated: true,
  }
}

/**
 * Get fees for an order item - uses actual fees if available, estimates if not
 */
export async function getOrderItemFees(
  orderItem: {
    masterSku: string
    itemPrice: number
    quantity: number
    amazonFees: number
    referralFee: number
    fbaFee: number
  },
  category?: string
): Promise<FeeEstimate> {
  // If we have actual fees, use them
  if (orderItem.amazonFees > 0) {
    return {
      referralFee: Number(orderItem.referralFee),
      fbaFee: Number(orderItem.fbaFee),
      totalFees: Number(orderItem.amazonFees),
      isEstimated: false,
    }
  }

  // Estimate fees
  return estimateOrderItemFees(
    orderItem.masterSku,
    Number(orderItem.itemPrice),
    orderItem.quantity,
    category
  )
}

/**
 * Batch estimate fees for multiple order items
 */
export async function batchEstimateFees(
  orderItems: Array<{
    masterSku: string
    itemPrice: number
    quantity: number
    amazonFees: number
    referralFee: number
    fbaFee: number
    category?: string
  }>
): Promise<Map<number, FeeEstimate>> {
  const results = new Map<number, FeeEstimate>()

  // Pre-load fee history for all unique SKUs that need estimation
  const skusNeedingEstimate = [...new Set(
    orderItems
      .filter(item => Number(item.amazonFees) === 0)
      .map(item => item.masterSku)
  )]

  // Warm up cache
  await Promise.all(skusNeedingEstimate.map(sku => getProductFeeHistory(sku)))

  // Process all items
  for (let i = 0; i < orderItems.length; i++) {
    const item = orderItems[i]
    const fees = await getOrderItemFees(item, item.category)
    results.set(i, fees)
  }

  return results
}

/**
 * Calculate aggregate fee stats with estimation
 */
export interface AggregatedFeeStats {
  totalActualFees: number
  totalEstimatedFees: number
  totalCombinedFees: number
  itemsWithActualFees: number
  itemsWithEstimatedFees: number
  estimationRate: number  // % of items that needed estimation
}

export async function aggregateFees(
  orderItems: Array<{
    masterSku: string
    itemPrice: number
    quantity: number
    amazonFees: number
    referralFee: number
    fbaFee: number
    category?: string
  }>
): Promise<AggregatedFeeStats> {
  let totalActualFees = 0
  let totalEstimatedFees = 0
  let itemsWithActualFees = 0
  let itemsWithEstimatedFees = 0

  const feeMap = await batchEstimateFees(orderItems)

  for (let i = 0; i < orderItems.length; i++) {
    const fees = feeMap.get(i)!
    if (fees.isEstimated) {
      totalEstimatedFees += fees.totalFees
      itemsWithEstimatedFees++
    } else {
      totalActualFees += fees.totalFees
      itemsWithActualFees++
    }
  }

  const totalItems = orderItems.length
  const estimationRate = totalItems > 0 ? (itemsWithEstimatedFees / totalItems) * 100 : 0

  return {
    totalActualFees: Number(totalActualFees.toFixed(2)),
    totalEstimatedFees: Number(totalEstimatedFees.toFixed(2)),
    totalCombinedFees: Number((totalActualFees + totalEstimatedFees).toFixed(2)),
    itemsWithActualFees,
    itemsWithEstimatedFees,
    estimationRate: Number(estimationRate.toFixed(1)),
  }
}

/**
 * Get default fee estimate for display purposes (no DB lookup)
 */
export function getQuickFeeEstimate(itemPrice: number, quantity: number = 1): FeeEstimate {
  const referralFee = itemPrice * DEFAULT_REFERRAL_RATE
  const fbaFee = DEFAULT_FBA_FEE * quantity

  return {
    referralFee: Number(referralFee.toFixed(2)),
    fbaFee: Number(fbaFee.toFixed(2)),
    totalFees: Number((referralFee + fbaFee).toFixed(2)),
    isEstimated: true,
  }
}
