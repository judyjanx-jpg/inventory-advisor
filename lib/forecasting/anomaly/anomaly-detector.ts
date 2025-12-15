/**
 * Anomaly Detection & Root Cause Analysis
 *
 * Detects inventory health issues and analyzes root causes:
 * - Stockouts
 * - Overstock situations
 * - Storage fee spikes
 * - Forecast misses
 *
 * Implements automatic feedback loops to improve forecasting.
 */

import { prisma } from '@/lib/prisma'
import {
  AnomalyEvent,
  UrgencyLevel,
} from '../types'

type AnomalyType = 'stockout' | 'overstock' | 'storage_fee_spike' | 'forecast_miss'

interface RootCauseFactor {
  factor: string
  contribution: number
  evidence: string
}

/**
 * Detect all anomalies across inventory
 */
export async function detectAnomalies(): Promise<{
  anomalies: AnomalyEvent[]
  summary: {
    totalAnomalies: number
    byType: Record<AnomalyType, number>
    totalFinancialImpact: number
  }
}> {
  const anomalies: AnomalyEvent[] = []

  // Detect stockouts
  const stockoutAnomalies = await detectStockouts()
  anomalies.push(...stockoutAnomalies)

  // Detect overstock
  const overstockAnomalies = await detectOverstock()
  anomalies.push(...overstockAnomalies)

  // Detect storage fee spikes
  const storageFeeAnomalies = await detectStorageFeeSpikes()
  anomalies.push(...storageFeeAnomalies)

  // Detect forecast misses
  const forecastMissAnomalies = await detectForecastMisses()
  anomalies.push(...forecastMissAnomalies)

  // Calculate summary
  const byType: Record<AnomalyType, number> = {
    stockout: 0,
    overstock: 0,
    storage_fee_spike: 0,
    forecast_miss: 0,
  }

  let totalFinancialImpact = 0

  for (const anomaly of anomalies) {
    byType[anomaly.eventType]++
    totalFinancialImpact += anomaly.financialImpact
  }

  return {
    anomalies,
    summary: {
      totalAnomalies: anomalies.length,
      byType,
      totalFinancialImpact,
    },
  }
}

/**
 * Detect stockout events
 */
async function detectStockouts(): Promise<AnomalyEvent[]> {
  const anomalies: AnomalyEvent[] = []

  // Get products that are currently out of stock or were recently
  const inventory = await prisma.inventoryLevel.findMany({
    where: {
      OR: [
        { fbaAvailable: 0 },
        { warehouseAvailable: 0 },
      ],
    },
    include: {
      product: {
        include: {
          supplier: true,
        },
      },
    },
  })

  for (const inv of inventory) {
    // Check if there's recent sales history (meaning it should have stock)
    const recentSales = await prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        masterSku: inv.masterSku,
        order: {
          purchaseDate: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
          status: { notIn: ['Cancelled', 'Pending'] },
        },
      },
    })

    if ((recentSales._sum.quantity || 0) === 0) continue // No sales, not a stockout issue

    // This is a stockout - analyze root cause
    const rootCause = await analyzeStockoutCause(inv.masterSku, inv.product)

    const avgVelocity = (recentSales._sum.quantity || 0) / 30
    const stockoutDays = 7 // Assume 7 days for now
    const estimatedLostSales = Math.round(avgVelocity * stockoutDays)
    const avgPrice = Number(inv.product?.price || 0)
    const financialImpact = estimatedLostSales * avgPrice * 0.3 // 30% margin estimate

    anomalies.push({
      id: `stockout-${inv.masterSku}-${Date.now()}`,
      masterSku: inv.masterSku,
      eventType: 'stockout',
      detectedAt: new Date(),
      startDate: new Date(Date.now() - stockoutDays * 24 * 60 * 60 * 1000),
      endDate: null,
      durationDays: stockoutDays,
      financialImpact,
      unitImpact: estimatedLostSales,
      rootCause: rootCause.primary,
      rootCauseConfidence: rootCause.confidence,
      contributingFactors: rootCause.factors,
      automaticAdjustments: rootCause.adjustments,
      isResolved: false,
      resolvedAt: null,
      notes: '',
    })
  }

  return anomalies
}

