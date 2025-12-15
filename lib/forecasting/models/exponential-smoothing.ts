/**
 * Exponential Smoothing Model
 *
 * Implements Holt-Winters triple exponential smoothing for forecasting
 * with trend and seasonality components.
 */

import { SalesDataPoint, ModelPrediction } from '../types'

interface ExponentialSmoothingParams {
  alpha: number // Level smoothing (0-1)
  beta: number  // Trend smoothing (0-1)
  gamma: number // Seasonal smoothing (0-1)
  seasonalPeriod: number // Days in seasonal cycle (default 7 for weekly)
}

interface SmoothedValues {
  level: number
  trend: number
  seasonal: number[]
}

const DEFAULT_PARAMS: ExponentialSmoothingParams = {
  alpha: 0.3,  // Responsive to recent changes
  beta: 0.1,   // Slow-changing trend
  gamma: 0.2,  // Moderate seasonal adjustment
  seasonalPeriod: 7,
}

/**
 * Triple Exponential Smoothing (Holt-Winters)
 *
 * Combines:
 * - Level (smoothed average)
 * - Trend (direction and magnitude)
 * - Seasonality (weekly patterns)
 */
export function exponentialSmoothingForecast(
  salesData: SalesDataPoint[],
  daysAhead: number,
  params: Partial<ExponentialSmoothingParams> = {}
): ModelPrediction {
  const config = { ...DEFAULT_PARAMS, ...params }

  if (salesData.length < config.seasonalPeriod * 2) {
    // Not enough data for seasonal - use simple exponential smoothing
    return simpleExponentialSmoothing(salesData, daysAhead, config.alpha)
  }

  // Initialize components
  const smoothed = initializeComponents(salesData, config)

  // Process all historical data to update components
  for (let i = config.seasonalPeriod; i < salesData.length; i++) {
    const actual = salesData[i].units
    const seasonIndex = i % config.seasonalPeriod

    // Previous values
    const prevLevel = smoothed.level
    const prevTrend = smoothed.trend
    const prevSeasonal = smoothed.seasonal[seasonIndex]

    // Update level
    smoothed.level =
      config.alpha * (actual / prevSeasonal) +
      (1 - config.alpha) * (prevLevel + prevTrend)

    // Update trend
    smoothed.trend =
      config.beta * (smoothed.level - prevLevel) +
      (1 - config.beta) * prevTrend

    // Update seasonal
    smoothed.seasonal[seasonIndex] =
      config.gamma * (actual / smoothed.level) +
      (1 - config.gamma) * prevSeasonal
  }

  // Generate forecast
  const forecasts: number[] = []
  for (let h = 1; h <= daysAhead; h++) {
    const seasonIndex = (salesData.length + h - 1) % config.seasonalPeriod
    const forecast =
      (smoothed.level + h * smoothed.trend) * smoothed.seasonal[seasonIndex]
    forecasts.push(Math.max(0, forecast))
  }

  // Calculate average forecast for the period
  const avgForecast = forecasts.reduce((a, b) => a + b, 0) / forecasts.length

  // Calculate confidence based on data stability
  const confidence = calculateConfidence(salesData, smoothed)

  // Calculate bounds (using historical error std dev)
  const errorStdDev = calculateErrorStdDev(salesData, smoothed, config)
  const upperBound = avgForecast + 1.96 * errorStdDev * Math.sqrt(daysAhead)
  const lowerBound = Math.max(0, avgForecast - 1.96 * errorStdDev * Math.sqrt(daysAhead))

  return {
    model: 'exponential_smoothing',
    forecast: avgForecast,
    confidence,
    upperBound,
    lowerBound,
    factors: {
      base: smoothed.level,
      trend: smoothed.trend,
      seasonality: smoothed.seasonal.reduce((a, b) => a + b, 0) / smoothed.seasonal.length,
    },
  }
}

/**
 * Simple Exponential Smoothing (for limited data)
 */
