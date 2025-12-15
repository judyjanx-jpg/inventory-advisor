/**
 * Smart Alerting System
 *
 * Intelligent alerts with context and actionable recommendations.
 * Implements alert suppression, batching, and urgency levels.
 */

import { prisma } from '@/lib/prisma'
import {
  ForecastAlert,
  AlertSeverity,
  UrgencyLevel,
} from '../types'
import { detectAllSpikes } from '../spike/spike-detector'
import { checkSupplierReliabilityAlerts } from '../lead-time/lead-time-tracker'
import { checkAllNewItems } from '../new-item/new-item-forecaster'
import { getAnomalySummary } from '../anomaly/anomaly-detector'

interface AlertConfig {
  suppressDuplicateHours: number
  batchSimilarAlerts: boolean
  maxAlertsPerBatch: number
}

const DEFAULT_CONFIG: AlertConfig = {
  suppressDuplicateHours: 24,
  batchSimilarAlerts: true,
  maxAlertsPerBatch: 10,
}

/**
 * Generate all system alerts
 */
export async function generateAlerts(
  config: Partial<AlertConfig> = {}
): Promise<{
  alerts: ForecastAlert[]
  summary: {
    total: number
    bySeverity: Record<AlertSeverity, number>
    byType: Record<string, number>
  }
}> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }
  const allAlerts: ForecastAlert[] = []

  // 1. Stockout alerts
  const stockoutAlerts = await generateStockoutAlerts()
  allAlerts.push(...stockoutAlerts)

  // 2. Seasonal preparation alerts
  const seasonalAlerts = await generateSeasonalAlerts()
  allAlerts.push(...seasonalAlerts)

  // 3. Spike detection alerts
  const spikeAlerts = await generateSpikeAlerts()
  allAlerts.push(...spikeAlerts)

  // 4. Forecast accuracy alerts
  const accuracyAlerts = await generateAccuracyAlerts()
  allAlerts.push(...accuracyAlerts)

  // 5. Supplier reliability alerts
  const supplierAlerts = await generateSupplierAlerts()
  allAlerts.push(...supplierAlerts)

  // 6. New item deviation alerts
  const newItemAlerts = await generateNewItemAlerts()
  allAlerts.push(...newItemAlerts)

  // 7. Goal optimization alerts
  const goalAlerts = await generateGoalOptimizationAlerts()
  allAlerts.push(...goalAlerts)

  // Filter duplicates
  const filteredAlerts = await filterDuplicateAlerts(
    allAlerts,
    fullConfig.suppressDuplicateHours
  )

  // Batch similar alerts if configured
  const finalAlerts = fullConfig.batchSimilarAlerts
    ? batchSimilarAlerts(filteredAlerts, fullConfig.maxAlertsPerBatch)
    : filteredAlerts

  // Sort by urgency and severity
  finalAlerts.sort((a, b) => {
    const urgencyOrder: Record<UrgencyLevel, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      ok: 4,
    }
    const severityOrder: Record<AlertSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    }

    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    if (urgencyDiff !== 0) return urgencyDiff

    return severityOrder[a.severity] - severityOrder[b.severity]
  })

  // Calculate summary
  const bySeverity: Record<AlertSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  }

  const byType: Record<string, number> = {}

  for (const alert of finalAlerts) {
    bySeverity[alert.severity]++
    byType[alert.alertType] = (byType[alert.alertType] || 0) + 1
  }

  return {
    alerts: finalAlerts,
    summary: {
      total: finalAlerts.length,
      bySeverity,
      byType,
    },
  }
}

/**
 * Generate stockout alerts
 */
async function generateStockoutAlerts(): Promise<ForecastAlert[]> {
  const alerts: ForecastAlert[] = []

  // Get inventory with velocity
  const inventory = await prisma.inventoryLevel.findMany({
    include: {
      product: {
        include: {
          supplier: true,
          salesVelocity: true,
        },
      },
    },
  })

  for (const inv of inventory) {
    const totalInventory =
      (inv.fbaAvailable || 0) + (inv.fbaInbound || 0) + (inv.warehouseAvailable || 0)

    const velocity = inv.product?.salesVelocity
      ? Number(inv.product.salesVelocity.velocity30d)
      : 0

    if (velocity <= 0) continue

    const daysOfSupply = totalInventory / velocity
    const leadTime = inv.product?.supplier?.leadTimeDays || 30

    // Critical: Will stockout before reorder arrives
    if (daysOfSupply <= leadTime) {
      const stockoutDate = new Date()
      stockoutDate.setDate(stockoutDate.getDate() + Math.floor(daysOfSupply))

      alerts.push({
        id: `stockout-${inv.masterSku}-${Date.now()}`,
        masterSku: inv.masterSku,
        alertType: 'stockout_imminent',
        severity: daysOfSupply <= 10 ? 'critical' : 'high',
        urgency: daysOfSupply <= 10 ? 'critical' : 'high',
        title: `Stockout Risk: ${inv.masterSku}`,
        message: `SKU ${inv.masterSku} will stockout in ${Math.round(
          daysOfSupply
        )} days. Supplier lead time is ${leadTime} days. ORDER NOW.`,
        context: {
          currentInventory: totalInventory,
          velocity,
          daysOfSupply: Math.round(daysOfSupply),
          leadTime,
          stockoutDate: stockoutDate.toISOString(),
        },
        recommendedAction: `Order immediately - minimum ${Math.ceil(
          velocity * (leadTime + 45)
        )} units to reach 45-day target after restock`,
        actionDeadline: new Date(), // Now!
        isRead: false,
        isResolved: false,
        isDismissed: false,
        createdAt: new Date(),
      })
    }
  }

  return alerts
}

