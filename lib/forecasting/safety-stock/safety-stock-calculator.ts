/**
 * Safety Stock Optimization
 *
 * Calculates optimal safety stock per SKU based on:
 * - Sales velocity variability
 * - Supplier reliability
 * - Seasonality proximity
 * - Lead time uncertainty
 */

import { prisma } from '@/lib/prisma'
import {
  SafetyStockCalculation,
  ImportanceLevel,
} from '../types'
import { getSupplierLeadTime } from '../lead-time/lead-time-tracker'

// Z-scores for different service levels
const Z_SCORES: Record<string, number> = {
  '99%': 2.33,   // Best sellers
  '97.5%': 1.96,
  '95%': 1.65,   // Regular items
  '90%': 1.28,   // Slow movers
  '85%': 1.04,
}

interface SafetyStockConfig {
  minDays: number
  maxDays: number
  seasonalBuffer: number  // Extra days during peak season
  newItemBuffer: number   // Extra buffer for new items
}

const DEFAULT_CONFIG: SafetyStockConfig = {
  minDays: 7,
  maxDays: 60,
  seasonalBuffer: 14,
  newItemBuffer: 7,
}

/**
 * Calculate optimal safety stock for a SKU
 */
export async function calculateSafetyStock(
  masterSku: string,
  config: Partial<SafetyStockConfig> = {}
): Promise<SafetyStockCalculation> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }

  // Get product and supplier info
  const product = await prisma.product.findUnique({
    where: { sku: masterSku },
    include: {
      supplier: true,
      skuAnalytics: true,
    },
  })

  if (!product) {
    throw new Error(`Product not found: ${masterSku}`)
  }

  // Get sales data for variability calculation
  const salesData = await getSalesData(masterSku)

  // Calculate demand statistics
  const demandStats = calculateDemandStats(salesData)

  // Get lead time data
  const leadTimeData = product.supplierId
    ? await getSupplierLeadTime(product.supplierId)
    : null

  const leadTimeDays = leadTimeData?.avgActualLeadTime || product.supplier?.leadTimeDays || 30
  const leadTimeStdDev = leadTimeData?.leadTimeVariance || leadTimeDays * 0.2

  // Determine importance level based on velocity
  const importance = determineImportance(demandStats.mean)

  // Get Z-score based on importance
  const serviceLevelTarget = getServiceLevel(importance)
  const zScore = Z_SCORES[serviceLevelTarget]

  // Base safety stock formula: Z × √(L × σd² + d² × σL²)
  // Where: L = lead time, σd = demand std dev, d = avg demand, σL = lead time std dev
  const baseSafetyStock = calculateBaseSafetyStock(
    zScore,
    leadTimeDays,
    demandStats.stdDev,
    demandStats.mean,
    leadTimeStdDev
  )

  // Apply adjustments
  const { adjustedStock, adjustments, reasoning } = applyAdjustments(
    baseSafetyStock,
    masterSku,
    demandStats.mean,
    leadTimeData,
    product.skuAnalytics,
    fullConfig
  )

  // Ensure within bounds
  const minStock = demandStats.mean * fullConfig.minDays
  const maxStock = demandStats.mean * fullConfig.maxDays
  const finalSafetyStock = Math.ceil(
    Math.max(minStock, Math.min(maxStock, adjustedStock))
  )

  return {
    masterSku,
    demandStdDev: demandStats.stdDev,
    leadTimeDays: Math.round(leadTimeDays),
    leadTimeStdDev,
    serviceLevelTarget: parseFloat(serviceLevelTarget) / 100,
    zScore,
    importance,
    safetyStock: Math.ceil(baseSafetyStock),
    seasonalityAdjustment: adjustments.seasonality,
    supplierReliabilityAdjustment: adjustments.supplier,
    finalSafetyStock,
    reasoning,
  }
}

/**
 * Get sales data for a SKU
 */
async function getSalesData(masterSku: string): Promise<number[]> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  try {
    const dailyProfits = await prisma.dailyProfit.findMany({
      where: {
        masterSku,
        date: { gte: ninetyDaysAgo },
      },
      orderBy: { date: 'asc' },
    })

    if (dailyProfits.length > 0) {
      return dailyProfits.map((dp) => dp.unitsSold)
    }
  } catch (error) {
    // Fall through
  }

  // Fallback: aggregate from orders by date
  const orders = await prisma.orderItem.findMany({
    where: {
      masterSku,
      order: {
        purchaseDate: { gte: ninetyDaysAgo },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
    include: {
      order: { select: { purchaseDate: true } },
    },
  })

  // Aggregate by date
  const dailyMap = new Map<string, number>()

  for (const order of orders) {
    const dateStr = order.order.purchaseDate.toISOString().split('T')[0]
    dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + order.quantity)
  }

  return Array.from(dailyMap.values())
}

/**
 * Calculate demand statistics
 */
