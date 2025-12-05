/**
 * Forecasting Engine - Core Calculations
 * 
 * Provides all the calculations needed for inventory forecasting:
 * - Velocity calculations
 * - Days of supply
 * - Reorder point
 * - Safety stock
 * - Seasonality adjustments
 */

import { prisma } from '@/lib/prisma'

// ==========================================
// Configuration
// ==========================================

export const FORECAST_CONFIG = {
  // Target inventory levels (days)
  targets: {
    fba: 45,
    warehouse: 135,
    total: 180,
  },
  
  // FBA receiving time buffer
  fbaReceivingDays: 10,
  
  // Default values
  defaults: {
    leadTimeDays: 30,
    safetyStockDays: 14,
  },
  
  // Urgency thresholds (days until must order)
  urgency: {
    critical: 14,
    high: 30,
    medium: 60,
    low: 90,
  },
  
  // Safety stock Z-scores by product importance
  // Z = 1.65 = 95% service level
  // Z = 1.96 = 97.5% service level
  // Z = 2.33 = 99% service level
  safetyStockZScore: {
    bestSeller: 2.33,
    regular: 1.65,
    slowMover: 1.28,
  },
}

// ==========================================
// Types
// ==========================================

export interface VelocityData {
  velocity7d: number
  velocity30d: number
  velocity90d: number
  trend: 'rising' | 'stable' | 'declining'
  effectiveVelocity: number
}

export interface InventoryPosition {
  fbaAvailable: number
  fbaInbound: number
  warehouseAvailable: number
  total: number
}

export interface DaysOfSupply {
  fba: number
  warehouse: number
  total: number
}

export interface ReorderRecommendation {
  reorderPoint: number
  recommendedOrderQty: number
  recommendedFbaQty: number
  urgency: 'critical' | 'high' | 'medium' | 'low' | 'ok'
  stockoutDate?: Date
  reasoning: string
}

export interface SeasonalEvent {
  name: string
  startDate: Date
  endDate: Date
  multiplier: number
}

// ==========================================
// Velocity Calculations
// ==========================================

/**
 * Calculate sales velocity from order data
 */
export async function calculateVelocity(masterSku: string): Promise<VelocityData> {
  const now = new Date()
  const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const days90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // Get sales for each period
  const [sales7d, sales30d, sales90d] = await Promise.all([
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        masterSku,
        order: {
          purchaseDate: { gte: days7Ago },
          status: { notIn: ['Cancelled', 'Pending'] },
        },
      },
    }),
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        masterSku,
        order: {
          purchaseDate: { gte: days30Ago },
          status: { notIn: ['Cancelled', 'Pending'] },
        },
      },
    }),
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: {
        masterSku,
        order: {
          purchaseDate: { gte: days90Ago },
          status: { notIn: ['Cancelled', 'Pending'] },
        },
      },
    }),
  ])

  const velocity7d = (sales7d._sum.quantity || 0) / 7
  const velocity30d = (sales30d._sum.quantity || 0) / 30
  const velocity90d = (sales90d._sum.quantity || 0) / 90

  // Determine trend
  let trend: 'rising' | 'stable' | 'declining' = 'stable'
  if (velocity30d > 0) {
    const ratio = velocity7d / velocity30d
    if (ratio > 1.2) trend = 'rising'
    else if (ratio < 0.8) trend = 'declining'
  }

  // Calculate effective velocity (weighted average when trend is significant)
  let effectiveVelocity = velocity30d
  if (velocity7d > 0 && velocity30d > 0) {
    const ratio = velocity7d / velocity30d
    if (ratio > 1.5 || ratio < 0.5) {
      // Significant change - weight recent data more heavily
      effectiveVelocity = velocity7d * 0.6 + velocity30d * 0.4
    }
  }

  return {
    velocity7d,
    velocity30d,
    velocity90d,
    trend,
    effectiveVelocity,
  }
}

/**
 * Batch calculate velocity for multiple SKUs (more efficient)
 */
