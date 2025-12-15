/**
 * Deal & Promotion Integration
 *
 * Tracks historical deal performance, learns SKU-specific lift multipliers,
 * and automatically adjusts forecasts for scheduled deals.
 */

import { prisma } from '@/lib/prisma'
import {
  DealPerformance,
  ScheduledDeal,
  UrgencyLevel,
} from '../types'

type DealType = 'lightning' | '7day' | 'coupon' | 'prime_day' | 'bfcm' | 'custom'

interface DealHistoryEntry {
  dealId: string
  masterSku: string
  dealType: DealType
  startDate: Date
  endDate: Date
  discountPercent: number
  baselineVelocity: number
  dealVelocity: number
  salesLift: number
  totalUnitsSold: number
}

/**
 * Record a completed deal's performance
 */
export async function recordDealPerformance(
  masterSku: string,
  dealType: DealType,
  startDate: Date,
  endDate: Date,
  discountPercent: number
): Promise<DealPerformance> {
  // Calculate baseline velocity (30 days before deal)
  const baselineStart = new Date(startDate)
  baselineStart.setDate(baselineStart.getDate() - 30)
  const baselineEnd = new Date(startDate)
  baselineEnd.setDate(baselineEnd.getDate() - 1)

  const baselineSales = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku,
      order: {
        purchaseDate: {
          gte: baselineStart,
          lte: baselineEnd,
        },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  const baselineDays = Math.ceil(
    (baselineEnd.getTime() - baselineStart.getTime()) / (1000 * 60 * 60 * 24)
  )
  const baselineVelocity = (baselineSales._sum.quantity || 0) / baselineDays

  // Calculate deal velocity
  const dealSales = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku,
      order: {
        purchaseDate: {
          gte: startDate,
          lte: endDate,
        },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  const dealDays = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) || 1
  const dealVelocity = (dealSales._sum.quantity || 0) / dealDays

  // Calculate actual sales lift
  const actualSalesLift = baselineVelocity > 0 ? dealVelocity / baselineVelocity : 1

  // Determine context
  const isPrimeDay = checkIfPrimeDay(startDate)
  const isHolidaySeason = checkIfHolidaySeason(startDate)

  // Get expected sales lift based on deal type
  const expectedSalesLift = await getExpectedSalesLift(
    masterSku,
    dealType,
    isPrimeDay,
    isHolidaySeason
  )

  const performance: DealPerformance = {
    dealId: `${masterSku}-${startDate.toISOString().split('T')[0]}`,
    masterSku,
    dealType,
    startDate,
    endDate,
    discountPercent,
    actualSalesLift,
    expectedSalesLift,
    dayOfWeek: startDate.getDay(),
    isHolidaySeason,
    isPrimeDay,
  }

  // Store in deal history (would need a Deal table - using JSON in skuAnalytics for now)
  await updateDealHistory(masterSku, {
    dealId: performance.dealId,
    masterSku,
    dealType,
    startDate,
    endDate,
    discountPercent,
    baselineVelocity,
    dealVelocity,
    salesLift: actualSalesLift,
    totalUnitsSold: dealSales._sum.quantity || 0,
  })

  return performance
}

/**
 * Get expected sales lift for a deal type
 */
async function getExpectedSalesLift(
  masterSku: string,
  dealType: DealType,
  isPrimeDay: boolean,
  isHolidaySeason: boolean
): Promise<number> {
  // Get historical deal performance for this SKU
  const history = await getDealHistory(masterSku)

  // Filter by deal type
  const similarDeals = history.filter((h) => h.dealType === dealType)

  if (similarDeals.length > 0) {
    // Use average of historical performance
    const avgLift =
      similarDeals.reduce((sum, d) => sum + d.salesLift, 0) / similarDeals.length
    return avgLift
  }

  // Default multipliers by deal type
  const defaultMultipliers: Record<DealType, number> = {
    lightning: 3.0,
    '7day': 2.0,
    coupon: 1.5,
    prime_day: 5.0,
    bfcm: 4.0,
    custom: 2.0,
  }

  let multiplier = defaultMultipliers[dealType]

  // Adjust for context
  if (isPrimeDay) multiplier *= 1.5
  if (isHolidaySeason) multiplier *= 1.3

  return multiplier
}

/**
 * Check if date falls on Prime Day
 */
function checkIfPrimeDay(date: Date): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()

  // Prime Day is typically mid-July (July 10-17)
  return month === 7 && day >= 10 && day <= 17
}