function simpleExponentialSmoothing(
  salesData: SalesDataPoint[],
  daysAhead: number,
  alpha: number
): ModelPrediction {
  if (salesData.length === 0) {
    return {
      model: 'exponential_smoothing',
      forecast: 0,
      confidence: 0,
      upperBound: 0,
      lowerBound: 0,
      factors: { base: 0, trend: 0, seasonality: 1 },
    }
  }

  // Simple exponential smoothing
  let smoothedValue = salesData[0].units
  for (let i = 1; i < salesData.length; i++) {
    smoothedValue = alpha * salesData[i].units + (1 - alpha) * smoothedValue
  }

  // Calculate trend from last 7 days
  const recent7d = salesData.slice(-7)
  const older7d = salesData.slice(-14, -7)

  let trend = 0
  if (older7d.length > 0) {
    const recentAvg = recent7d.reduce((s, d) => s + d.units, 0) / recent7d.length
    const olderAvg = older7d.reduce((s, d) => s + d.units, 0) / older7d.length
    trend = (recentAvg - olderAvg) / 7
  }

  // Forecast with trend decay
  const forecast = smoothedValue + trend * (daysAhead / 2)

  // Low confidence due to limited data
  const confidence = Math.min(0.6, salesData.length / 60)

  // Simple bounds
  const variance = calculateVariance(salesData.map((d) => d.units))
  const stdDev = Math.sqrt(variance)
  const upperBound = forecast + 1.96 * stdDev
  const lowerBound = Math.max(0, forecast - 1.96 * stdDev)

  return {
    model: 'exponential_smoothing',
    forecast: Math.max(0, forecast),
    confidence,
    upperBound,
    lowerBound,
    factors: {
      base: smoothedValue,
      trend,
      seasonality: 1,
    },
  }
}

/**
 * Initialize Holt-Winters components
 */
function initializeComponents(
  salesData: SalesDataPoint[],
  config: ExponentialSmoothingParams
): SmoothedValues {
  const { seasonalPeriod } = config

  // Initial level: average of first season
  const firstSeason = salesData.slice(0, seasonalPeriod)
  const initialLevel =
    firstSeason.reduce((s, d) => s + d.units, 0) / seasonalPeriod

  // Initial trend: average change between first two seasons
  const secondSeason = salesData.slice(seasonalPeriod, seasonalPeriod * 2)
  let initialTrend = 0

  if (secondSeason.length === seasonalPeriod) {
    const secondLevel =
      secondSeason.reduce((s, d) => s + d.units, 0) / seasonalPeriod
    initialTrend = (secondLevel - initialLevel) / seasonalPeriod
  }

  // Initial seasonal indices
  const seasonal: number[] = []
  for (let i = 0; i < seasonalPeriod; i++) {
    const values = salesData
      .filter((_, idx) => idx % seasonalPeriod === i)
      .map((d) => d.units)

    if (values.length > 0 && initialLevel > 0) {
      seasonal[i] = values.reduce((a, b) => a + b, 0) / values.length / initialLevel
    } else {
      seasonal[i] = 1
    }
  }

  // Normalize seasonal indices to average 1.0
  const seasonalSum = seasonal.reduce((a, b) => a + b, 0)
  const normalizedSeasonal = seasonal.map((s) => (s * seasonalPeriod) / seasonalSum)

  return {
    level: initialLevel,
    trend: initialTrend,
    seasonal: normalizedSeasonal,
  }
}

/**
 * Calculate forecast confidence
 */
