/**
 * Ensemble Forecasting Engine
 *
 * Combines multiple forecasting models into an ensemble approach
 * that weighs models based on their historical accuracy per SKU.
 */

import { prisma } from '@/lib/prisma'
import {
  SalesDataPoint,
  ModelPrediction,
  EnsembleForecast,
  ModelWeights,
  ForecastModelType,
  SeasonalEvent,
  ForecastConfig,
} from '../types'
import { exponentialSmoothingForecast, exponentialSmoothingDaily } from '../models/exponential-smoothing'
import { prophetForecast, prophetDaily } from '../models/prophet-model'
import { lstmForecast, lstmDaily } from '../models/lstm-model'
import { arimaForecast, arimaDaily } from '../models/arima-model'

// Default ensemble configuration
const DEFAULT_CONFIG: ForecastConfig = {
  targets: {
    fba: 45,
    warehouse: 135,
    total: 180,
  },
  fbaReceivingDays: 10,
  fbaReceivingBuffer: 3,
  safetyStockZScore: {
    bestSeller: 2.33,
    regular: 1.65,
    slowMover: 1.28,
  },
  urgencyThresholds: {
    critical: 14,
    high: 30,
    medium: 60,
    low: 90,
  },
  newItemThresholds: {
    dailyCheckDays: 7,
    triDailyCheckDays: 30,
    recalibrationThreshold: 30,
  },
  spikeDetection: {
    threshold: 50,
    minConsecutiveDays: 3,
    decayPeriodDays: 60,
  },
  modelSettings: {
    minDataPoints: 30,
    lookbackDays: 730, // 2 years
    forecastHorizon: 90,
  },
}

// Default model weights (equal weighting)
const DEFAULT_WEIGHTS: Omit<ModelWeights, 'masterSku' | 'lastUpdated'> = {
  prophetWeight: 0.30,
  lstmWeight: 0.25,
  exponentialSmoothingWeight: 0.30,
  arimaWeight: 0.15,
  overallMape: null,
}

/**
 * Generate ensemble forecast for a SKU
 */