function calculateDemandStats(salesData: number[]): {
  mean: number
  stdDev: number
  cv: number
} {
  if (salesData.length === 0) {
    return { mean: 1, stdDev: 0.5, cv: 0.5 }
  }

  const mean = salesData.reduce((a, b) => a + b, 0) / salesData.length
  const variance =
    salesData.reduce((sum, val) => sum + (val - mean) ** 2, 0) / salesData.length
  const stdDev = Math.sqrt(variance)
  const cv = mean > 0 ? stdDev / mean : 0

  return { mean, stdDev, cv }
}

/**
 * Determine SKU importance based on velocity
 */
function determineImportance(avgDailyDemand: number): ImportanceLevel {
  if (avgDailyDemand >= 10) return 'best_seller'
  if (avgDailyDemand >= 1) return 'regular'
  return 'slow_mover'
}

/**
 * Get service level based on importance
 */
function getServiceLevel(importance: ImportanceLevel): string {
  switch (importance) {
    case 'best_seller':
      return '99%'
    case 'regular':
      return '95%'
    case 'slow_mover':
      return '90%'
  }
}

/**
 * Calculate base safety stock using standard formula
 */
function calculateBaseSafetyStock(
  zScore: number,
  leadTime: number,
  demandStdDev: number,
  avgDemand: number,
  leadTimeStdDev: number
): number {
  // Combined formula accounting for both demand and lead time variability
  // SS = Z × √(L × σd² + d² × σL²)
  const demandVariance = demandStdDev ** 2
  const leadTimeVariance = leadTimeStdDev ** 2

  const combinedVariance =
    leadTime * demandVariance + avgDemand ** 2 * leadTimeVariance

  return zScore * Math.sqrt(combinedVariance)
}

/**
 * Apply adjustments based on various factors
 */
function applyAdjustments(
  baseSafetyStock: number,
  masterSku: string,
  avgDemand: number,
  leadTimeData: any,
  skuAnalytics: any,
  config: SafetyStockConfig
): {
  adjustedStock: number
  adjustments: {
    seasonality: number
    supplier: number
    newItem: number
    spike: number
  }
  reasoning: string[]
} {
  let adjustedStock = baseSafetyStock
  const reasoning: string[] = []
  const adjustments = {
    seasonality: 0,
    supplier: 0,
    newItem: 0,
    spike: 0,
  }

  // 1. Seasonality adjustment
  const seasonalityInfo = checkSeasonalityProximity()
  if (seasonalityInfo.nearSeason) {
    const seasonalAdjustment = avgDemand * config.seasonalBuffer
    adjustments.seasonality = seasonalAdjustment
    adjustedStock += seasonalAdjustment
    reasoning.push(
      `+${Math.round(seasonalAdjustment)} units for upcoming ${seasonalityInfo.eventName} (${config.seasonalBuffer} days buffer)`
    )
  }

  // 2. Supplier reliability adjustment
  if (leadTimeData && leadTimeData.reliabilityScore < 0.7) {
    const reliabilityAdjustment = baseSafetyStock * 0.3 // 30% increase
    adjustments.supplier = reliabilityAdjustment
    adjustedStock += reliabilityAdjustment
    reasoning.push(
      `+${Math.round(reliabilityAdjustment)} units for low supplier reliability (${Math.round(
        leadTimeData.reliabilityScore * 100
      )}%)`
    )
  } else if (leadTimeData && leadTimeData.isGettingWorse) {
    const trendAdjustment = baseSafetyStock * 0.15
    adjustments.supplier = trendAdjustment
    adjustedStock += trendAdjustment
    reasoning.push(
      `+${Math.round(trendAdjustment)} units for deteriorating lead times (${leadTimeData.trendPercent.toFixed(0)}% increase)`
    )
  }

  // 3. New item adjustment
  if (skuAnalytics?.isNewItem) {
    const newItemAdjustment = avgDemand * config.newItemBuffer
    adjustments.newItem = newItemAdjustment
    adjustedStock += newItemAdjustment
    reasoning.push(
      `+${Math.round(newItemAdjustment)} units for new item uncertainty`
    )
  }

  // 4. Spike adjustment
  if (skuAnalytics?.isSpiking && skuAnalytics.spikeMultiplier > 1) {
    const spikeAdjustment = baseSafetyStock * (skuAnalytics.spikeMultiplier - 1)
    adjustments.spike = spikeAdjustment
    adjustedStock += spikeAdjustment
    reasoning.push(
      `+${Math.round(spikeAdjustment)} units for current sales spike (${skuAnalytics.spikeMultiplier.toFixed(1)}x)`
    )
  }

  // Add base reasoning
  reasoning.unshift(
    `Base safety stock: ${Math.round(baseSafetyStock)} units (Z=${Z_SCORES['95%']} for 95% service level)`
  )

  return { adjustedStock, adjustments, reasoning }
}

/**
 * Check if approaching seasonal peak
 */