function calculateConfidence(
  salesData: SalesDataPoint[],
  smoothed: SmoothedValues
): number {
  // Factors affecting confidence:
  // 1. Data quantity
  const dataScore = Math.min(1, salesData.length / 90) // Full confidence at 90 days

  // 2. Stability (low variance = high confidence)
  const values = salesData.map((d) => d.units)
  const variance = calculateVariance(values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1 // Coefficient of variation
  const stabilityScore = Math.max(0, 1 - cv)

  // 3. Trend consistency
  const trendScore = Math.abs(smoothed.trend) < smoothed.level * 0.1 ? 0.9 : 0.7

  // Combined score
  return dataScore * 0.4 + stabilityScore * 0.4 + trendScore * 0.2
}

/**
 * Calculate error standard deviation for confidence bounds
 */
function calculateErrorStdDev(
  salesData: SalesDataPoint[],
  smoothed: SmoothedValues,
  config: ExponentialSmoothingParams
): number {
  if (salesData.length < config.seasonalPeriod * 2) {
    return calculateVariance(salesData.map((d) => d.units)) ** 0.5
  }

  // Calculate one-step-ahead forecast errors
  const errors: number[] = []
  let level = smoothed.level
  let trend = smoothed.trend
  const seasonal = [...smoothed.seasonal]

  for (let i = config.seasonalPeriod; i < salesData.length - 1; i++) {
    const seasonIndex = i % config.seasonalPeriod
    const forecast = (level + trend) * seasonal[seasonIndex]
    const actual = salesData[i + 1].units
    errors.push(actual - forecast)

    // Update components
    const prevLevel = level
    level =
      config.alpha * (actual / seasonal[seasonIndex]) +
      (1 - config.alpha) * (level + trend)
    trend = config.beta * (level - prevLevel) + (1 - config.beta) * trend
    seasonal[seasonIndex] =
      config.gamma * (actual / level) + (1 - config.gamma) * seasonal[seasonIndex]
  }

  if (errors.length === 0) return 1

  return Math.sqrt(calculateVariance(errors))
}

/**
 * Calculate variance of an array
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length
}

/**
 * Forecast daily values for a specific horizon
 */
export function exponentialSmoothingDaily(
  salesData: SalesDataPoint[],
  daysAhead: number,
  params: Partial<ExponentialSmoothingParams> = {}
): Array<{ date: Date; forecast: number; confidence: number }> {
  const config = { ...DEFAULT_PARAMS, ...params }

  if (salesData.length < config.seasonalPeriod * 2) {
    // Simple forecast for limited data
    const prediction = simpleExponentialSmoothing(salesData, 1, config.alpha)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return Array.from({ length: daysAhead }, (_, i) => {
      const date = new Date(today)
      date.setDate(date.getDate() + i + 1)
      return {
        date,
        forecast: prediction.forecast,
        confidence: prediction.confidence * Math.pow(0.99, i), // Decay confidence
      }
    })
  }

  // Full Holt-Winters forecast
  const smoothed = initializeComponents(salesData, config)

  // Update components with all historical data
  for (let i = config.seasonalPeriod; i < salesData.length; i++) {
    const actual = salesData[i].units
    const seasonIndex = i % config.seasonalPeriod

    const prevLevel = smoothed.level
    const prevSeasonal = smoothed.seasonal[seasonIndex]

    smoothed.level =
      config.alpha * (actual / prevSeasonal) +
      (1 - config.alpha) * (prevLevel + smoothed.trend)

    smoothed.trend =
      config.beta * (smoothed.level - prevLevel) +
      (1 - config.beta) * smoothed.trend

    smoothed.seasonal[seasonIndex] =
      config.gamma * (actual / smoothed.level) +
      (1 - config.gamma) * prevSeasonal
  }

  // Generate forecasts
  const baseConfidence = calculateConfidence(salesData, smoothed)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Array.from({ length: daysAhead }, (_, i) => {
    const h = i + 1
    const seasonIndex = (salesData.length + h - 1) % config.seasonalPeriod
    const forecast =
      (smoothed.level + h * smoothed.trend) * smoothed.seasonal[seasonIndex]

    const date = new Date(today)
    date.setDate(date.getDate() + h)

    return {
      date,
      forecast: Math.max(0, forecast),
      confidence: baseConfidence * Math.pow(0.995, i), // Gradual confidence decay
    }
  })
}

/**
 * Optimize smoothing parameters using historical data
 */
export function optimizeParameters(
  salesData: SalesDataPoint[],
  validationDays: number = 30
): ExponentialSmoothingParams {
  if (salesData.length < validationDays + 60) {
    return DEFAULT_PARAMS
  }

  const trainingData = salesData.slice(0, -validationDays)
  const validationData = salesData.slice(-validationDays)

  let bestParams = DEFAULT_PARAMS
  let bestMape = Infinity

  // Grid search over parameter space
  const alphaRange = [0.1, 0.2, 0.3, 0.4, 0.5]
  const betaRange = [0.05, 0.1, 0.15, 0.2]
  const gammaRange = [0.1, 0.2, 0.3, 0.4]

  for (const alpha of alphaRange) {
    for (const beta of betaRange) {
      for (const gamma of gammaRange) {
        const params = { ...DEFAULT_PARAMS, alpha, beta, gamma }
        const mape = calculateMape(trainingData, validationData, params)

        if (mape < bestMape) {
          bestMape = mape
          bestParams = params
        }
      }
    }
  }

  return bestParams
}

/**
 * Calculate MAPE for parameter optimization
 */
function calculateMape(
  trainingData: SalesDataPoint[],
  validationData: SalesDataPoint[],
  params: ExponentialSmoothingParams
): number {
  // Train model
  const smoothed = initializeComponents(trainingData, params)

  for (let i = params.seasonalPeriod; i < trainingData.length; i++) {
    const actual = trainingData[i].units
    const seasonIndex = i % params.seasonalPeriod

    const prevLevel = smoothed.level
    const prevSeasonal = smoothed.seasonal[seasonIndex]

    smoothed.level =
      params.alpha * (actual / prevSeasonal) +
      (1 - params.alpha) * (prevLevel + smoothed.trend)

    smoothed.trend =
      params.beta * (smoothed.level - prevLevel) +
      (1 - params.beta) * smoothed.trend

    smoothed.seasonal[seasonIndex] =
      params.gamma * (actual / smoothed.level) +
      (1 - params.gamma) * prevSeasonal
  }

  // Calculate errors on validation set
  let totalError = 0
  let count = 0

  for (let i = 0; i < validationData.length; i++) {
    const seasonIndex = (trainingData.length + i) % params.seasonalPeriod
    const forecast =
      (smoothed.level + (i + 1) * smoothed.trend) * smoothed.seasonal[seasonIndex]
    const actual = validationData[i].units

    if (actual > 0) {
      totalError += Math.abs(forecast - actual) / actual
      count++
    }
  }

  return count > 0 ? totalError / count : Infinity
}