export async function generateEnsembleForecast(
  masterSku: string,
  salesData: SalesDataPoint[],
  daysAhead: number,
  seasonalEvents: SeasonalEvent[] = [],
  config: Partial<ForecastConfig> = {}
): Promise<EnsembleForecast[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }

  // Get model weights for this SKU
  const weights = await getModelWeights(masterSku)

  // Run all models in parallel
  const [
    exponentialResult,
    prophetResult,
    lstmResult,
    arimaResult,
  ] = await Promise.all([
    runModel('exponential_smoothing', salesData, daysAhead, seasonalEvents),
    runModel('prophet', salesData, daysAhead, seasonalEvents),
    runModel('lstm', salesData, daysAhead, seasonalEvents),
    runModel('arima', salesData, daysAhead, seasonalEvents),
  ])

  // Generate daily forecasts
  const exponentialDaily = exponentialSmoothingDaily(salesData, daysAhead)
  const prophetDailyResult = prophetDaily(salesData, daysAhead, seasonalEvents)
  const lstmDailyResult = lstmDaily(salesData, daysAhead)
  const arimaDailyResult = arimaDaily(salesData, daysAhead)

  // Get seasonality multipliers for each day
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const forecasts: EnsembleForecast[] = []

  for (let i = 0; i < daysAhead; i++) {
    const forecastDate = new Date(today)
    forecastDate.setDate(forecastDate.getDate() + i + 1)

    // Get individual model forecasts for this day
    const expForecast = exponentialDaily[i]?.forecast || exponentialResult.forecast
    const propForecast = prophetDailyResult[i]?.forecast || prophetResult.forecast
    const lstmForecastVal = lstmDailyResult[i]?.forecast || lstmResult.forecast
    const arimaForecastVal = arimaDailyResult[i]?.forecast || arimaResult.forecast

    // Calculate weighted ensemble forecast
    const baseForecast = calculateWeightedEnsemble(
      {
        exponential_smoothing: expForecast,
        prophet: propForecast,
        lstm: lstmForecastVal,
        arima: arimaForecastVal,
      },
      weights
    )

    // Get multipliers
    const seasonalityMultiplier = getSeasonalityMultiplier(forecastDate, masterSku, seasonalEvents)
    const dealMultiplier = await getDealMultiplier(masterSku, forecastDate)
    const spikeMultiplier = await getSpikeMultiplier(masterSku)

    // Calculate final forecast
    const finalForecast = baseForecast * seasonalityMultiplier * dealMultiplier * spikeMultiplier

    // Calculate ensemble confidence (weighted average of model confidences)
    const confidence = calculateEnsembleConfidence(
      {
        exponential_smoothing: exponentialDaily[i]?.confidence || exponentialResult.confidence,
        prophet: prophetDailyResult[i]?.confidence || prophetResult.confidence,
        lstm: lstmDailyResult[i]?.confidence || lstmResult.confidence,
        arima: arimaDailyResult[i]?.confidence || arimaResult.confidence,
      },
      weights
    )

    // Calculate safety stock for this forecast point
    const safetyStock = await calculateSafetyStock(masterSku, finalForecast, salesData)

    // Calculate bounds
    const boundsExpansion = 1 + (i / daysAhead) * 0.5 // Expand bounds for further forecasts
    const baseStdDev = calculateForecastStdDev([
      expForecast,
      propForecast,
      lstmForecastVal,
      arimaForecastVal,
    ])
    const upperBound = finalForecast + 1.96 * baseStdDev * boundsExpansion
    const lowerBound = Math.max(0, finalForecast - 1.96 * baseStdDev * boundsExpansion)

    // Build reasoning
    const reasoning = buildReasoning(
      baseForecast,
      finalForecast,
      seasonalityMultiplier,
      dealMultiplier,
      spikeMultiplier,
      weights
    )

    forecasts.push({
      date: forecastDate,
      baseForecast,
      finalForecast,
      confidence,
      prophetForecast: propForecast,
      lstmForecast: lstmForecastVal,
      exponentialSmoothingForecast: expForecast,
      arimaForecast: arimaForecastVal,
      seasonalityMultiplier,
      dealMultiplier,
      spikeMultiplier,
      safetyStock,
      recommendedInventory: Math.ceil(finalForecast + safetyStock),
      upperBound,
      lowerBound,
      reasoning,
    })
  }

  return forecasts
}

/**
 * Run a single forecasting model
 */
async function runModel(
  model: ForecastModelType,
  salesData: SalesDataPoint[],
  daysAhead: number,
  seasonalEvents: SeasonalEvent[]
): Promise<ModelPrediction> {
  try {
    switch (model) {
      case 'exponential_smoothing':
        return exponentialSmoothingForecast(salesData, daysAhead)
      case 'prophet':
        return prophetForecast(salesData, daysAhead, seasonalEvents)
      case 'lstm':
        return lstmForecast(salesData, daysAhead)
      case 'arima':
        return arimaForecast(salesData, daysAhead)
      default:
        throw new Error(`Unknown model: ${model}`)
    }
  } catch (error) {
    console.error(`Error running ${model} model:`, error)
    // Return zero forecast on error
    return {
      model,
      forecast: 0,
      confidence: 0,
      upperBound: 0,
      lowerBound: 0,
      factors: { base: 0, trend: 0, seasonality: 1 },
    }
  }
}

/**
 * Get model weights for a SKU (from database or default)
 */
async function getModelWeights(masterSku: string): Promise<ModelWeights> {
  try {
    const storedWeights = await prisma.modelWeight.findUnique({
      where: { masterSku },
    })

    if (storedWeights) {
      return {
        masterSku,
        prophetWeight: Number(storedWeights.prophetWeight),
        lstmWeight: Number(storedWeights.lstmWeight),
        exponentialSmoothingWeight: Number(storedWeights.exponentialSmoothingWeight),
        arimaWeight: 0.15, // Add ARIMA weight if not in schema
        overallMape: storedWeights.overallMape ? Number(storedWeights.overallMape) : null,
        lastUpdated: storedWeights.lastUpdated,
      }
    }
  } catch (error) {
    // Table might not exist yet
    console.warn('Could not fetch model weights:', error)
  }

  return {
    masterSku,
    ...DEFAULT_WEIGHTS,
    lastUpdated: new Date(),
  }
}

