/**
 * Advanced Inventory Forecasting Engine
 * 
 * This module implements multiple forecasting models and combines them
 * into an ensemble approach that self-improves over time.
 */

import { prisma } from '@/lib/prisma'

export interface ForecastResult {
  date: Date
  baseForecast: number
  finalForecast: number
  confidence: number
  seasonalityMultiplier: number
  safetyStock: number
  recommendedInventory: number
}

export interface ForecastParams {
  masterSku: string
  location: 'fba' | 'warehouse' | 'total'
  daysAhead: number
  includeSeasonality?: boolean
  includeDeals?: boolean
}

/**
 * Main forecasting function - generates forecasts for a SKU
 */
export async function generateForecast(params: ForecastParams): Promise<ForecastResult[]> {
  const { masterSku, location, daysAhead, includeSeasonality = true, includeDeals = true } = params

  // Check if prisma is available
  if (!prisma) {
    throw new Error('Prisma client not initialized')
  }

  // Check if dailyProfit model exists
  if (!prisma.dailyProfit) {
    throw new Error('DailyProfit model not found. Please run: npx prisma generate')
  }

  // Get historical sales data (last 2 years)
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  
  let salesData: any[] = []
  try {
    salesData = await prisma.dailyProfit.findMany({
      where: {
        masterSku,
        date: {
          gte: twoYearsAgo,
        },
      },
      orderBy: {
        date: 'asc',
      },
    })
  } catch (error: any) {
    console.error('Error fetching sales data:', error)
    throw new Error(`Failed to fetch sales data: ${error.message}`)
  }

  if (salesData.length === 0) {
    // New item - use analog SKU approach
    return await forecastNewItem(params)
  }

  // Calculate base velocity (units per day)
  const velocity30d = calculateVelocity(salesData, 30)
  const velocity90d = calculateVelocity(salesData, 90)

  // Generate forecasts for each day
  const forecasts: ForecastResult[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 1; i <= daysAhead; i++) {
    const forecastDate = new Date(today)
    forecastDate.setDate(today.getDate() + i)

    // Base forecast using exponential smoothing
    const baseForecast = exponentialSmoothing(salesData, velocity30d, velocity90d, i)

    // Apply seasonality multiplier
    let seasonalityMultiplier = 1.0
    if (includeSeasonality) {
      seasonalityMultiplier = await getSeasonalityMultiplier(masterSku, forecastDate)
    }

    // Apply deal multiplier (if deals are scheduled)
    let dealMultiplier = 1.0
    if (includeDeals) {
      dealMultiplier = await getDealMultiplier(masterSku, forecastDate)
    }

    // Calculate final forecast
    const finalForecast = baseForecast * seasonalityMultiplier * dealMultiplier

    // Calculate confidence (higher for established SKUs with stable patterns)
    const confidence = calculateConfidence(salesData, velocity30d, velocity90d)

    // Calculate safety stock
    const safetyStock = await calculateSafetyStock(masterSku, velocity30d, salesData)

    // Recommended inventory = forecast + safety stock
    const recommendedInventory = Math.ceil(finalForecast + Number(safetyStock))

    // Ensure all numeric values are valid numbers
    const safeBaseForecast = Number(baseForecast) || 0
    const safeFinalForecast = Number(finalForecast) || 0
    const safeConfidence = Number(confidence) || 0
    const safeSeasonalityMultiplier = Number(seasonalityMultiplier) || 1
    const safeSafetyStock = Number(safetyStock) || 0
    const safeRecommendedInventory = Number(recommendedInventory) || 0

    forecasts.push({
      date: forecastDate,
      baseForecast: safeBaseForecast,
      finalForecast: safeFinalForecast,
      confidence: safeConfidence,
      seasonalityMultiplier: safeSeasonalityMultiplier,
      safetyStock: safeSafetyStock,
      recommendedInventory: safeRecommendedInventory,
    })
  }

  return forecasts
}

/**
 * Calculate sales velocity (units per day) for a given period
 */
function calculateVelocity(salesData: any[], days: number): number {
  if (salesData.length === 0) return 0

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const recentSales = salesData.filter(s => new Date(s.date) >= cutoffDate)
  if (recentSales.length === 0) return 0

  const totalUnits = recentSales.reduce((sum, s) => sum + Number(s.unitsSold || 0), 0)
  return totalUnits / days
}

