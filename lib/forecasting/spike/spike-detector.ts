/**
 * Sudden Spike Detection System
 *
 * Monitors sales velocity and detects sudden spikes.
 * Identifies probable causes (ads, deals, listing changes, organic).
 * Provides inventory impact analysis and recommendations.
 */

import { prisma } from '@/lib/prisma'
import {
  SalesDataPoint,
  SpikeDetection,
  SpikeCause,
  UrgencyLevel,
} from '../types'

interface SpikeConfig {
  threshold: number        // % increase to trigger spike (default: 50)
  minConsecutiveDays: number // Days of elevated sales (default: 3)
  decayPeriodDays: number  // Days to decay spike impact (default: 60)
}

const DEFAULT_CONFIG: SpikeConfig = {
  threshold: 50,
  minConsecutiveDays: 3,
  decayPeriodDays: 60,
}

/**
 * Detect if a SKU is experiencing a sales spike
 */
export async function detectSpike(
  masterSku: string,
  salesData: SalesDataPoint[],
  config: Partial<SpikeConfig> = {}
): Promise<SpikeDetection> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }

  if (salesData.length < 14) {
    return createNoSpikeResult(masterSku)
  }

  // Calculate rolling 7-day average (baseline)
  const baselineData = salesData.slice(-37, -7) // Days 7-37 ago
  const baselineVelocity =
    baselineData.length > 0
      ? baselineData.reduce((sum, d) => sum + d.units, 0) / baselineData.length
      : 0

  // Calculate current 7-day average
  const recentData = salesData.slice(-7)
  const currentVelocity =
    recentData.length > 0
      ? recentData.reduce((sum, d) => sum + d.units, 0) / recentData.length
      : 0

  // Check if spiking
  const spikeThreshold = 1 + fullConfig.threshold / 100
  const spikeMultiplier =
    baselineVelocity > 0 ? currentVelocity / baselineVelocity : 1

  const isSpiking = spikeMultiplier >= spikeThreshold

  if (!isSpiking) {
    return createNoSpikeResult(masterSku)
  }

  // Find spike start date (when did velocity exceed threshold?)
  const spikeStartDate = findSpikeStartDate(
    salesData,
    baselineVelocity,
    spikeThreshold
  )

  const daysSpiking = spikeStartDate
    ? Math.ceil(
        (new Date().getTime() - spikeStartDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0

  // Analyze probable cause
  const causeAnalysis = await analyzeSpikeCase(
    masterSku,
    spikeStartDate || new Date()
  )

  // Get current inventory and calculate impact
  const inventoryImpact = await calculateInventoryImpact(
    masterSku,
    currentVelocity,
    baselineVelocity
  )

  // Generate decay projection
  const projectedDecay = generateDecayProjection(
    spikeMultiplier,
    fullConfig.decayPeriodDays
  )

  // Update SKU analytics
  await updateSkuAnalytics(
    masterSku,
    true,
    spikeStartDate,
    causeAnalysis.cause,
    spikeMultiplier
  )

  return {
    masterSku,
    isSpiking: true,
    spikeMultiplier,
    daysSpiking,
    spikeStartDate,
    probableCause: causeAnalysis.cause,
    causeConfidence: causeAnalysis.confidence,
    causeDetails: causeAnalysis.details,
    currentVelocity,
    baselineVelocity,
    inventoryImpact,
    projectedDecay,
  }
}

/**
 * Find when the spike started
 */
function findSpikeStartDate(
  salesData: SalesDataPoint[],
  baselineVelocity: number,
  threshold: number
): Date | null {
  if (baselineVelocity <= 0) return null

  // Walk backwards to find when velocity first exceeded threshold
  const windowSize = 3
  let spikeStart: Date | null = null

  for (let i = salesData.length - windowSize; i >= windowSize; i--) {
    const window = salesData.slice(i, i + windowSize)
    const windowAvg =
      window.reduce((sum, d) => sum + d.units, 0) / windowSize
    const multiplier = windowAvg / baselineVelocity

    if (multiplier >= threshold) {
      spikeStart = salesData[i].date
    } else {
      break
    }
  }

  return spikeStart
}

/**
 * Analyze probable cause of spike
 */
async function analyzeSpikeCase(
  masterSku: string,
  spikeStartDate: Date
): Promise<{
  cause: SpikeCause
  confidence: number
  details: {
    adSpendChange?: number
    listingChangeDate?: Date
    activeDeal?: string
  }
}> {
  const details: {
    adSpendChange?: number
    listingChangeDate?: Date
    activeDeal?: string
  } = {}

  // Check 1: Ad spend increase
  const adSpendChange = await checkAdSpendIncrease(masterSku, spikeStartDate)
  if (adSpendChange && adSpendChange > 50) {
    details.adSpendChange = adSpendChange
    return {
      cause: 'ads',
      confidence: Math.min(0.9, 0.5 + adSpendChange / 200),
      details,
    }
  }

  // Check 2: Active deals
  const activeDeal = await checkForDeals(masterSku, spikeStartDate)
  if (activeDeal) {
    details.activeDeal = activeDeal
    return {
      cause: 'deal',
      confidence: 0.85,
      details,
    }
  }

  // Check 3: Listing changes (would need listing change tracking)
  const listingChange = await checkListingChanges(masterSku, spikeStartDate)
  if (listingChange) {
    details.listingChangeDate = listingChange
    return {
      cause: 'listing_change',
      confidence: 0.7,
      details,
    }
  }

  // Default: Organic spike
  return {
    cause: 'organic',
    confidence: 0.5,
    details,
  }
}

/**
 * Check for ad spend increase around spike start
 */
async function checkAdSpendIncrease(
  masterSku: string,
  spikeStartDate: Date
): Promise<number | null> {
  try {
    // This would query Amazon Ads data
    // For now, return null (not implemented)
    return null
  } catch (error) {
    return null
  }
}

/**
 * Check for active deals
 */
async function checkForDeals(
  masterSku: string,
  spikeStartDate: Date
): Promise<string | null> {
  try {
    // This would query deal/promotion data
    // For now, return null
    return null
  } catch (error) {
    return null
  }
}

/**
 * Check for listing changes
 */
async function checkListingChanges(
  masterSku: string,
  spikeStartDate: Date
): Promise<Date | null> {
  try {
    // This would query listing change history
    // For now, return null
    return null
  } catch (error) {
    return null
  }
}

/**
 * Calculate inventory impact of spike
 */
async function calculateInventoryImpact(
  masterSku: string,
  currentVelocity: number,
  baselineVelocity: number
): Promise<{
  daysOfSupplyAtNewRate: number
  additionalUnitsNeeded: number
  urgency: UrgencyLevel
}> {
  // Get current inventory
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

  const leadTimeDays = product?.supplier?.leadTimeDays || 30

  // Days of supply at current rate
  const daysOfSupplyAtNewRate =
    currentVelocity > 0 ? totalInventory / currentVelocity : 999

  // Additional units needed to maintain 45-day FBA target
  const targetDays = 45
  const unitsNeededForTarget = currentVelocity * targetDays
  const additionalUnitsNeeded = Math.max(0, unitsNeededForTarget - totalInventory)

  // Determine urgency
  let urgency: UrgencyLevel = 'ok'

  if (daysOfSupplyAtNewRate <= leadTimeDays) {
    urgency = 'critical' // Will stockout before reorder arrives
  } else if (daysOfSupplyAtNewRate <= leadTimeDays + 14) {
    urgency = 'high'
  } else if (daysOfSupplyAtNewRate <= leadTimeDays + 30) {
    urgency = 'medium'
  } else if (additionalUnitsNeeded > 0) {
    urgency = 'low'
  }

  return {
    daysOfSupplyAtNewRate: Math.round(daysOfSupplyAtNewRate),
    additionalUnitsNeeded: Math.ceil(additionalUnitsNeeded),
    urgency,
  }
}

/**
 * Generate spike decay projection
 */
function generateDecayProjection(
  currentMultiplier: number,
  decayPeriodDays: number
): Array<{ daysFromNow: number; projectedMultiplier: number }> {
  const projection: Array<{
    daysFromNow: number
    projectedMultiplier: number
  }> = []

  // Exponential decay from current multiplier back to 1.0
  const decayRate = Math.log(currentMultiplier) / decayPeriodDays

  for (let day = 0; day <= decayPeriodDays; day += 7) {
    const projectedMultiplier = 1 + (currentMultiplier - 1) * Math.exp(-day / (decayPeriodDays / 3))
    projection.push({
      daysFromNow: day,
      projectedMultiplier: Math.max(1, projectedMultiplier),
    })
  }

  // Add final point at 1.0
  projection.push({
    daysFromNow: decayPeriodDays,
    projectedMultiplier: 1.0,
  })

  return projection
}

/**
 * Update SKU analytics with spike information
 */
async function updateSkuAnalytics(
  masterSku: string,
  isSpiking: boolean,
  spikeStartDate: Date | null,
  spikeCause: SpikeCause,
  spikeMultiplier: number
): Promise<void> {
  try {
    await prisma.skuAnalytics.upsert({
      where: { masterSku },
      create: {
        masterSku,
        isSpiking,
        spikeStartDate,
        spikeCause,
        spikeMultiplier,
        watchStatus: isSpiking ? 'high_watch' : 'normal',
      },
      update: {
        isSpiking,
        spikeStartDate,
        spikeCause,
        spikeMultiplier,
        watchStatus: isSpiking ? 'high_watch' : 'normal',
      },
    })
  } catch (error) {
    console.error('Error updating SKU analytics:', error)
  }
}

/**
 * Create no-spike result
 */
function createNoSpikeResult(masterSku: string): SpikeDetection {
  return {
    masterSku,
    isSpiking: false,
    spikeMultiplier: 1,
    daysSpiking: 0,
    spikeStartDate: null,
    probableCause: 'unknown',
    causeConfidence: 0,
    causeDetails: {},
    currentVelocity: 0,
    baselineVelocity: 0,
    inventoryImpact: {
      daysOfSupplyAtNewRate: 999,
      additionalUnitsNeeded: 0,
      urgency: 'ok',
    },
    projectedDecay: [],
  }
}

/**
 * Check all SKUs for spikes
 */
export async function detectAllSpikes(): Promise<{
  spikingSkus: SpikeDetection[]
  alerts: Array<{
    masterSku: string
    message: string
    urgency: UrgencyLevel
  }>
}> {
  const products = await prisma.product.findMany({
    where: { isHidden: false },
    select: { sku: true },
  })

  const spikingSkus: SpikeDetection[] = []
  const alerts: Array<{
    masterSku: string
    message: string
    urgency: UrgencyLevel
  }> = []

  for (const product of products) {
    try {
      // Get sales data
      const salesData = await getSalesData(product.sku)
      const spike = await detectSpike(product.sku, salesData)

      if (spike.isSpiking) {
        spikingSkus.push(spike)

        if (spike.inventoryImpact.urgency === 'critical') {
          alerts.push({
            masterSku: spike.masterSku,
            message: `SKU ${spike.masterSku} spiking ${spike.spikeMultiplier.toFixed(
              1
            )}x - current inventory will last only ${
              spike.inventoryImpact.daysOfSupplyAtNewRate
            } days at new rate`,
            urgency: 'critical',
          })
        } else if (spike.inventoryImpact.urgency === 'high') {
          alerts.push({
            masterSku: spike.masterSku,
            message: `SKU ${spike.masterSku} showing ${Math.round(
              (spike.spikeMultiplier - 1) * 100
            )}% sales increase. Cause: ${
              spike.probableCause
            }. Consider increasing inventory.`,
            urgency: 'high',
          })
        }
      }
    } catch (error) {
      console.error(`Error detecting spike for ${product.sku}:`, error)
    }
  }

  return { spikingSkus, alerts }
}

/**
 * Get sales data for spike detection
 */
async function getSalesData(masterSku: string): Promise<SalesDataPoint[]> {
  const fortyFiveDaysAgo = new Date()
  fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45)

  try {
    // Try dailyProfit first
    const dailyProfits = await prisma.dailyProfit.findMany({
      where: {
        masterSku,
        date: { gte: fortyFiveDaysAgo },
      },
      orderBy: { date: 'asc' },
    })

    if (dailyProfits.length > 0) {
      return dailyProfits.map((dp) => ({
        date: dp.date,
        units: dp.unitsSold,
      }))
    }
  } catch (error) {
    // Fall through to order items
  }

  // Fallback to order items
  const orders = await prisma.orderItem.groupBy({
    by: ['masterSku'],
    _sum: { quantity: true },
    where: {
      masterSku,
      order: {
        purchaseDate: { gte: fortyFiveDaysAgo },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  // This gives aggregate, not daily - need to restructure
  // For simplicity, return empty if dailyProfit not available
  return []
}

/**
 * Apply spike adjustment to forecast
 */
export function applySpikeAdjustment(
  baseForecast: number,
  spike: SpikeDetection,
  daysFromNow: number
): number {
  if (!spike.isSpiking || spike.projectedDecay.length === 0) {
    return baseForecast
  }

  // Find the appropriate decay multiplier for this day
  const decay = spike.projectedDecay.find(
    (d) => d.daysFromNow >= daysFromNow
  ) || { projectedMultiplier: 1 }

  return baseForecast * decay.projectedMultiplier
}

/**
 * Generate spike alert message
 */
export function generateSpikeAlert(spike: SpikeDetection): string {
  if (!spike.isSpiking) return ''

  const causeText = {
    ads: 'likely due to increased ad spend',
    deal: 'due to active promotion/deal',
    listing_change: 'possibly due to recent listing changes',
    organic: 'appears to be organic growth',
    unknown: 'cause unknown',
  }

  return `SKU ${spike.masterSku} is spiking at ${spike.spikeMultiplier.toFixed(
    1
  )}x normal velocity (${causeText[spike.probableCause]}). ` +
    `Current inventory will last ${spike.inventoryImpact.daysOfSupplyAtNewRate} days at this rate. ` +
    `Recommend ordering ${spike.inventoryImpact.additionalUnitsNeeded} additional units.`
}