/**
 * Calculate weighted ensemble forecast
 */
function calculateWeightedEnsemble(
  forecasts: Record<string, number>,
  weights: ModelWeights
): number {
  // Normalize weights to sum to 1
  const totalWeight =
    weights.prophetWeight +
    weights.lstmWeight +
    weights.exponentialSmoothingWeight +
    weights.arimaWeight

  if (totalWeight === 0) {
    // Equal weighting fallback
    const validForecasts = Object.values(forecasts).filter((f) => f > 0)
    return validForecasts.length > 0
      ? validForecasts.reduce((a, b) => a + b, 0) / validForecasts.length
      : 0
  }

  const normalized = {
    prophet: weights.prophetWeight / totalWeight,
    lstm: weights.lstmWeight / totalWeight,
    exponential_smoothing: weights.exponentialSmoothingWeight / totalWeight,
    arima: weights.arimaWeight / totalWeight,
  }

  return (
    forecasts.prophet * normalized.prophet +
    forecasts.lstm * normalized.lstm +
    forecasts.exponential_smoothing * normalized.exponential_smoothing +
    forecasts.arima * normalized.arima
  )
}

/**
 * Calculate ensemble confidence
 */
function calculateEnsembleConfidence(
  confidences: Record<string, number>,
  weights: ModelWeights
): number {
  const totalWeight =
    weights.prophetWeight +
    weights.lstmWeight +
    weights.exponentialSmoothingWeight +
    weights.arimaWeight

  if (totalWeight === 0) {
    return Object.values(confidences).reduce((a, b) => a + b, 0) / 4
  }

  const normalized = {
    prophet: weights.prophetWeight / totalWeight,
    lstm: weights.lstmWeight / totalWeight,
    exponential_smoothing: weights.exponentialSmoothingWeight / totalWeight,
    arima: weights.arimaWeight / totalWeight,
  }

  return (
    confidences.prophet * normalized.prophet +
    confidences.lstm * normalized.lstm +
    confidences.exponential_smoothing * normalized.exponential_smoothing +
    confidences.arima * normalized.arima
  )
}

/**
 * Get seasonality multiplier for a date
 */
function getSeasonalityMultiplier(
  date: Date,
  masterSku: string,
  seasonalEvents: SeasonalEvent[]
): number {
  const month = date.getMonth() + 1
  const day = date.getDate()

  for (const event of seasonalEvents) {
    if (!event.isActive) continue

    // Check if date falls within event
    if (isDateInEvent(month, day, event)) {
      // Check for SKU-specific multiplier
      if (event.skuMultipliers && event.skuMultipliers[masterSku]) {
        return event.skuMultipliers[masterSku]
      }

      // Use learned multiplier if available (weighted average)
      if (event.learnedMultiplier) {
        return event.baseMultiplier * 0.4 + event.learnedMultiplier * 0.6
      }

      return event.baseMultiplier
    }
  }

  return 1.0
}

/**
 * Check if date falls within event
 */
function isDateInEvent(month: number, day: number, event: SeasonalEvent): boolean {
  if (event.startMonth === event.endMonth) {
    return month === event.startMonth && day >= event.startDay && day <= event.endDay
  } else if (event.startMonth < event.endMonth) {
    return (
      (month === event.startMonth && day >= event.startDay) ||
      (month === event.endMonth && day <= event.endDay) ||
      (month > event.startMonth && month < event.endMonth)
    )
  } else {
    // Crosses year boundary
    return (
      (month === event.startMonth && day >= event.startDay) ||
      (month === event.endMonth && day <= event.endDay) ||
      month > event.startMonth ||
      month < event.endMonth
    )
  }
}

/**
 * Get deal multiplier for a date (from scheduled deals)
 */
async function getDealMultiplier(masterSku: string, date: Date): Promise<number> {
  // TODO: Implement deal calendar integration
  // For now, check if there's a deal scheduled in the Deal table
  try {
    // This would query a Deals table when implemented
    return 1.0
  } catch (error) {
    return 1.0
  }
}

/**
 * Get spike multiplier (if SKU is currently spiking)
 */