/**
 * Exponential smoothing forecast
 * Uses weighted average of recent trends
 */
function exponentialSmoothing(
  salesData: any[],
  velocity30d: number,
  velocity90d: number,
  daysAhead: number
): number {
  // Weight recent velocity more heavily (70% 30-day, 30% 90-day)
  const baseVelocity = velocity30d * 0.7 + velocity90d * 0.3

  // Apply trend (if velocity is increasing/decreasing)
  const trend = velocity30d > velocity90d ? 1.05 : velocity30d < velocity90d ? 0.95 : 1.0

  // Forecast = base velocity * trend^daysAhead
  return baseVelocity * Math.pow(trend, daysAhead / 30)
}

/**
 * Get seasonality multiplier for a specific date
 */
async function getSeasonalityMultiplier(masterSku: string, date: Date): Promise<number> {
  // Get active seasonal events (if table exists)
  let seasonalEvents: any[] = []
  try {
    seasonalEvents = await prisma.seasonalEvent.findMany({
      where: {
        isActive: true,
      },
    })
  } catch (error: any) {
    // Table doesn't exist yet - return default multiplier
    if (error.message?.includes('does not exist') || error.message?.includes('Unknown table')) {
      return 1.0
    }
    throw error
  }

  const month = date.getMonth() + 1 // 1-12
  const day = date.getDate()

  for (const event of seasonalEvents) {
    // Check if date falls within event range
    if (isDateInRange(month, day, event.startMonth, event.startDay, event.endMonth, event.endDay)) {
      // Check for SKU-specific multiplier
      let multiplier = Number(event.baseMultiplier)
      
      if (event.skuMultipliers) {
        try {
          const skuMultipliers = JSON.parse(event.skuMultipliers)
          if (skuMultipliers[masterSku]) {
            multiplier = skuMultipliers[masterSku]
          }
        } catch (e) {
          // Invalid JSON, use base multiplier
        }
      }

      // Use learned multiplier if available (weighted average)
      if (event.learnedMultiplier) {
        multiplier = Number(event.baseMultiplier) * 0.4 + Number(event.learnedMultiplier) * 0.6
      }

      return multiplier
    }
  }

  return 1.0 // No seasonal event
}

/**
 * Check if a date falls within a seasonal event range
 */
function isDateInRange(
  month: number,
  day: number,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number
): boolean {
  // Simple check - could be improved for year boundaries
  if (startMonth === endMonth) {
    return month === startMonth && day >= startDay && day <= endDay
  } else if (startMonth < endMonth) {
    return (
      (month === startMonth && day >= startDay) ||
      (month === endMonth && day <= endDay) ||
      (month > startMonth && month < endMonth)
    )
  } else {
    // Crosses year boundary (e.g., Dec 15 - Jan 15)
    return (
      (month === startMonth && day >= startDay) ||
      (month === endMonth && day <= endDay) ||
      month > startMonth ||
      month < endMonth
    )
  }
}

/**
 * Get deal multiplier if a deal is scheduled
 */
async function getDealMultiplier(masterSku: string, date: Date): Promise<number> {
  // TODO: Integrate with Amazon deals API
  // For now, return 1.0 (no deal impact)
  return 1.0
}

/**
 * Calculate forecast confidence (0-1)
 */
function calculateConfidence(salesData: any[], velocity30d: number, velocity90d: number): number {
  if (salesData.length < 30) return 0.5 // Low confidence for new items

  // Higher confidence if velocity is stable
  const variance = Math.abs(velocity30d - velocity90d) / Math.max(velocity90d, 1)
  const stabilityScore = Math.max(0, 1 - variance)

  // Higher confidence with more data
  const dataScore = Math.min(1, salesData.length / 365) // Full year = 1.0

  // Combine scores
  return (stabilityScore * 0.6 + dataScore * 0.4)
}

/**
 * Calculate safety stock using standard formula
 * Safety Stock = Z-score × Standard Deviation of Demand × √Lead Time
 */