export async function calculateVelocityBatch(masterSkus: string[]): Promise<Map<string, VelocityData>> {
  const now = new Date()
  const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const days90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // Batch queries
  const [sales7d, sales30d, sales90d] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ['masterSku'],
      _sum: { quantity: true },
      where: {
        masterSku: { in: masterSkus },
        order: {
          purchaseDate: { gte: days7Ago },
          status: { notIn: ['Cancelled', 'Pending'] },
        },
      },
    }),
    prisma.orderItem.groupBy({
      by: ['masterSku'],
      _sum: { quantity: true },
      where: {
        masterSku: { in: masterSkus },
        order: {
          purchaseDate: { gte: days30Ago },
          status: { notIn: ['Cancelled', 'Pending'] },
        },
      },
    }),
    prisma.orderItem.groupBy({
      by: ['masterSku'],
      _sum: { quantity: true },
      where: {
        masterSku: { in: masterSkus },
        order: {
          purchaseDate: { gte: days90Ago },
          status: { notIn: ['Cancelled', 'Pending'] },
        },
      },
    }),
  ])

  // Create lookup maps
  const map7d = new Map(sales7d.map((s: any) => [s.masterSku, s._sum.quantity || 0]))
  const map30d = new Map(sales30d.map((s: any) => [s.masterSku, s._sum.quantity || 0]))
  const map90d = new Map(sales90d.map((s: any) => [s.masterSku, s._sum.quantity || 0]))

  // Calculate velocity for each SKU
  const result = new Map<string, VelocityData>()

  for (const sku of masterSkus) {
    const velocity7d = Number(map7d.get(sku) || 0) / 7
    const velocity30d = Number(map30d.get(sku) || 0) / 30
    const velocity90d = Number(map90d.get(sku) || 0) / 90

    let trend: 'rising' | 'stable' | 'declining' = 'stable'
    if (velocity30d > 0) {
      const ratio = velocity7d / velocity30d
      if (ratio > 1.2) trend = 'rising'
      else if (ratio < 0.8) trend = 'declining'
    }

    let effectiveVelocity = velocity30d
    if (velocity7d > 0 && velocity30d > 0) {
      const ratio = velocity7d / velocity30d
      if (ratio > 1.5 || ratio < 0.5) {
        effectiveVelocity = velocity7d * 0.6 + velocity30d * 0.4
      }
    }

    result.set(sku, {
      velocity7d,
      velocity30d,
      velocity90d,
      trend,
      effectiveVelocity,
    })
  }

  return result
}

// ==========================================
// Days of Supply Calculations
// ==========================================

/**
 * Calculate days of supply for each location
 */
export function calculateDaysOfSupply(
  inventory: InventoryPosition,
  velocity: number
): DaysOfSupply {
  if (velocity <= 0) {
    return {
      fba: inventory.fbaAvailable + inventory.fbaInbound > 0 ? 999 : 0,
      warehouse: inventory.warehouseAvailable > 0 ? 999 : 0,
      total: inventory.total > 0 ? 999 : 0,
    }
  }

  return {
    fba: (inventory.fbaAvailable + inventory.fbaInbound) / velocity,
    warehouse: inventory.warehouseAvailable / velocity,
    total: inventory.total / velocity,
  }
}

// ==========================================
// Reorder Calculations
// ==========================================

/**
 * Calculate safety stock using statistical formula
 * 
 * Safety Stock = Z-score × Std Dev of Demand × √Lead Time
 */
export function calculateSafetyStock(
  demandStdDev: number,
  leadTimeDays: number,
  importance: 'bestSeller' | 'regular' | 'slowMover' = 'regular'
): number {
  const zScore = FORECAST_CONFIG.safetyStockZScore[importance]
  return Math.ceil(zScore * demandStdDev * Math.sqrt(leadTimeDays))
}

/**
 * Calculate standard deviation of daily demand
 */