async function getSpikeMultiplier(masterSku: string): Promise<number> {
  try {
    const analytics = await prisma.skuAnalytics.findUnique({
      where: { masterSku },
    })

    if (analytics?.isSpiking && analytics.spikeMultiplier) {
      return Number(analytics.spikeMultiplier)
    }
  } catch (error) {
    // Table might not exist
  }

  return 1.0
}

/**
 * Calculate safety stock based on demand variability
 */
async function calculateSafetyStock(
  masterSku: string,
  dailyForecast: number,
  salesData: SalesDataPoint[]
): Promise<number> {
  // Get product info for supplier lead time
  const product = await prisma.product.findUnique({
    where: { sku: masterSku },
    include: { supplier: true },
  })

  const leadTimeDays = product?.supplier?.leadTimeDays || 30

  // Calculate demand standard deviation
  const values = salesData.slice(-30).map((d) => d.units)
  const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : dailyForecast
  const variance =
    values.length > 0
      ? values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
      : dailyForecast * 0.3 // Assume 30% CV if no data
  const stdDev = Math.sqrt(variance)

  // Determine Z-score based on velocity (best sellers get higher service level)
  let zScore = DEFAULT_CONFIG.safetyStockZScore.regular
  if (dailyForecast > 10) {
    zScore = DEFAULT_CONFIG.safetyStockZScore.bestSeller
  } else if (dailyForecast < 1) {
    zScore = DEFAULT_CONFIG.safetyStockZScore.slowMover
  }

  // Safety stock formula: Z × σ × √L
  const safetyStock = zScore * stdDev * Math.sqrt(leadTimeDays)

  // Minimum safety stock: 7 days of sales
  return Math.ceil(Math.max(safetyStock, dailyForecast * 7))
}

/**
 * Calculate standard deviation of forecasts (model disagreement)
 */
function calculateForecastStdDev(forecasts: number[]): number {
  const validForecasts = forecasts.filter((f) => f > 0)
  if (validForecasts.length === 0) return 0

  const mean = validForecasts.reduce((a, b) => a + b, 0) / validForecasts.length
  const variance =
    validForecasts.reduce((sum, f) => sum + (f - mean) ** 2, 0) / validForecasts.length

  return Math.sqrt(variance)
}

/**
 * Build reasoning explanation
 */
function buildReasoning(
  baseForecast: number,
  finalForecast: number,
  seasonalityMultiplier: number,
  dealMultiplier: number,
  spikeMultiplier: number,
  weights: ModelWeights
): string[] {
  const reasoning: string[] = []

  // Explain base forecast
  reasoning.push(
    `Base forecast: ${baseForecast.toFixed(1)} units/day (ensemble of 4 models)`
  )

  // Explain model weights
  const topModel = getTopWeightedModel(weights)
  reasoning.push(
    `Primary model: ${topModel.name} (${(topModel.weight * 100).toFixed(0)}% weight)`
  )

  // Explain multipliers
  if (seasonalityMultiplier !== 1.0) {
    reasoning.push(
      `Seasonality: ${seasonalityMultiplier.toFixed(2)}x (${
        seasonalityMultiplier > 1 ? 'peak' : 'slow'
      } season)`
    )
  }

  if (dealMultiplier !== 1.0) {
    reasoning.push(`Deal impact: ${dealMultiplier.toFixed(2)}x`)
  }

  if (spikeMultiplier !== 1.0) {
    reasoning.push(`Spike adjustment: ${spikeMultiplier.toFixed(2)}x`)
  }

  // Final forecast
  if (finalForecast !== baseForecast) {
    reasoning.push(`Final forecast: ${finalForecast.toFixed(1)} units/day`)
  }

  return reasoning
}

/**
 * Get the highest weighted model
 */
function getTopWeightedModel(weights: ModelWeights): { name: string; weight: number } {
  const models = [
    { name: 'Prophet', weight: weights.prophetWeight },
    { name: 'LSTM', weight: weights.lstmWeight },
    { name: 'Exponential Smoothing', weight: weights.exponentialSmoothingWeight },
    { name: 'ARIMA', weight: weights.arimaWeight },
  ]

  return models.reduce((best, current) =>
    current.weight > best.weight ? current : best
  )
}

/**
 * Generate aggregated forecast (single forecast for a period)
 */