async function calculateSafetyStock(
  masterSku: string,
  velocity30d: number,
  salesData: any[]
): Promise<number> {
  // Get product to find supplier
  const product = await prisma.product.findUnique({
    where: { sku: masterSku },
    include: {
      supplier: true,
    },
  })
  
  // Try to get supplier performance if table exists
  let supplierPerformance: any = null
  if (product?.supplier) {
    try {
      supplierPerformance = await prisma.supplierPerformance.findUnique({
        where: { supplierId: product.supplier.id },
      })
    } catch (error: any) {
      // Table doesn't exist yet - that's okay
      if (!error.message?.includes('does not exist') && !error.message?.includes('Unknown table')) {
        throw error
      }
    }
  }

  if (!product || !product.supplier) {
    // Default safety stock: 14 days
    return Math.ceil(velocity30d * 14)
  }

  // Get actual lead time (prefer performance data over stated)
  let leadTimeDays = product.supplier.leadTimeDays || 30
  if (supplierPerformance?.avgActualLeadTimeDays) {
    leadTimeDays = Number(supplierPerformance.avgActualLeadTimeDays)
  }

  // Calculate demand standard deviation
  const demandStdDev = calculateDemandStdDev(salesData, 30)

  // Z-score based on SKU importance (default: 1.65 = 95% service level)
  const zScore = 1.65

  // Safety stock formula
  const safetyStock = zScore * demandStdDev * Math.sqrt(leadTimeDays)

  return Math.ceil(Math.max(safetyStock, velocity30d * 7)) // Minimum 7 days
}

/**
 * Calculate standard deviation of demand
 */
function calculateDemandStdDev(salesData: any[], days: number): number {
  if (salesData.length < days) return 0

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const recentSales = salesData
    .filter(s => new Date(s.date) >= cutoffDate)
    .map(s => Number(s.unitsSold || 0))

  if (recentSales.length === 0) return 0

  const mean = recentSales.reduce((a, b) => a + b, 0) / recentSales.length
  const variance = recentSales.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentSales.length

  return Math.sqrt(variance)
}

/**
 * Forecast for new items using analog SKU approach
 */
async function forecastNewItem(params: ForecastParams): Promise<ForecastResult[]> {
  const { masterSku, daysAhead } = params

  // Get product to find analog SKU
  const product = await prisma.product.findUnique({
    where: { sku: masterSku },
  })

  if (!product || !product.analogSkuId) {
    // No analog - use conservative default
    const defaultVelocity = 1.0 // 1 unit per day
    return generateDefaultForecast(defaultVelocity, daysAhead)
  }

  // Get analog SKU's first 30 days of sales
  const analogSales = await prisma.dailyProfit.findMany({
    where: {
      masterSku: product.analogSkuId,
    },
    orderBy: {
      date: 'asc',
    },
    take: 30,
  })

  if (analogSales.length === 0) {
    const defaultVelocity = 1.0
    return generateDefaultForecast(defaultVelocity, daysAhead)
  }

  // Use analog's average velocity
  const analogVelocity = analogSales.reduce((sum, s) => sum + Number(s.unitsSold || 0), 0) / analogSales.length

  // Apply current seasonality
  const today = new Date()
  const seasonalityMultiplier = await getSeasonalityMultiplier(masterSku, today)

  // Lower confidence for new items
  const confidence = 0.3

  const forecasts: ForecastResult[] = []
  for (let i = 1; i <= daysAhead; i++) {
    const forecastDate = new Date(today)
    forecastDate.setDate(today.getDate() + i)

    const baseForecast = analogVelocity
    const finalForecast = baseForecast * seasonalityMultiplier
    const safetyStock = Math.ceil(analogVelocity * 14) // 14 days safety stock for new items

    forecasts.push({
      date: forecastDate,
      baseForecast,
      finalForecast,
      confidence,
      seasonalityMultiplier,
      safetyStock,
      recommendedInventory: Math.ceil(finalForecast + safetyStock),
    })
  }

  return forecasts
}

/**
 * Generate default forecast when no data available
 */
function generateDefaultForecast(velocity: number, daysAhead: number): ForecastResult[] {
  const forecasts: ForecastResult[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 1; i <= daysAhead; i++) {
    const forecastDate = new Date(today)
    forecastDate.setDate(today.getDate() + i)

    forecasts.push({
      date: forecastDate,
      baseForecast: velocity,
      finalForecast: velocity,
      confidence: 0.2,
      seasonalityMultiplier: 1.0,
      safetyStock: Math.ceil(velocity * 14),
      recommendedInventory: Math.ceil(velocity * 15),
    })
  }

  return forecasts
}