/**
 * Check if date is in holiday season
 */
function checkIfHolidaySeason(date: Date): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()

  // Holiday season: Nov 15 - Dec 24
  return (
    (month === 11 && day >= 15) ||
    (month === 12 && day <= 24)
  )
}

/**
 * Get deal history for a SKU
 */
async function getDealHistory(masterSku: string): Promise<DealHistoryEntry[]> {
  // This would query a Deal table - using placeholder
  try {
    // For now, return empty array
    // In production, would query: prisma.deal.findMany({ where: { masterSku } })
    return []
  } catch (error) {
    return []
  }
}

/**
 * Update deal history (store in JSON for now)
 */
async function updateDealHistory(
  masterSku: string,
  entry: DealHistoryEntry
): Promise<void> {
  // This would insert into a Deal table
  // For now, we'll log it
  console.log('Deal recorded:', entry)
}

/**
 * Schedule a future deal and calculate inventory requirements
 */
export async function scheduleDeal(
  masterSku: string,
  dealType: DealType,
  startDate: Date,
  endDate: Date,
  discountPercent: number
): Promise<ScheduledDeal> {
  // Get current inventory
  const inventory = await prisma.inventoryLevel.findUnique({
    where: { masterSku },
  })

  const currentFbaUnits =
    (inventory?.fbaAvailable || 0) + (inventory?.fbaInbound || 0)

  // Get expected sales lift
  const isPrimeDay = checkIfPrimeDay(startDate)
  const isHolidaySeason = checkIfHolidaySeason(startDate)
  const expectedSalesLift = await getExpectedSalesLift(
    masterSku,
    dealType,
    isPrimeDay,
    isHolidaySeason
  )

  // Get current velocity
  const velocity = await getCurrentVelocity(masterSku)

  // Calculate deal duration
  const dealDays = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) || 1

  // Calculate required units
  const dailyDealUnits = velocity * expectedSalesLift
  const requiredUnits = Math.ceil(dailyDealUnits * dealDays * 1.2) // 20% buffer

  // Calculate shortfall
  const shortfall = Math.max(0, requiredUnits - currentFbaUnits)

  // Calculate send-by date (assuming 14 days for FBA receiving)
  const sendByDate = new Date(startDate)
  sendByDate.setDate(sendByDate.getDate() - 14)

  return {
    dealId: `${masterSku}-${startDate.toISOString().split('T')[0]}`,
    masterSku,
    dealType,
    startDate,
    endDate,
    discountPercent,
    expectedSalesLift,
    requiredUnits,
    currentFbaUnits,
    shortfall,
    sendByDate,
  }
}

/**
 * Get current velocity for a SKU
 */
async function getCurrentVelocity(masterSku: string): Promise<number> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const sales = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku,
      order: {
        purchaseDate: { gte: thirtyDaysAgo },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  return (sales._sum.quantity || 0) / 30
}

/**
 * Get deal inventory alert for upcoming deals
 */
export async function getDealInventoryAlerts(
  daysAhead: number = 30
): Promise<
  Array<{
    masterSku: string
    dealType: string
    dealDate: Date
    shortfall: number
    sendByDate: Date
    urgency: UrgencyLevel
    message: string
  }>
> {
  // This would query scheduled deals table
  // For now, return empty array
  // In production: query upcoming deals and check inventory
  return []
}

/**
 * Apply deal multiplier to forecast
 */