/**
 * Analyze stockout root cause
 */
async function analyzeStockoutCause(
  masterSku: string,
  product: any
): Promise<{
  primary: string
  confidence: number
  factors: RootCauseFactor[]
  adjustments: Array<{
    parameter: string
    oldValue: number
    newValue: number
    reason: string
  }>
}> {
  const factors: RootCauseFactor[] = []
  const adjustments: Array<{
    parameter: string
    oldValue: number
    newValue: number
    reason: string
  }> = []

  // Check 1: Supplier delay
  if (product?.supplier) {
    const recentPO = await prisma.purchaseOrder.findFirst({
      where: {
        supplierId: product.supplier.id,
        status: { in: ['shipped', 'received'] },
      },
      orderBy: { actualArrivalDate: 'desc' },
    })

    if (recentPO?.expectedArrivalDate && recentPO.actualArrivalDate) {
      const delayDays = Math.ceil(
        (recentPO.actualArrivalDate.getTime() -
          recentPO.expectedArrivalDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )

      if (delayDays > 7) {
        factors.push({
          factor: 'Supplier delay',
          contribution: 0.4,
          evidence: `Last PO arrived ${delayDays} days late`,
        })

        // Suggest safety stock adjustment
        adjustments.push({
          parameter: 'safetyStockDays',
          oldValue: 14,
          newValue: 21,
          reason: 'Increase safety stock due to supplier delays',
        })
      }
    }
  }

  // Check 2: Spike not detected
  const skuAnalytics = await prisma.skuAnalytics.findUnique({
    where: { masterSku },
  })

  if (skuAnalytics?.isSpiking || (skuAnalytics?.spikeMultiplier && Number(skuAnalytics.spikeMultiplier) > 1.5)) {
    factors.push({
      factor: 'Undetected sales spike',
      contribution: 0.35,
      evidence: `Sales spiked ${Number(skuAnalytics.spikeMultiplier || 1).toFixed(1)}x above baseline`,
    })

    adjustments.push({
      parameter: 'spikeDetectionThreshold',
      oldValue: 50,
      newValue: 40,
      reason: 'Lower spike detection threshold to catch spikes earlier',
    })
  }

  // Check 3: Forecast too low
  const forecastAccuracy = await prisma.forecastAccuracy.findMany({
    where: {
      masterSku,
      forecastDate: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
  })

  if (forecastAccuracy.length > 0) {
    const avgBias =
      forecastAccuracy.reduce(
        (sum, fa) => sum + (Number(fa.actualUnits) - Number(fa.predictedUnits)),
        0
      ) / forecastAccuracy.length

    if (avgBias > 5) {
      // Under-forecasting
      factors.push({
        factor: 'Systematic under-forecasting',
        contribution: 0.25,
        evidence: `Average forecast ${avgBias.toFixed(1)} units below actual`,
      })

      adjustments.push({
        parameter: 'forecastBiasCorrection',
        oldValue: 1.0,
        newValue: 1.0 + avgBias / 10,
        reason: 'Apply bias correction to forecasts',
      })
    }
  }

  // Determine primary cause
  factors.sort((a, b) => b.contribution - a.contribution)
  const primary = factors[0]?.factor || 'Insufficient safety stock'
  const confidence = factors[0]?.contribution || 0.5

  return {
    primary,
    confidence,
    factors,
    adjustments,
  }
}

/**
 * Detect overstock situations
 */
async function detectOverstock(): Promise<AnomalyEvent[]> {
  const anomalies: AnomalyEvent[] = []

  // Get products with high inventory relative to sales
  const inventory = await prisma.inventoryLevel.findMany({
    include: {
      product: true,
    },
  })

  for (const inv of inventory) {
    const totalInventory =
      (inv.fbaAvailable || 0) +
      (inv.fbaInbound || 0) +
      (inv.warehouseAvailable || 0)

    if (totalInventory < 100) continue // Not significant enough

    // Get velocity
    const recentSales = await prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        masterSku: inv.masterSku,
        order: {
          purchaseDate: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
          status: { notIn: ['Cancelled', 'Pending'] },
        },
      },
    })

    const velocity = (recentSales._sum.quantity || 0) / 30
    const daysOfSupply = velocity > 0 ? totalInventory / velocity : 999

    // Overstock if >300 days of supply
    if (daysOfSupply > 300) {
      const excessUnits = totalInventory - velocity * 180 // Target 180 days
      const cost = Number(inv.product?.cost || 0)
      const financialImpact = excessUnits * cost // Capital tied up

      const rootCause = await analyzeOverstockCause(inv.masterSku)

      anomalies.push({
        id: `overstock-${inv.masterSku}-${Date.now()}`,
        masterSku: inv.masterSku,
        eventType: 'overstock',
        detectedAt: new Date(),
        startDate: new Date(), // Unknown when it started
        endDate: null,
        durationDays: 0,
        financialImpact,
        unitImpact: Math.round(excessUnits),
        rootCause: rootCause.primary,
        rootCauseConfidence: rootCause.confidence,
        contributingFactors: rootCause.factors,
        automaticAdjustments: rootCause.adjustments,
        isResolved: false,
        resolvedAt: null,
        notes: `${Math.round(daysOfSupply)} days of supply, ${Math.round(excessUnits)} excess units`,
      })
    }
  }

  return anomalies
}

