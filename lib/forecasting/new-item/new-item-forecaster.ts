/**
 * New Item Forecasting System
 *
 * Forecasts demand for new SKUs with no sales history by:
 * - Finding similar products (analog SKUs) by category, price, attributes
 * - Using analog's first 30/60/90 days as baseline
 * - Applying current seasonality
 * - Auto-recalibrating based on actual performance
 */

import { prisma } from '@/lib/prisma'
import {
  SalesDataPoint,
  AnalogSkuMatch,
  NewItemForecast,
  WatchStatus,
} from '../types'

interface AnalogMatchCriteria {
  categoryWeight: number
  priceRangeWeight: number
  brandWeight: number
  supplierWeight: number
  minMatchScore: number
}

const DEFAULT_CRITERIA: AnalogMatchCriteria = {
  categoryWeight: 0.4,
  priceRangeWeight: 0.3,
  brandWeight: 0.2,
  supplierWeight: 0.1,
  minMatchScore: 0.5,
}

/**
 * Check if a SKU is a new item
 */
export async function isNewItem(masterSku: string): Promise<{
  isNew: boolean
  daysSinceLaunch: number
  launchDate: Date | null
}> {
  // Get first sale date
  const firstSale = await prisma.orderItem.findFirst({
    where: {
      masterSku,
      order: {
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
    orderBy: {
      order: { purchaseDate: 'asc' },
    },
    include: {
      order: { select: { purchaseDate: true } },
    },
  })

  if (!firstSale) {
    return { isNew: true, daysSinceLaunch: 0, launchDate: null }
  }

  const launchDate = firstSale.order.purchaseDate
  const daysSinceLaunch = Math.ceil(
    (new Date().getTime() - launchDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Consider "new" for first 90 days
  return {
    isNew: daysSinceLaunch <= 90,
    daysSinceLaunch,
    launchDate,
  }
}

/**
 * Find analog SKU for a new item
 */
export async function findAnalogSku(
  masterSku: string,
  criteria: Partial<AnalogMatchCriteria> = {}
): Promise<AnalogSkuMatch | null> {
  const config = { ...DEFAULT_CRITERIA, ...criteria }

  // Get the new item's attributes
  const newItem = await prisma.product.findUnique({
    where: { sku: masterSku },
    include: { supplier: true },
  })

  if (!newItem) return null

  // Find potential analogs with same category
  const potentialAnalogs = await prisma.product.findMany({
    where: {
      sku: { not: masterSku },
      isHidden: false,
      category: newItem.category,
    },
    include: {
      supplier: true,
      salesVelocity: true,
    },
  })

  // Score each potential analog
  const scoredAnalogs: Array<{
    sku: string
    score: number
    matchReasons: string[]
    matchCriteria: {
      category: boolean
      priceRange: boolean
      brand: boolean
      supplier: boolean
    }
    salesData: {
      avgVelocity30d: number
      avgVelocity90d: number
    }
  }> = []

  for (const analog of potentialAnalogs) {
    let score = 0
    const matchReasons: string[] = []
    const matchCriteria = {
      category: false,
      priceRange: false,
      brand: false,
      supplier: false,
    }

    // Category match
    if (analog.category === newItem.category) {
      score += config.categoryWeight
      matchReasons.push('Same category')
      matchCriteria.category = true
    }

    // Price range match (within 20%)
    const priceDiff = Math.abs(
      Number(analog.price) - Number(newItem.price)
    ) / Number(newItem.price)
    if (priceDiff <= 0.2) {
      score += config.priceRangeWeight
      matchReasons.push('Similar price point')
      matchCriteria.priceRange = true
    } else if (priceDiff <= 0.4) {
      score += config.priceRangeWeight * 0.5
      matchReasons.push('Comparable price range')
    }

    // Brand match
    if (analog.brand === newItem.brand) {
      score += config.brandWeight
      matchReasons.push('Same brand')
      matchCriteria.brand = true
    }

    // Supplier match
    if (analog.supplierId && analog.supplierId === newItem.supplierId) {
      score += config.supplierWeight
      matchReasons.push('Same supplier')
      matchCriteria.supplier = true
    }

    // Must have sales velocity data
    if (!analog.salesVelocity) continue

    scoredAnalogs.push({
      sku: analog.sku,
      score,
      matchReasons,
      matchCriteria,
      salesData: {
        avgVelocity30d: Number(analog.salesVelocity.velocity30d),
        avgVelocity90d: Number(analog.salesVelocity.velocity90d),
      },
    })
  }

  // Sort by score and get best match
  scoredAnalogs.sort((a, b) => b.score - a.score)

  const bestMatch = scoredAnalogs[0]

  if (!bestMatch || bestMatch.score < config.minMatchScore) {
    return null
  }

  // Get first month velocity for the analog
  const firstMonthVelocity = await getFirstMonthVelocity(bestMatch.sku)

  return {
    analogSku: bestMatch.sku,
    matchScore: bestMatch.score,
    matchReasons: bestMatch.matchReasons,
    matchCriteria: bestMatch.matchCriteria,
    analogPerformance: {
      avgVelocity30d: bestMatch.salesData.avgVelocity30d,
      avgVelocity90d: bestMatch.salesData.avgVelocity90d,
      firstMonthVelocity,
    },
  }
}

/**
 * Get first month velocity for a SKU
 */
async function getFirstMonthVelocity(masterSku: string): Promise<number> {
  // Get first sale date
  const firstSale = await prisma.orderItem.findFirst({
    where: {
      masterSku,
      order: {
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
    orderBy: {
      order: { purchaseDate: 'asc' },
    },
    include: {
      order: { select: { purchaseDate: true } },
    },
  })

  if (!firstSale) return 0

  const startDate = firstSale.order.purchaseDate
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 30)

  // Get sales in first 30 days
  const sales = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku,
      order: {
        purchaseDate: {
          gte: startDate,
          lt: endDate,
        },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  const totalUnits = sales._sum.quantity || 0
  return totalUnits / 30
}

/**
 * Generate forecast for a new item
 */
export async function forecastNewItem(
  masterSku: string
): Promise<NewItemForecast> {
  const { isNew, daysSinceLaunch, launchDate } = await isNewItem(masterSku)

  // Find analog SKU
  const analog = await findAnalogSku(masterSku)

  // Determine watch status and check frequency
  let watchStatus: WatchStatus = 'normal'
  let checkFrequency: 'daily' | 'every_3_days' | 'weekly' = 'weekly'
  let nextCheckDate = new Date()

  if (isNew) {
    if (daysSinceLaunch <= 7) {
      watchStatus = 'high_watch'
      checkFrequency = 'daily'
      nextCheckDate.setDate(nextCheckDate.getDate() + 1)
    } else if (daysSinceLaunch <= 30) {
      watchStatus = 'high_watch'
      checkFrequency = 'every_3_days'
      nextCheckDate.setDate(nextCheckDate.getDate() + 3)
    } else {
      watchStatus = 'normal'
      checkFrequency = 'weekly'
      nextCheckDate.setDate(nextCheckDate.getDate() + 7)
    }
  }

  // Calculate base velocity from analog or default
  let baseVelocity = 1.0 // Conservative default
  let confidence = 0.3

  if (analog) {
    baseVelocity = analog.analogPerformance.firstMonthVelocity || 1.0
    confidence = analog.matchScore * 0.8 // Cap at 80% confidence for new items
  }

  // Apply seasonality adjustment
  const seasonalMultiplier = await getCurrentSeasonalityMultiplier(masterSku)
  const adjustedVelocity = baseVelocity * seasonalMultiplier

  // Check actual vs forecasted (if has sales)
  let actualVsForecasted: number | null = null
  let needsRecalibration = false

  if (daysSinceLaunch > 7) {
    const actualVelocity = await getActualVelocity(masterSku, 7)
    if (actualVelocity > 0) {
      actualVsForecasted = ((actualVelocity - baseVelocity) / baseVelocity) * 100

      // Recalibrate if >30% deviation in first 2 weeks
      if (daysSinceLaunch <= 14 && Math.abs(actualVsForecasted) > 30) {
        needsRecalibration = true
      }
    }
  }

  // Update SKU analytics
  await prisma.skuAnalytics.upsert({
    where: { masterSku },
    create: {
      masterSku,
      isNewItem: isNew,
      analogSku: analog?.analogSku || null,
      daysSinceLaunch,
      watchStatus,
    },
    update: {
      isNewItem: isNew,
      analogSku: analog?.analogSku || null,
      daysSinceLaunch,
      watchStatus,
    },
  })

  return {
    masterSku,
    isNewItem: isNew,
    daysSinceLaunch,
    watchStatus,
    analogSku: analog?.analogSku || null,
    analogMatchScore: analog?.matchScore || null,
    baseVelocity,
    adjustedVelocity,
    confidence,
    nextCheckDate,
    checkFrequency,
    actualVsForecasted,
    needsRecalibration,
  }
}

/**
 * Get current seasonality multiplier
 */
async function getCurrentSeasonalityMultiplier(
  masterSku: string
): Promise<number> {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()

  try {
    const events = await prisma.seasonalEvent.findMany({
      where: { isActive: true },
    })

    for (const event of events) {
      if (isDateInEvent(month, day, event)) {
        // Check for SKU-specific multiplier
        if (event.skuMultipliers) {
          const skuMults = JSON.parse(event.skuMultipliers)
          if (skuMults[masterSku]) {
            return skuMults[masterSku]
          }
        }
        return Number(event.baseMultiplier)
      }
    }
  } catch (error) {
    // Table might not exist
  }

  return 1.0
}

/**
 * Check if date is in event
 */
function isDateInEvent(
  month: number,
  day: number,
  event: { startMonth: number; startDay: number; endMonth: number; endDay: number }
): boolean {
  if (event.startMonth === event.endMonth) {
    return month === event.startMonth && day >= event.startDay && day <= event.endDay
  } else if (event.startMonth < event.endMonth) {
    return (
      (month === event.startMonth && day >= event.startDay) ||
      (month === event.endMonth && day <= event.endDay) ||
      (month > event.startMonth && month < event.endMonth)
    )
  } else {
    return (
      (month === event.startMonth && day >= event.startDay) ||
      (month === event.endMonth && day <= event.endDay) ||
      month > event.startMonth ||
      month < event.endMonth
    )
  }
}

/**
 * Get actual velocity for a SKU
 */
async function getActualVelocity(
  masterSku: string,
  days: number
): Promise<number> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const sales = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku,
      order: {
        purchaseDate: { gte: startDate },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  return (sales._sum.quantity || 0) / days
}

/**
 * Recalibrate new item forecast based on actual performance
 */
export async function recalibrateNewItemForecast(
  masterSku: string
): Promise<{
  previousVelocity: number
  newVelocity: number
  changePercent: number
  reason: string
}> {
  const forecast = await forecastNewItem(masterSku)

  if (!forecast.needsRecalibration) {
    return {
      previousVelocity: forecast.baseVelocity,
      newVelocity: forecast.baseVelocity,
      changePercent: 0,
      reason: 'No recalibration needed',
    }
  }

  // Get actual performance
  const actualVelocity = await getActualVelocity(masterSku, 7)

  // Blend analog forecast with actual performance
  // Weight actual more heavily if significantly different
  const previousVelocity = forecast.baseVelocity
  let newVelocity: number
  let reason: string

  if (actualVelocity > previousVelocity * 1.3) {
    // Outperforming - adjust upward
    newVelocity = previousVelocity * 0.3 + actualVelocity * 0.7
    reason = `Outperforming analog by ${Math.round(
      ((actualVelocity - previousVelocity) / previousVelocity) * 100
    )}% - adjusting forecast upward`
  } else if (actualVelocity < previousVelocity * 0.7) {
    // Underperforming - adjust downward
    newVelocity = previousVelocity * 0.3 + actualVelocity * 0.7
    reason = `Underperforming analog by ${Math.round(
      ((previousVelocity - actualVelocity) / previousVelocity) * 100
    )}% - adjusting forecast downward`
  } else {
    // Within range - minor adjustment
    newVelocity = previousVelocity * 0.5 + actualVelocity * 0.5
    reason = 'Performance within expected range - minor adjustment'
  }

  const changePercent =
    ((newVelocity - previousVelocity) / previousVelocity) * 100

  // Update SKU analytics
  await prisma.skuAnalytics.update({
    where: { masterSku },
    data: {
      velocity7d: actualVelocity,
      watchStatus: Math.abs(changePercent) > 50 ? 'critical' : 'high_watch',
    },
  })

  return {
    previousVelocity,
    newVelocity,
    changePercent,
    reason,
  }
}

/**
 * Check all new items and recalibrate if needed
 */
export async function checkAllNewItems(): Promise<{
  checkedCount: number
  recalibratedCount: number
  items: Array<{
    masterSku: string
    action: string
    details: string
  }>
}> {
  // Get all items marked as new
  const newItems = await prisma.skuAnalytics.findMany({
    where: { isNewItem: true },
  })

  const results: Array<{
    masterSku: string
    action: string
    details: string
  }> = []
  let recalibratedCount = 0

  for (const item of newItems) {
    const forecast = await forecastNewItem(item.masterSku)

    if (forecast.needsRecalibration) {
      const recalibration = await recalibrateNewItemForecast(item.masterSku)
      results.push({
        masterSku: item.masterSku,
        action: 'recalibrated',
        details: recalibration.reason,
      })
      recalibratedCount++
    } else if (!forecast.isNewItem) {
      // No longer new - update status
      await prisma.skuAnalytics.update({
        where: { masterSku: item.masterSku },
        data: {
          isNewItem: false,
          watchStatus: 'normal',
        },
      })
      results.push({
        masterSku: item.masterSku,
        action: 'graduated',
        details: `Now has ${forecast.daysSinceLaunch} days of history`,
      })
    } else {
      results.push({
        masterSku: item.masterSku,
        action: 'monitored',
        details: `Day ${forecast.daysSinceLaunch}, ${forecast.checkFrequency} checks`,
      })
    }
  }

  return {
    checkedCount: newItems.length,
    recalibratedCount,
    items: results,
  }
}

/**
 * Get new item summary
 */
export async function getNewItemSummary(): Promise<{
  totalNewItems: number
  highWatch: number
  needingRecalibration: number
  items: NewItemForecast[]
}> {
  const newItems = await prisma.skuAnalytics.findMany({
    where: { isNewItem: true },
  })

  const items: NewItemForecast[] = []
  let highWatch = 0
  let needingRecalibration = 0

  for (const item of newItems) {
    const forecast = await forecastNewItem(item.masterSku)
    items.push(forecast)

    if (forecast.watchStatus === 'high_watch' || forecast.watchStatus === 'critical') {
      highWatch++
    }
    if (forecast.needsRecalibration) {
      needingRecalibration++
    }
  }

  return {
    totalNewItems: items.length,
    highWatch,
    needingRecalibration,
    items,
  }
}