export async function calculateDemandStdDev(
  masterSku: string,
  days: number = 30
): Promise<number> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  // Get daily sales
  const dailySales = await prisma.$queryRaw<{ date: Date; quantity: number }[]>`
    SELECT 
      DATE(o.purchase_date) as date,
      COALESCE(SUM(oi.quantity), 0) as quantity
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.master_sku = ${masterSku}
    WHERE o.purchase_date >= ${startDate}
      AND o.status NOT IN ('Cancelled', 'Pending')
    GROUP BY DATE(o.purchase_date)
    ORDER BY date
  `

  if (dailySales.length < 7) return 0

  const quantities = dailySales.map((d: any) => Number(d.quantity))
  const mean = quantities.reduce((a: any, b: any) => a + b, 0) / quantities.length
  const variance = quantities.reduce((sum: any, val: any) => sum + Math.pow(val - mean, 2), 0) / quantities.length

  return Math.sqrt(variance)
}

/**
 * Calculate reorder recommendation
 */
export function calculateReorderRecommendation(
  inventory: InventoryPosition,
  velocity: VelocityData,
  leadTimeDays: number,
  safetyStockDays: number = FORECAST_CONFIG.defaults.safetyStockDays,
  moq?: number
): ReorderRecommendation {
  const { effectiveVelocity } = velocity
  
  // If no sales, no need to reorder (unless inventory is zero)
  if (effectiveVelocity <= 0) {
    return {
      reorderPoint: 0,
      recommendedOrderQty: 0,
      recommendedFbaQty: 0,
      urgency: inventory.total > 0 ? 'ok' : 'low',
      reasoning: 'No recent sales velocity',
    }
  }

  // Calculate reorder point
  const leadTimeDemand = effectiveVelocity * leadTimeDays
  const safetyStock = effectiveVelocity * safetyStockDays
  const reorderPoint = Math.ceil(leadTimeDemand + safetyStock)

  // Calculate target inventory
  const targetInventory = effectiveVelocity * FORECAST_CONFIG.targets.total

  // Calculate recommended order quantity
  let recommendedOrderQty = Math.ceil(Math.max(0, targetInventory - inventory.total))
  
  // Apply MOQ
  if (moq && recommendedOrderQty > 0 && recommendedOrderQty < moq) {
    recommendedOrderQty = moq
  }

  // Calculate FBA replenishment
  const fbaTarget = effectiveVelocity * (FORECAST_CONFIG.targets.fba + FORECAST_CONFIG.fbaReceivingDays)
  const currentFba = inventory.fbaAvailable + inventory.fbaInbound
  let recommendedFbaQty = Math.ceil(Math.max(0, fbaTarget - currentFba))
  recommendedFbaQty = Math.min(recommendedFbaQty, inventory.warehouseAvailable)

  // Calculate days until must order
  const daysOfSupply = inventory.total / effectiveVelocity
  const daysUntilMustOrder = daysOfSupply - leadTimeDays - safetyStockDays

  // Determine urgency
  let urgency: 'critical' | 'high' | 'medium' | 'low' | 'ok' = 'ok'
  if (daysUntilMustOrder <= FORECAST_CONFIG.urgency.critical) {
    urgency = 'critical'
  } else if (daysUntilMustOrder <= FORECAST_CONFIG.urgency.high) {
    urgency = 'high'
  } else if (daysUntilMustOrder <= FORECAST_CONFIG.urgency.medium) {
    urgency = 'medium'
  } else if (daysUntilMustOrder <= FORECAST_CONFIG.urgency.low) {
    urgency = 'low'
  }

  // Calculate stockout date
  let stockoutDate: Date | undefined
  if (daysOfSupply < 365) {
    stockoutDate = new Date()
    stockoutDate.setDate(stockoutDate.getDate() + Math.floor(daysOfSupply))
  }

  // Build reasoning
  const reasoning = buildReasoningString(
    effectiveVelocity,
    inventory,
    leadTimeDays,
    recommendedOrderQty,
    recommendedFbaQty,
    daysOfSupply
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

function buildReasoningString(
  velocity: number,
  inventory: InventoryPosition,
  leadTimeDays: number,
  orderQty: number,
  fbaQty: number,
  daysOfSupply: number
): string {
  const parts: string[] = []

  parts.push(`Selling ${velocity.toFixed(1)} units/day`)
  parts.push(`${Math.round(daysOfSupply)} days of supply remaining`)
  
  if (orderQty > 0) {
    parts.push(`Order ${orderQty} units to reach ${FORECAST_CONFIG.targets.total}-day target`)
    parts.push(`(Lead time: ${leadTimeDays} days)`)
  }
  
  if (fbaQty > 0) {
    parts.push(`Send ${fbaQty} units to FBA to reach ${FORECAST_CONFIG.targets.fba}-day target`)
  }

  return parts.join('. ')
}

// ==========================================
// Seasonality
// ==========================================

/**
 * Get upcoming seasonal events
 */
export function getUpcomingSeasonalEvents(daysAhead: number = 60): SeasonalEvent[] {
  const now = new Date()
  const year = now.getFullYear()
  
  // Define seasonal events with typical multipliers
  const events: SeasonalEvent[] = [
    {
      name: "Valentine's Day",
      startDate: new Date(year, 1, 1), // Feb 1
      endDate: new Date(year, 1, 14), // Feb 14
      multiplier: 1.5,
    },
    {
      name: "Mother's Day",
      startDate: new Date(year, 4, 1), // May 1
      endDate: new Date(year, 4, 14), // May 14
      multiplier: 1.5,
    },
    {
      name: "Father's Day",
      startDate: new Date(year, 5, 1), // June 1
      endDate: new Date(year, 5, 21), // June 21
      multiplier: 1.3,
    },
    {
      name: "Prime Day",
      startDate: new Date(year, 6, 10), // July 10 (approximate)
      endDate: new Date(year, 6, 17), // July 17
      multiplier: 3.0,
    },
    {
      name: "Back to School",
      startDate: new Date(year, 7, 1), // Aug 1
      endDate: new Date(year, 7, 31), // Aug 31
      multiplier: 1.3,
    },
    {
      name: "Black Friday - Christmas",
      startDate: new Date(year, 10, 15), // Nov 15
      endDate: new Date(year, 11, 24), // Dec 24
      multiplier: 2.5,
    },
  ]

  // Filter to upcoming events
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
  
  return events.filter(event => {
    // Adjust year if event has passed
    if (event.endDate < now) {
      event.startDate.setFullYear(year + 1)
      event.endDate.setFullYear(year + 1)
    }
    return event.startDate <= futureDate && event.endDate >= now
  })
}

/**
 * Get seasonality multiplier for a given date
 */
export function getSeasonalityMultiplier(date: Date): number {
  const events = getUpcomingSeasonalEvents(0)
  
  for (const event of events) {
    if (date >= event.startDate && date <= event.endDate) {
      return event.multiplier
    }
  }
  
  return 1.0
}

// ==========================================
// Spike Detection
// ==========================================

/**
 * Check if a SKU is experiencing a sales spike
 */
export async function detectSpike(masterSku: string): Promise<{
  isSpiking: boolean
  spikeMultiplier: number
  daysSpiking: number
}> {
  const velocity = await calculateVelocity(masterSku)
  
  if (velocity.velocity30d <= 0) {
    return { isSpiking: false, spikeMultiplier: 1, daysSpiking: 0 }
  }

  const ratio = velocity.velocity7d / velocity.velocity30d

  // Spike if 7-day velocity is >50% higher than 30-day
  if (ratio > 1.5) {
    return {
      isSpiking: true,
      spikeMultiplier: ratio,
      daysSpiking: 7, // Simplified - could calculate actual start
    }
  }

  return { isSpiking: false, spikeMultiplier: 1, daysSpiking: 0 }
}

// ==========================================
// Export all utilities
// ==========================================

export const ForecastingUtils = {
  calculateVelocity,
  calculateVelocityBatch,
  calculateDaysOfSupply,
  calculateSafetyStock,
  calculateDemandStdDev,
  calculateReorderRecommendation,
  getUpcomingSeasonalEvents,
  getSeasonalityMultiplier,
  detectSpike,
  CONFIG: FORECAST_CONFIG,
}