/**
 * Generate seasonal preparation alerts
 */
async function generateSeasonalAlerts(): Promise<ForecastAlert[]> {
  const alerts: ForecastAlert[] = []

  const events = await prisma.seasonalEvent.findMany({
    where: { isActive: true },
  })

  const today = new Date()
  const todayMonth = today.getMonth() + 1
  const todayDay = today.getDate()

  for (const event of events) {
    // Calculate days until event
    let eventDate = new Date(
      today.getFullYear(),
      event.startMonth - 1,
      event.startDay
    )

    if (eventDate < today) {
      eventDate = new Date(
        today.getFullYear() + 1,
        event.startMonth - 1,
        event.startDay
      )
    }

    const daysUntil = Math.ceil(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Alert 30-60 days before major events
    const alertThreshold = event.eventType === 'major_peak' ? 60 : 30

    if (daysUntil <= alertThreshold && daysUntil > 0) {
      // Check inventory preparation status
      const unpreparedSkus = await checkSeasonalPreparation(
        event,
        Number(event.baseMultiplier)
      )

      if (unpreparedSkus.length > 0) {
        alerts.push({
          id: `seasonal-${event.id}-${Date.now()}`,
          masterSku: null,
          alertType: 'seasonal_prep',
          severity: daysUntil <= 14 ? 'high' : 'medium',
          urgency: daysUntil <= 14 ? 'high' : 'medium',
          title: `${event.name} in ${daysUntil} days`,
          message: `${event.name} starts in ${daysUntil} days. ${unpreparedSkus.length} SKU(s) need additional inventory.`,
          context: {
            eventName: event.name,
            daysUntil,
            multiplier: Number(event.baseMultiplier),
            unpreparedSkuCount: unpreparedSkus.length,
            unpreparedSkus: unpreparedSkus.slice(0, 5),
          },
          recommendedAction: `Review and order inventory for ${unpreparedSkus.length} SKUs to handle ${Number(event.baseMultiplier)}x demand`,
          actionDeadline: new Date(
            today.getTime() + Math.max(0, daysUntil - 14) * 24 * 60 * 60 * 1000
          ),
          isRead: false,
          isResolved: false,
          isDismissed: false,
          createdAt: new Date(),
        })
      }
    }
  }

  return alerts
}

/**
 * Check seasonal preparation status
 */
async function checkSeasonalPreparation(
  event: any,
  multiplier: number
): Promise<string[]> {
  const unprepared: string[] = []

  const inventory = await prisma.inventoryLevel.findMany({
    include: {
      product: {
        include: {
          salesVelocity: true,
        },
      },
    },
  })

  for (const inv of inventory) {
    const velocity = inv.product?.salesVelocity
      ? Number(inv.product.salesVelocity.velocity30d)
      : 0

    if (velocity <= 0) continue

    const totalInventory =
      (inv.fbaAvailable || 0) + (inv.fbaInbound || 0) + (inv.warehouseAvailable || 0)

    // Calculate needed inventory for event period (assume 30 days)
    const neededInventory = velocity * multiplier * 30 * 1.2 // 20% buffer

    if (totalInventory < neededInventory) {
      unprepared.push(inv.masterSku)
    }
  }

  return unprepared
}

/**
 * Generate spike detection alerts
 */
async function generateSpikeAlerts(): Promise<ForecastAlert[]> {
  const { spikingSkus, alerts: spikeAlerts } = await detectAllSpikes()

  return spikeAlerts.map((alert) => ({
    id: `spike-${alert.masterSku}-${Date.now()}`,
    masterSku: alert.masterSku,
    alertType: 'spike_detected',
    severity: alert.urgency === 'critical' ? 'critical' : 'high',
    urgency: alert.urgency,
    title: `Sales Spike: ${alert.masterSku}`,
    message: alert.message,
    context: {
      spikeInfo: spikingSkus.find((s) => s.masterSku === alert.masterSku),
    },
    recommendedAction: 'Increase forecast and consider expedited reorder',
    actionDeadline: null,
    isRead: false,
    isResolved: false,
    isDismissed: false,
    createdAt: new Date(),
  }))
}

/**
 * Generate forecast accuracy alerts
 */
async function generateAccuracyAlerts(): Promise<ForecastAlert[]> {
  const alerts: ForecastAlert[] = []

  // Get SKUs with poor recent accuracy
  const recentAccuracy = await prisma.forecastAccuracy.groupBy({
    by: ['masterSku'],
    _avg: { percentageError: true },
    where: {
      forecastDate: {
        gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      },
    },
    having: {
      percentageError: {
        _avg: { gt: 0.35 }, // > 35% MAPE
      },
    },
  })

  for (const record of recentAccuracy) {
    const mape = Number(record._avg.percentageError) * 100

    alerts.push({
      id: `accuracy-${record.masterSku}-${Date.now()}`,
      masterSku: record.masterSku,
      alertType: 'forecast_accuracy_low',
      severity: mape > 50 ? 'high' : 'medium',
      urgency: mape > 50 ? 'high' : 'medium',
      title: `Low Forecast Accuracy: ${record.masterSku}`,
      message: `Forecast accuracy for ${record.masterSku} dropped to ${(
        100 - mape
      ).toFixed(0)}%. Investigating cause.`,
      context: {
        mape: mape.toFixed(1),
        accuracy: (100 - mape).toFixed(1),
      },
      recommendedAction: 'Review recent sales patterns and adjust model weights',
      actionDeadline: null,
      isRead: false,
      isResolved: false,
      isDismissed: false,
      createdAt: new Date(),
    })
  }

  return alerts
}

/**
 * Generate supplier reliability alerts
 */
async function generateSupplierAlerts(): Promise<ForecastAlert[]> {
  const supplierAlerts = await checkSupplierReliabilityAlerts()

  return supplierAlerts.map((alert) => ({
    id: `supplier-${alert.supplierId}-${Date.now()}`,
    masterSku: null,
    alertType: 'supplier_reliability',
    severity: alert.severity,
    urgency: alert.severity === 'high' ? 'high' : 'medium',
    title: `Supplier Issue: ${alert.supplierName}`,
    message: alert.message,
    context: {
      supplierId: alert.supplierId,
      supplierName: alert.supplierName,
      alertType: alert.alertType,
      previousValue: alert.previousValue,
      currentValue: alert.currentValue,
    },
    recommendedAction: alert.recommendedAction,
    actionDeadline: null,
    isRead: false,
    isResolved: false,
    isDismissed: false,
    createdAt: new Date(),
  }))
}

/**
 * Generate new item deviation alerts
 */
async function generateNewItemAlerts(): Promise<ForecastAlert[]> {
  const alerts: ForecastAlert[] = []
  const { items } = await checkAllNewItems()

  for (const item of items) {
    if (item.action === 'recalibrated') {
      alerts.push({
        id: `new-item-${item.masterSku}-${Date.now()}`,
        masterSku: item.masterSku,
        alertType: 'new_item_deviation',
        severity: 'medium',
        urgency: 'medium',
        title: `New Item Recalibrated: ${item.masterSku}`,
        message: `New item ${item.masterSku} forecast recalibrated. ${item.details}`,
        context: {
          action: item.action,
          details: item.details,
        },
        recommendedAction: 'Review updated forecast and adjust inventory plans',
        actionDeadline: null,
        isRead: false,
        isResolved: false,
        isDismissed: false,
        createdAt: new Date(),
      })
    }
  }

  return alerts
}

/**
 * Generate goal optimization alerts
 */
async function generateGoalOptimizationAlerts(): Promise<ForecastAlert[]> {
  const alerts: ForecastAlert[] = []

  // Get business profile
  const profile = await prisma.businessProfile.findFirst()

  if (!profile) return alerts

  // Check if current targets are causing issues
  const anomalySummary = await getAnomalySummary()

  if (anomalySummary.byType.stockout > 2) {
    alerts.push({
      id: `goal-stockout-${Date.now()}`,
      masterSku: null,
      alertType: 'goal_adjustment',
      severity: 'medium',
      urgency: 'medium',
      title: 'Consider Adjusting Inventory Targets',
      message: `You're experiencing stockouts on ${anomalySummary.byType.stockout} SKUs. Consider increasing your total inventory target from ${profile.targetTotalDays} to ${profile.targetTotalDays + 10} days.`,
      context: {
        currentTarget: profile.targetTotalDays,
        recommendedTarget: profile.targetTotalDays + 10,
        stockoutCount: anomalySummary.byType.stockout,
      },
      recommendedAction: `Increase total inventory target to ${profile.targetTotalDays + 10} days for better coverage`,
      actionDeadline: null,
      isRead: false,
      isResolved: false,
      isDismissed: false,
      createdAt: new Date(),
    })
  }

  if (anomalySummary.byType.overstock > 3) {
    alerts.push({
      id: `goal-overstock-${Date.now()}`,
      masterSku: null,
      alertType: 'goal_adjustment',
      severity: 'low',
      urgency: 'low',
      title: 'Excess Inventory Detected',
      message: `${anomalySummary.byType.overstock} SKUs have excess inventory. You could reduce your target from ${profile.targetTotalDays} to ${profile.targetTotalDays - 15} days to free up cash.`,
      context: {
        currentTarget: profile.targetTotalDays,
        recommendedTarget: profile.targetTotalDays - 15,
        overstockCount: anomalySummary.byType.overstock,
        estimatedCashFreed: anomalySummary.totalImpact,
      },
      recommendedAction: `Consider reducing inventory target to ${profile.targetTotalDays - 15} days to optimize cash flow`,
      actionDeadline: null,
      isRead: false,
      isResolved: false,
      isDismissed: false,
      createdAt: new Date(),
    })
  }

  return alerts
}

/**
 * Filter duplicate alerts
 */
async function filterDuplicateAlerts(
  alerts: ForecastAlert[],
  suppressHours: number
): Promise<ForecastAlert[]> {
  const cutoff = new Date(Date.now() - suppressHours * 60 * 60 * 1000)

  // Get recent alerts from database
  const recentAlerts = await prisma.alert.findMany({
    where: {
      createdAt: { gte: cutoff },
    },
  })

  const recentKeys = new Set(
    recentAlerts.map((a) => `${a.alertType}-${a.masterSku || 'global'}`)
  )

  return alerts.filter((alert) => {
    const key = `${alert.alertType}-${alert.masterSku || 'global'}`
    return !recentKeys.has(key)
  })
}

/**
 * Batch similar alerts together
 */
function batchSimilarAlerts(
  alerts: ForecastAlert[],
  maxPerBatch: number
): ForecastAlert[] {
  const byType = new Map<string, ForecastAlert[]>()

  for (const alert of alerts) {
    if (!byType.has(alert.alertType)) {
      byType.set(alert.alertType, [])
    }
    byType.get(alert.alertType)?.push(alert)
  }

  const batched: ForecastAlert[] = []

  for (const [type, typeAlerts] of byType) {
    if (typeAlerts.length <= maxPerBatch) {
      batched.push(...typeAlerts)
    } else {
      // Create summary alert
      const topAlerts = typeAlerts.slice(0, maxPerBatch - 1)
      batched.push(...topAlerts)

      // Add summary for the rest
      const remaining = typeAlerts.length - (maxPerBatch - 1)
      batched.push({
        id: `batch-${type}-${Date.now()}`,
        masterSku: null,
        alertType: type as any,
        severity: typeAlerts[0].severity,
        urgency: typeAlerts[0].urgency,
        title: `${remaining} more ${type.replace('_', ' ')} alerts`,
        message: `${remaining} additional alerts of this type. Click to view all.`,
        context: {
          batchedCount: remaining,
          batchedSkus: typeAlerts.slice(maxPerBatch - 1).map((a) => a.masterSku),
        },
        recommendedAction: 'Review all alerts in this category',
        actionDeadline: null,
        isRead: false,
        isResolved: false,
        isDismissed: false,
        createdAt: new Date(),
      })
    }
  }

  return batched
}

/**
 * Save alerts to database
 */
export async function saveAlerts(alerts: ForecastAlert[]): Promise<number> {
  let saved = 0

  for (const alert of alerts) {
    try {
      await prisma.alert.create({
        data: {
          alertType: alert.alertType,
          severity: alert.severity,
          masterSku: alert.masterSku,
          title: alert.title,
          message: alert.message,
          data: JSON.stringify(alert.context),
        },
      })
      saved++
    } catch (error) {
      console.error('Error saving alert:', error)
    }
  }

  return saved
}

/**
 * Get unread alerts count
 */
export async function getUnreadAlertsCount(): Promise<{
  total: number
  critical: number
  high: number
}> {
  const alerts = await prisma.alert.findMany({
    where: {
      isRead: false,
      isResolved: false,
    },
  })

  return {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    high: alerts.filter((a) => a.severity === 'high' || a.severity === 'warning').length,
  }
}
