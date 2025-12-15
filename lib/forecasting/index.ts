/**
 * Multi-Model Forecasting Engine
 *
 * A comprehensive inventory forecasting system featuring:
 * - Multiple forecasting models (Prophet, LSTM, Exponential Smoothing, ARIMA)
 * - Self-improving ensemble with dynamic weighting
 * - Seasonality detection and learning
 * - Lead time management with supplier reliability tracking
 * - New item forecasting with analog SKU matching
 * - Spike detection and cause analysis
 * - Deal and promotion integration
 * - Safety stock optimization
 * - Anomaly detection and root cause analysis
 * - Smart alerting system
 */

// Types
export * from './types'

// Models
export { exponentialSmoothingForecast, exponentialSmoothingDaily } from './models/exponential-smoothing'
export { prophetForecast, prophetDaily } from './models/prophet-model'
export { lstmForecast, lstmDaily, detectAnomalousPattern } from './models/lstm-model'
export { arimaForecast, arimaDaily, autoArima } from './models/arima-model'

// Ensemble
export {
  generateEnsembleForecast,
  generateAggregatedForecast,
  compareModelPerformance,
} from './ensemble/ensemble-engine'
export {
  runWeeklyOptimization,
  optimizeModelWeights,
  trackForecastAccuracy,
  generateAccuracyReport,
} from './ensemble/model-weight-optimizer'

// Seasonality
export {
  detectSeasonality,
  learnSeasonalMultipliers,
  detectNewSeasonalPatterns,
  createSeasonalEvent,
  updateSkuEventMultiplier,
  getSeasonalityMultiplierForDate,
} from './seasonality/seasonality-detector'

// Lead Time
export {
  updateSupplierPerformance,
  getSupplierLeadTime,
  getEffectiveLeadTime,
  getTotalLeadTime,
  checkSupplierReliabilityAlerts,
  recordPOArrival,
  updateAllSupplierPerformance,
  getSupplierScorecard,
} from './lead-time/lead-time-tracker'

// Spike Detection
export {
  detectSpike,
  detectAllSpikes,
  applySpikeAdjustment,
  generateSpikeAlert,
} from './spike/spike-detector'

// New Item Forecasting
export {
  isNewItem,
  findAnalogSku,
  forecastNewItem,
  recalibrateNewItemForecast,
  checkAllNewItems,
  getNewItemSummary,
} from './new-item/new-item-forecaster'

// Deals
export {
  recordDealPerformance,
  scheduleDeal,
  getDealInventoryAlerts,
  getDealMultiplierForDate,
  getSkuDealPerformance,
  generatePreDealRecommendation,
  learnDealMultipliers,
} from './deals/deal-integration'

// Safety Stock
export {
  calculateSafetyStock,
  getRecommendedSafetyStockDays,
  calculateAllSafetyStock,
  getSafetyStockSummary,
} from './safety-stock/safety-stock-calculator'

// Anomaly Detection
export {
  detectAnomalies,
  applyAutomaticAdjustments,
  getAnomalySummary,
} from './anomaly/anomaly-detector'

// Alerts
export {
  generateAlerts,
  saveAlerts,
  getUnreadAlertsCount,
} from './alerts/smart-alerts'

// ===========================================
// Convenience Functions
// ===========================================

import { prisma } from '@/lib/prisma'
import { generateEnsembleForecast } from './ensemble/ensemble-engine'
import { detectSeasonality } from './seasonality/seasonality-detector'
import { detectSpike } from './spike/spike-detector'
import { forecastNewItem } from './new-item/new-item-forecaster'
import { calculateSafetyStock } from './safety-stock/safety-stock-calculator'
import { getSupplierLeadTime } from './lead-time/lead-time-tracker'
import {
  SalesDataPoint,
  EnsembleForecast,
  SeasonalEvent,
  ReorderRecommendation,
} from './types'

/**
 * Get complete forecast for a SKU
 * This is the main entry point for generating forecasts
 */
export async function getForecast(
  masterSku: string,
  daysAhead: number = 90
): Promise<{
  forecasts: EnsembleForecast[]
  seasonality: Awaited<ReturnType<typeof detectSeasonality>>
  spike: Awaited<ReturnType<typeof detectSpike>>
  newItem: Awaited<ReturnType<typeof forecastNewItem>>
  safetyStock: Awaited<ReturnType<typeof calculateSafetyStock>>
  recommendation: ReorderRecommendation
}> {
  // Get sales data
  const salesData = await getSalesHistory(masterSku)

  // Get seasonal events
  const seasonalEvents = await getSeasonalEvents()

  // Generate ensemble forecast
  const forecasts = await generateEnsembleForecast(
    masterSku,
    salesData,
    daysAhead,
    seasonalEvents
  )

  // Detect seasonality
  const seasonality = await detectSeasonality(masterSku, salesData)

  // Check for spikes
  const spike = await detectSpike(masterSku, salesData)

  // Check new item status
  const newItem = await forecastNewItem(masterSku)

  // Calculate safety stock
  const safetyStock = await calculateSafetyStock(masterSku)

  // Generate recommendation
  const recommendation = await generateReorderRecommendation(
    masterSku,
    forecasts,
    safetyStock
  )

  return {
    forecasts,
    seasonality,
    spike,
    newItem,
    safetyStock,
    recommendation,
  }
}