function checkSeasonalityProximity(): {
  nearSeason: boolean
  eventName: string | null
  daysUntil: number
} {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()

  // Check major events (within 45 days)
  const events = [
    { name: "Valentine's Day", month: 2, day: 14 },
    { name: "Mother's Day", month: 5, day: 14 },
    { name: "Father's Day", month: 6, day: 21 },
    { name: 'Prime Day', month: 7, day: 15 },
    { name: 'Black Friday', month: 11, day: 29 },
    { name: 'Christmas', month: 12, day: 25 },
  ]

  for (const event of events) {
    const eventDate = new Date(today.getFullYear(), event.month - 1, event.day)

    // If event has passed this year, check next year
    if (eventDate < today) {
      eventDate.setFullYear(eventDate.getFullYear() + 1)
    }

    const daysUntil = Math.ceil(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysUntil <= 45) {
      return {
        nearSeason: true,
        eventName: event.name,
        daysUntil,
      }
    }
  }

  return {
    nearSeason: false,
    eventName: null,
    daysUntil: 999,
  }
}

/**
 * Get recommended safety stock days by category
 */
export function getRecommendedSafetyStockDays(
  importance: ImportanceLevel,
  supplierReliability: number,
  isNearSeason: boolean
): number {
  let baseDays: number

  switch (importance) {
    case 'best_seller':
      baseDays = 21 // 3 weeks for best sellers
      break
    case 'regular':
      baseDays = 14 // 2 weeks for regular
      break
    case 'slow_mover':
      baseDays = 10 // 10 days for slow movers
      break
  }

  // Adjust for supplier reliability
  if (supplierReliability < 0.7) {
    baseDays *= 1.3
  } else if (supplierReliability < 0.85) {
    baseDays *= 1.15
  }

  // Adjust for seasonality
  if (isNearSeason) {
    baseDays += 7
  }

  return Math.round(baseDays)
}

/**
 * Calculate safety stock for all SKUs
 */
export async function calculateAllSafetyStock(): Promise<{
  calculated: number
  results: SafetyStockCalculation[]
}> {
  const products = await prisma.product.findMany({
    where: { isHidden: false },
    select: { sku: true },
  })

  const results: SafetyStockCalculation[] = []

  for (const product of products) {
    try {
      const calculation = await calculateSafetyStock(product.sku)
      results.push(calculation)
    } catch (error) {
      console.error(`Error calculating safety stock for ${product.sku}:`, error)
    }
  }

  return {
    calculated: results.length,
    results,
  }
}

/**
 * Get safety stock summary
 */
export async function getSafetyStockSummary(): Promise<{
  totalSkus: number
  avgSafetyStockDays: number
  byImportance: Record<ImportanceLevel, { count: number; avgDays: number }>
  topAdjustments: Array<{
    masterSku: string
    adjustment: string
    units: number
  }>
}> {
  const { results } = await calculateAllSafetyStock()

  const byImportance: Record<ImportanceLevel, { count: number; totalDays: number }> = {
    best_seller: { count: 0, totalDays: 0 },
    regular: { count: 0, totalDays: 0 },
    slow_mover: { count: 0, totalDays: 0 },
  }

  let totalDays = 0

  for (const result of results) {
    const days = result.finalSafetyStock / Math.max(result.demandStdDev, 1)
    totalDays += days

    byImportance[result.importance].count++
    byImportance[result.importance].totalDays += days
  }

  // Find top adjustments
  const adjustments: Array<{
    masterSku: string
    adjustment: string
    units: number
  }> = []

  for (const result of results) {
    if (result.seasonalityAdjustment > 0) {
      adjustments.push({
        masterSku: result.masterSku,
        adjustment: 'Seasonality',
        units: Math.round(result.seasonalityAdjustment),
      })
    }
    if (result.supplierReliabilityAdjustment > 0) {
      adjustments.push({
        masterSku: result.masterSku,
        adjustment: 'Supplier reliability',
        units: Math.round(result.supplierReliabilityAdjustment),
      })
    }
  }

  adjustments.sort((a, b) => b.units - a.units)

  return {
    totalSkus: results.length,
    avgSafetyStockDays: results.length > 0 ? totalDays / results.length : 0,
    byImportance: {
      best_seller: {
        count: byImportance.best_seller.count,
        avgDays:
          byImportance.best_seller.count > 0
            ? byImportance.best_seller.totalDays / byImportance.best_seller.count
            : 0,
      },
      regular: {
        count: byImportance.regular.count,
        avgDays:
          byImportance.regular.count > 0
            ? byImportance.regular.totalDays / byImportance.regular.count
            : 0,
      },
      slow_mover: {
        count: byImportance.slow_mover.count,
        avgDays:
          byImportance.slow_mover.count > 0
            ? byImportance.slow_mover.totalDays / byImportance.slow_mover.count
            : 0,
      },
    },
    topAdjustments: adjustments.slice(0, 10),
  }
}