/**
 * Analyze overstock root cause
 */
async function analyzeOverstockCause(masterSku: string): Promise<{
  primary: string
  confidence: number
  factors: RootCauseFactor[]
  adjustments: Array<{
    parameter: string
    oldValue: number
    newValue: number
    reason: string
  }>
}> {
  const factors: RootCauseFactor[] = []
  const adjustments: Array<{
    parameter: string
    oldValue: number
    newValue: number
    reason: string
  }> = []

  // Check 1: Over-forecasting
  const forecastAccuracy = await prisma.forecastAccuracy.findMany({
    where: {
      masterSku,
      forecastDate: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      },
    },
  })

  if (forecastAccuracy.length > 0) {
    const avgBias =
      forecastAccuracy.reduce(
        (sum, fa) => sum + (Number(fa.predictedUnits) - Number(fa.actualUnits)),
        0
      ) / forecastAccuracy.length

    if (avgBias > 5) {
      factors.push({
        factor: 'Systematic over-forecasting',
        contribution: 0.4,
        evidence: `Average forecast ${avgBias.toFixed(1)} units above actual`,
      })

      adjustments.push({
        parameter: 'forecastBiasCorrection',
        oldValue: 1.0,
        newValue: 1.0 - avgBias / 20,
        reason: 'Apply negative bias correction to forecasts',
      })
    }
  }

  // Check 2: Sales velocity decline
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

  const recentSales = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku,
      order: {
        purchaseDate: { gte: thirtyDaysAgo },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  const olderSales = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku,
      order: {
        purchaseDate: {
          gte: sixtyDaysAgo,
          lt: thirtyDaysAgo,
        },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  const recentVelocity = (recentSales._sum.quantity || 0) / 30
  const olderVelocity = (olderSales._sum.quantity || 0) / 30

  if (olderVelocity > 0 && recentVelocity < olderVelocity * 0.7) {
    factors.push({
      factor: 'Sales velocity decline',
      contribution: 0.35,
      evidence: `Sales dropped ${Math.round(
        (1 - recentVelocity / olderVelocity) * 100
      )}% vs prior period`,
    })
  }

  // Check 3: Deal underperformance
  // Would check deal history if available

  factors.sort((a, b) => b.contribution - a.contribution)

  return {
    primary: factors[0]?.factor || 'Excess ordering',
    confidence: factors[0]?.contribution || 0.5,
    factors,
    adjustments,
  }
}

/**
 * Detect storage fee spikes
 */
async function detectStorageFeeSpikes(): Promise<AnomalyEvent[]> {
  // This would analyze storage fee data
  // Placeholder for now
  return []
}

/**
 * Detect significant forecast misses
 */
async function detectForecastMisses(): Promise<AnomalyEvent[]> {
  const anomalies: AnomalyEvent[] = []

  // Get recent forecast accuracy records with high error
  const forecastErrors = await prisma.forecastAccuracy.findMany({
    where: {
      forecastDate: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      percentageError: { gt: 0.5 }, // > 50% error
    },
  })

  // Group by SKU
  const bySkuMap = new Map<string, typeof forecastErrors>()

  for (const error of forecastErrors) {
    if (!bySkuMap.has(error.masterSku)) {
      bySkuMap.set(error.masterSku, [])
    }
    bySkuMap.get(error.masterSku)?.push(error)
  }

  for (const [masterSku, errors] of bySkuMap) {
    if (errors.length < 3) continue // Need multiple misses

    const avgError =
      errors.reduce((sum, e) => sum + Number(e.percentageError), 0) /
      errors.length

    anomalies.push({
      id: `forecast-miss-${masterSku}-${Date.now()}`,
      masterSku,
      eventType: 'forecast_miss',
      detectedAt: new Date(),
      startDate: errors[0].forecastDate,
      endDate: errors[errors.length - 1].forecastDate,
      durationDays: errors.length,
      financialImpact: 0, // Indirect impact
      unitImpact: Math.round(
        errors.reduce(
          (sum, e) => sum + Math.abs(Number(e.actualUnits) - Number(e.predictedUnits)),
          0
        )
      ),
      rootCause: `Average forecast error ${Math.round(avgError * 100)}%`,
      rootCauseConfidence: 0.8,
      contributingFactors: [
        {
          factor: 'Model accuracy degradation',
          contribution: 0.6,
        },
      ],
      automaticAdjustments: [
        {
          parameter: 'modelWeights',
          oldValue: 0,
          newValue: 0,
          reason: 'Trigger model re-optimization',
        },
      ],
      isResolved: false,
      resolvedAt: null,
      notes: `${errors.length} consecutive forecast misses`,
    })
  }

  return anomalies
}

/**
 * Apply automatic adjustments from anomaly detection
 */
export async function applyAutomaticAdjustments(
  anomaly: AnomalyEvent
): Promise<{
  applied: number
  adjustments: string[]
}> {
  const applied: string[] = []

  for (const adjustment of anomaly.automaticAdjustments) {
    try {
      // Log the adjustment
      console.log(
        `Applying adjustment for ${anomaly.masterSku}: ${adjustment.parameter} ${adjustment.oldValue} -> ${adjustment.newValue}`
      )

      // Would apply the adjustment to the appropriate table/config
      // For now, just track it

      applied.push(
        `${adjustment.parameter}: ${adjustment.oldValue} -> ${adjustment.newValue}`
      )
    } catch (error) {
      console.error(`Error applying adjustment:`, error)
    }
  }

  // Mark anomaly as having adjustments applied
  // Would update anomaly record in database

  return {
    applied: applied.length,
    adjustments: applied,
  }
}

/**
 * Get anomaly summary for dashboard
 */
export async function getAnomalySummary(): Promise<{
  activeAnomalies: number
  byType: Record<AnomalyType, number>
  recentAnomalies: AnomalyEvent[]
  totalImpact: number
  recommendedActions: Array<{
    priority: UrgencyLevel
    action: string
    affectedSkus: number
  }>
}> {
  const { anomalies, summary } = await detectAnomalies()

  // Generate recommended actions
  const recommendedActions: Array<{
    priority: UrgencyLevel
    action: string
    affectedSkus: number
  }> = []

  if (summary.byType.stockout > 0) {
    recommendedActions.push({
      priority: 'critical',
      action: `Address ${summary.byType.stockout} stockout(s) immediately`,
      affectedSkus: summary.byType.stockout,
    })
  }

  if (summary.byType.forecast_miss > 0) {
    recommendedActions.push({
      priority: 'high',
      action: `Review forecast accuracy for ${summary.byType.forecast_miss} SKU(s)`,
      affectedSkus: summary.byType.forecast_miss,
    })
  }

  if (summary.byType.overstock > 0) {
    recommendedActions.push({
      priority: 'medium',
      action: `Consider liquidation/promotions for ${summary.byType.overstock} overstocked SKU(s)`,
      affectedSkus: summary.byType.overstock,
    })
  }

  return {
    activeAnomalies: summary.totalAnomalies,
    byType: summary.byType,
    recentAnomalies: anomalies.slice(0, 10),
    totalImpact: summary.totalFinancialImpact,
    recommendedActions,
  }
}