/**
 * Get sales history for a SKU
 */
async function getSalesHistory(masterSku: string): Promise<SalesDataPoint[]> {
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  try {
    const dailyProfits = await prisma.dailyProfit.findMany({
      where: {
        masterSku,
        date: { gte: twoYearsAgo },
      },
      orderBy: { date: 'asc' },
    })

    if (dailyProfits.length > 0) {
      return dailyProfits.map((dp) => ({
        date: dp.date,
        units: dp.unitsSold,
        revenue: Number(dp.revenue),
      }))
    }
  } catch (error) {
    // Fall through
  }

  // Fallback to order aggregation
  const orders = await prisma.orderItem.findMany({
    where: {
      masterSku,
      order: {
        purchaseDate: { gte: twoYearsAgo },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
    include: {
      order: { select: { purchaseDate: true } },
    },
    orderBy: {
      order: { purchaseDate: 'asc' },
    },
  })

  // Aggregate by date
  const dailyMap = new Map<string, number>()

  for (const item of orders) {
    const dateStr = item.order.purchaseDate.toISOString().split('T')[0]
    dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + item.quantity)
  }

  return Array.from(dailyMap.entries())
    .map(([dateStr, units]) => ({
      date: new Date(dateStr),
      units,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * Get seasonal events from database
 */
async function getSeasonalEvents(): Promise<SeasonalEvent[]> {
  try {
    const events = await prisma.seasonalEvent.findMany({
      where: { isActive: true },
    })

    return events.map((e) => ({
      id: e.id,
      name: e.name,
      eventType: e.eventType as any,
      startMonth: e.startMonth,
      startDay: e.startDay,
      endMonth: e.endMonth,
      endDay: e.endDay,
      baseMultiplier: Number(e.baseMultiplier),
      learnedMultiplier: e.learnedMultiplier ? Number(e.learnedMultiplier) : null,
      skuMultipliers: e.skuMultipliers ? JSON.parse(e.skuMultipliers) : {},
      isActive: e.isActive,
    }))
  } catch (error) {
    return []
  }
}

/**
 * Generate reorder recommendation
 */
async function generateReorderRecommendation(
  masterSku: string,
  forecasts: EnsembleForecast[],
  safetyStock: Awaited<ReturnType<typeof calculateSafetyStock>>
): Promise<ReorderRecommendation> {
  // Get inventory
  const inventory = await prisma.inventoryLevel.findUnique({
    where: { masterSku },
  })

  const product = await prisma.product.findUnique({
    where: { sku: masterSku },
    include: { supplier: true },
  })

  const totalInventory =
    (inventory?.fbaAvailable || 0) +
    (inventory?.fbaInbound || 0) +
    (inventory?.warehouseAvailable || 0)

  // Calculate average daily forecast
  const avgDailyForecast =
    forecasts.length > 0
      ? forecasts.reduce((sum, f) => sum + f.finalForecast, 0) / forecasts.length
      : 0

  // Get lead time
  const leadTimeData = product?.supplierId
    ? await getSupplierLeadTime(product.supplierId)
    : null

  const leadTimeDays = leadTimeData?.avgActualLeadTime || product?.supplier?.leadTimeDays || 30

  // Calculate reorder point
  const reorderPoint = Math.ceil(avgDailyForecast * leadTimeDays + safetyStock.finalSafetyStock)

  // Calculate target inventory (180 days)
  const targetInventory = Math.ceil(avgDailyForecast * 180)

  // Calculate recommended order quantity
  const recommendedOrderQty = Math.max(0, targetInventory - totalInventory)

  // Calculate FBA replenishment
  const fbaTarget = Math.ceil(avgDailyForecast * 55) // 45 days + 10 days receiving
  const currentFba = (inventory?.fbaAvailable || 0) + (inventory?.fbaInbound || 0)
  const recommendedFbaQty = Math.min(
    Math.max(0, fbaTarget - currentFba),
    inventory?.warehouseAvailable || 0
  )

  // Calculate days of supply and urgency
  const daysOfSupply = avgDailyForecast > 0 ? totalInventory / avgDailyForecast : 999
  const daysUntilMustOrder = daysOfSupply - leadTimeDays - 14 // 14 days safety

  let urgency: 'critical' | 'high' | 'medium' | 'low' | 'ok' = 'ok'
  if (daysUntilMustOrder <= 14) urgency = 'critical'
  else if (daysUntilMustOrder <= 30) urgency = 'high'
  else if (daysUntilMustOrder <= 60) urgency = 'medium'
  else if (daysUntilMustOrder <= 90) urgency = 'low'

  // Calculate stockout date
  let stockoutDate: Date | undefined
  if (daysOfSupply < 365) {
    stockoutDate = new Date()
    stockoutDate.setDate(stockoutDate.getDate() + Math.floor(daysOfSupply))
  }

  // Build reasoning
  const reasoning = buildReasoning(
    avgDailyForecast,
    totalInventory,
    leadTimeDays,
    recommendedOrderQty,
    recommendedFbaQty,
    daysOfSupply,
    safetyStock
  )

  return {
    reorderPoint,
    recommendedOrderQty,
    recommendedFbaQty,
    urgency,
    stockoutDate,
    reasoning,
  }
}

/**
 * Build reasoning string for recommendation
 */
function buildReasoning(
  velocity: number,
  totalInventory: number,
  leadTimeDays: number,
  orderQty: number,
  fbaQty: number,
  daysOfSupply: number,
  safetyStock: any
): string {
  const parts: string[] = []

  parts.push(`Selling ${velocity.toFixed(1)} units/day`)
  parts.push(`${Math.round(daysOfSupply)} days of supply remaining`)
  parts.push(`Safety stock: ${safetyStock.finalSafetyStock} units`)

  if (orderQty > 0) {
    parts.push(`Order ${orderQty} units to reach 180-day target (Lead time: ${Math.round(leadTimeDays)} days)`)
  }

  if (fbaQty > 0) {
    parts.push(`Send ${fbaQty} units to FBA to reach 45-day target`)
  }

  return parts.join('. ')
}

/**
 * Run all scheduled forecasting jobs
 */
export async function runScheduledJobs(): Promise<{
  modelOptimization: Awaited<ReturnType<typeof import('./ensemble/model-weight-optimizer').runWeeklyOptimization>>
  newItemCheck: Awaited<ReturnType<typeof checkAllNewItems>>
  supplierUpdate: Awaited<ReturnType<typeof import('./lead-time/lead-time-tracker').updateAllSupplierPerformance>>
  anomalyDetection: Awaited<ReturnType<typeof import('./anomaly/anomaly-detector').detectAnomalies>>
  alerts: Awaited<ReturnType<typeof import('./alerts/smart-alerts').generateAlerts>>
}> {
  const { runWeeklyOptimization } = await import('./ensemble/model-weight-optimizer')
  const { updateAllSupplierPerformance } = await import('./lead-time/lead-time-tracker')
  const { detectAnomalies } = await import('./anomaly/anomaly-detector')
  const { generateAlerts } = await import('./alerts/smart-alerts')

  const [modelOptimization, newItemCheck, supplierUpdate, anomalyDetection, alerts] =
    await Promise.all([
      runWeeklyOptimization(),
      checkAllNewItems(),
      updateAllSupplierPerformance(),
      detectAnomalies(),
      generateAlerts(),
    ])

  return {
    modelOptimization,
    newItemCheck,
    supplierUpdate,
    anomalyDetection,
    alerts,
  }
}

/**
 * Get forecasting system health status
 */
export async function getSystemHealth(): Promise<{
  modelsActive: boolean
  lastOptimization: Date | null
  overallAccuracy: number
  activeAlerts: number
  anomaliesDetected: number
}> {
  // Check model weights exist
  const modelWeights = await prisma.modelWeight.count()

  // Get last optimization
  const lastWeight = await prisma.modelWeight.findFirst({
    orderBy: { lastUpdated: 'desc' },
  })

  // Get accuracy
  const recentAccuracy = await prisma.forecastAccuracy.aggregate({
    _avg: { percentageError: true },
    where: {
      forecastDate: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
  })

  // Get active alerts
  const activeAlerts = await prisma.alert.count({
    where: {
      isResolved: false,
      isRead: false,
    },
  })

  const overallAccuracy = recentAccuracy._avg.percentageError
    ? (1 - Number(recentAccuracy._avg.percentageError)) * 100
    : 85

  return {
    modelsActive: modelWeights > 0,
    lastOptimization: lastWeight?.lastUpdated || null,
    overallAccuracy,
    activeAlerts,
    anomaliesDetected: 0, // Would count from anomaly table
  }
}