export async function getDealMultiplierForDate(
  masterSku: string,
  date: Date
): Promise<{
  multiplier: number
  dealName: string | null
  dealType: DealType | null
}> {
  // Check if there's a scheduled deal for this date
  // This would query the deals table
  // For now, return default
  return {
    multiplier: 1.0,
    dealName: null,
    dealType: null,
  }
}

/**
 * Get SKU-specific deal performance summary
 */
export async function getSkuDealPerformance(
  masterSku: string
): Promise<{
  totalDeals: number
  averageLift: number
  bestDealType: DealType | null
  bestLift: number
  dealHistory: DealHistoryEntry[]
}> {
  const history = await getDealHistory(masterSku)

  if (history.length === 0) {
    return {
      totalDeals: 0,
      averageLift: 1.0,
      bestDealType: null,
      bestLift: 1.0,
      dealHistory: [],
    }
  }

  const averageLift =
    history.reduce((sum, d) => sum + d.salesLift, 0) / history.length

  const bestDeal = history.reduce((best, current) =>
    current.salesLift > best.salesLift ? current : best
  )

  return {
    totalDeals: history.length,
    averageLift,
    bestDealType: bestDeal.dealType,
    bestLift: bestDeal.salesLift,
    dealHistory: history,
  }
}

/**
 * Generate pre-deal inventory recommendation
 */
export async function generatePreDealRecommendation(
  masterSku: string,
  dealType: DealType,
  startDate: Date,
  endDate: Date,
  discountPercent: number
): Promise<{
  recommendation: string
  requiredUnits: number
  currentUnits: number
  shortfall: number
  sendByDate: Date
  estimatedDealSales: number
  confidence: number
}> {
  const scheduled = await scheduleDeal(
    masterSku,
    dealType,
    startDate,
    endDate,
    discountPercent
  )

  const dealDays = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) || 1

  const velocity = await getCurrentVelocity(masterSku)
  const estimatedDealSales = velocity * scheduled.expectedSalesLift * dealDays

  // Get confidence from historical data
  const history = await getDealHistory(masterSku)
  const confidence = Math.min(0.9, 0.5 + history.length * 0.1)

  let recommendation: string

  if (scheduled.shortfall > 0) {
    const daysUntilSendBy = Math.ceil(
      (scheduled.sendByDate.getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24)
    )

    if (daysUntilSendBy <= 0) {
      recommendation = `URGENT: Send ${scheduled.shortfall} units to FBA immediately. Deal starts in ${Math.ceil(
        (startDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )} days.`
    } else {
      recommendation = `Send ${scheduled.shortfall} units to FBA by ${scheduled.sendByDate.toLocaleDateString()} for ${dealType} deal on ${startDate.toLocaleDateString()}.`
    }
  } else {
    recommendation = `Inventory sufficient for ${dealType} deal. Current: ${scheduled.currentFbaUnits} units, Required: ${scheduled.requiredUnits} units.`
  }

  return {
    recommendation,
    requiredUnits: scheduled.requiredUnits,
    currentUnits: scheduled.currentFbaUnits,
    shortfall: scheduled.shortfall,
    sendByDate: scheduled.sendByDate,
    estimatedDealSales: Math.round(estimatedDealSales),
    confidence,
  }
}

/**
 * Learn deal multipliers for a SKU from history
 */
export async function learnDealMultipliers(
  masterSku: string
): Promise<Record<DealType, number>> {
  const history = await getDealHistory(masterSku)

  const multipliers: Record<DealType, number> = {
    lightning: 3.0,
    '7day': 2.0,
    coupon: 1.5,
    prime_day: 5.0,
    bfcm: 4.0,
    custom: 2.0,
  }

  // Group by deal type
  const byType = new Map<DealType, number[]>()

  for (const entry of history) {
    if (!byType.has(entry.dealType)) {
      byType.set(entry.dealType, [])
    }
    byType.get(entry.dealType)?.push(entry.salesLift)
  }

  // Calculate average for each type
  for (const [dealType, lifts] of byType) {
    if (lifts.length > 0) {
      multipliers[dealType] = lifts.reduce((a, b) => a + b, 0) / lifts.length
    }
  }

  return multipliers
}