export async function generateAggregatedForecast(
  masterSku: string,
  salesData: SalesDataPoint[],
  daysAhead: number,
  seasonalEvents: SeasonalEvent[] = []
): Promise<{
  totalUnits: number
  dailyAverage: number
  confidence: number
  peakDay: Date
  lowDay: Date
  reasoning: string[]
}> {
  const forecasts = await generateEnsembleForecast(
    masterSku,
    salesData,
    daysAhead,
    seasonalEvents
  )

  const totalUnits = forecasts.reduce((sum, f) => sum + f.finalForecast, 0)
  const dailyAverage = totalUnits / daysAhead
  const avgConfidence = forecasts.reduce((sum, f) => sum + f.confidence, 0) / forecasts.length

  // Find peak and low days
  const sortedByForecast = [...forecasts].sort(
    (a, b) => b.finalForecast - a.finalForecast
  )
  const peakDay = sortedByForecast[0]?.date || new Date()
  const lowDay = sortedByForecast[sortedByForecast.length - 1]?.date || new Date()

  // Aggregate reasoning
  const reasoning = [
    `Total forecasted units: ${Math.round(totalUnits)} over ${daysAhead} days`,
    `Daily average: ${dailyAverage.toFixed(1)} units/day`,
    `Forecast confidence: ${(avgConfidence * 100).toFixed(0)}%`,
    `Peak demand day: ${peakDay.toLocaleDateString()}`,
    `Lowest demand day: ${lowDay.toLocaleDateString()}`,
  ]

  // Check for seasonal events in period
  const eventsInPeriod = forecasts.filter((f) => f.seasonalityMultiplier > 1.1)
  if (eventsInPeriod.length > 0) {
    reasoning.push(
      `${eventsInPeriod.length} days with seasonal uplift (${(
        eventsInPeriod[0].seasonalityMultiplier * 100 - 100
      ).toFixed(0)}% increase)`
    )
  }

  return {
    totalUnits,
    dailyAverage,
    confidence: avgConfidence,
    peakDay,
    lowDay,
    reasoning,
  }
}

/**
 * Compare model performance for a SKU
 */
export async function compareModelPerformance(
  masterSku: string,
  salesData: SalesDataPoint[],
  validationDays: number = 30
): Promise<Record<ForecastModelType, { mape: number; bias: number }>> {
  if (salesData.length < validationDays + 30) {
    // Not enough data for validation
    return {
      prophet: { mape: 0, bias: 0 },
      lstm: { mape: 0, bias: 0 },
      exponential_smoothing: { mape: 0, bias: 0 },
      arima: { mape: 0, bias: 0 },
      ensemble: { mape: 0, bias: 0 },
    }
  }

  // Split data
  const trainingData = salesData.slice(0, -validationDays)
  const validationData = salesData.slice(-validationDays)

  // Get forecasts from each model
  const [expResult, prophetResult, lstmResult, arimaResult] = await Promise.all([
    exponentialSmoothingDaily(trainingData, validationDays),
    prophetDaily(trainingData, validationDays),
    lstmDaily(trainingData, validationDays),
    arimaDaily(trainingData, validationDays),
  ])

  // Calculate MAPE and bias for each model
  const calculateMetrics = (
    forecasts: Array<{ forecast: number }>,
    actuals: SalesDataPoint[]
  ): { mape: number; bias: number } => {
    let totalError = 0
    let totalBias = 0
    let count = 0

    for (let i = 0; i < Math.min(forecasts.length, actuals.length); i++) {
      const forecast = forecasts[i].forecast
      const actual = actuals[i].units

      if (actual > 0) {
        totalError += Math.abs(forecast - actual) / actual
        totalBias += (forecast - actual) / actual
        count++
      }
    }

    return {
      mape: count > 0 ? totalError / count : 0,
      bias: count > 0 ? totalBias / count : 0,
    }
  }

  return {
    exponential_smoothing: calculateMetrics(expResult, validationData),
    prophet: calculateMetrics(prophetResult, validationData),
    lstm: calculateMetrics(lstmResult, validationData),
    arima: calculateMetrics(arimaResult, validationData),
    ensemble: { mape: 0, bias: 0 }, // Will be calculated separately
  }
}
