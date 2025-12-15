/**
 * ARIMA Model (AutoRegressive Integrated Moving Average)
 *
 * Implements a simplified ARIMA(p,d,q) model for time series forecasting:
 * - AR (AutoRegressive): past values predict future values
 * - I (Integrated): differencing to achieve stationarity
 * - MA (Moving Average): past forecast errors predict future values
 */

import { SalesDataPoint, ModelPrediction } from '../types'

interface ArimaParams {
  p: number  // AR order (number of lag observations)
  d: number  // Differencing order
  q: number  // MA order (size of moving average window)
  seasonalP: number // Seasonal AR
  seasonalD: number // Seasonal differencing
  seasonalQ: number // Seasonal MA
  seasonalPeriod: number // Seasonal period (7 for weekly)
}

interface ArimaCoefficients {
  arCoeffs: number[]
  maCoeffs: number[]
  seasonalArCoeffs: number[]
  seasonalMaCoeffs: number[]
  intercept: number
}

const DEFAULT_PARAMS: ArimaParams = {
  p: 2,  // 2 AR terms
  d: 1,  // 1 differencing
  q: 1,  // 1 MA term
  seasonalP: 1,
  seasonalD: 1,
  seasonalQ: 1,
  seasonalPeriod: 7,
}

/**
 * ARIMA forecasting
 */
export function arimaForecast(
  salesData: SalesDataPoint[],
  daysAhead: number,
  params: Partial<ArimaParams> = {}
): ModelPrediction {
  const config = { ...DEFAULT_PARAMS, ...params }

  if (salesData.length < Math.max(config.p, config.q, config.seasonalPeriod) * 2 + 30) {
    return fallbackForecast(salesData, daysAhead)
  }

  const values = salesData.map((d) => d.units)

  // Apply differencing to achieve stationarity
  const { differenced, originalLast } = applyDifferencing(values, config)

  // Fit ARIMA coefficients
  const coefficients = fitArima(differenced, config)

  // Generate forecasts
  const forecasts = generateForecasts(
    differenced,
    coefficients,
    originalLast,
    daysAhead,
    config
  )

  // Calculate average forecast
  const avgForecast = forecasts.reduce((a, b) => a + b, 0) / forecasts.length

  // Calculate confidence
  const confidence = calculateConfidence(values, differenced, coefficients)

  // Calculate prediction intervals
  const residuals = calculateResiduals(differenced, coefficients, config)
  const residualStdDev = Math.sqrt(
    residuals.reduce((sum, r) => sum + r ** 2, 0) / residuals.length
  )

  // Widen bounds for further horizons
  const boundMultiplier = 1.96 * Math.sqrt(1 + daysAhead / 14)
  const upperBound = avgForecast + boundMultiplier * residualStdDev
  const lowerBound = Math.max(0, avgForecast - boundMultiplier * residualStdDev)

  // Calculate factors
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const recent = values.slice(-7)
  const recentMean = recent.reduce((a, b) => a + b, 0) / 7
  const trend = (recentMean - mean) / mean

  return {
    model: 'arima',
    forecast: Math.max(0, avgForecast),
    confidence,
    upperBound,
    lowerBound,
    factors: {
      base: mean,
      trend,
      seasonality: 1, // ARIMA handles seasonality differently
    },
  }
}

/**
 * Apply differencing to achieve stationarity
 */
function applyDifferencing(
  values: number[],
  params: ArimaParams
): { differenced: number[]; originalLast: number[] } {
  let current = [...values]
  const originalLast: number[] = []

  // Regular differencing
  for (let i = 0; i < params.d; i++) {
    originalLast.push(current[current.length - 1])
    current = difference(current, 1)
  }

  // Seasonal differencing
  for (let i = 0; i < params.seasonalD; i++) {
    if (current.length > params.seasonalPeriod) {
      originalLast.push(...current.slice(-params.seasonalPeriod))
      current = difference(current, params.seasonalPeriod)
    }
  }

  return { differenced: current, originalLast }
}

/**
 * Difference a series by a given lag
 */
function difference(values: number[], lag: number): number[] {
  const result: number[] = []
  for (let i = lag; i < values.length; i++) {
    result.push(values[i] - values[i - lag])
  }
  return result
}

/**
 * Fit ARIMA coefficients using Yule-Walker equations (simplified)
 */
function fitArima(
  differenced: number[],
  params: ArimaParams
): ArimaCoefficients {
  const n = differenced.length

  // Calculate mean
  const mean = differenced.reduce((a, b) => a + b, 0) / n

  // Center the series
  const centered = differenced.map((v) => v - mean)

  // Fit AR coefficients using Yule-Walker
  const arCoeffs = fitArCoefficients(centered, params.p)

  // Fit MA coefficients using residuals
  const arResiduals = calculateArResiduals(centered, arCoeffs)
  const maCoeffs = fitMaCoefficients(arResiduals, params.q)

  // Fit seasonal AR coefficients
  const seasonalArCoeffs = fitArCoefficients(centered, params.seasonalP, params.seasonalPeriod)

  // Fit seasonal MA coefficients
  const seasonalArResiduals = calculateArResiduals(centered, seasonalArCoeffs, params.seasonalPeriod)
  const seasonalMaCoeffs = fitMaCoefficients(seasonalArResiduals, params.seasonalQ)

  return {
    arCoeffs,
    maCoeffs,
    seasonalArCoeffs,
    seasonalMaCoeffs,
    intercept: mean,
  }
}

/**
 * Fit AR coefficients using Yule-Walker equations
 */
function fitArCoefficients(
  centered: number[],
  order: number,
  lag: number = 1
): number[] {
  if (order === 0) return []

  const n = centered.length

  // Calculate autocorrelations
  const autocorr: number[] = []
  for (let k = 0; k <= order; k++) {
    let sum = 0
    for (let t = k * lag; t < n; t++) {
      sum += centered[t] * centered[t - k * lag]
    }
    autocorr.push(sum / (n - k * lag))
  }

  // Normalize by variance
  const variance = autocorr[0] || 1
  const normalizedAutocorr = autocorr.map((a) => a / variance)

  // Solve Yule-Walker equations using Levinson-Durbin
  return levinsonDurbin(normalizedAutocorr.slice(1), order)
}

/**
 * Levinson-Durbin algorithm for solving Yule-Walker equations
 */
function levinsonDurbin(autocorr: number[], order: number): number[] {
  if (order === 0) return []

  const coeffs: number[] = new Array(order).fill(0)
  let error = 1

  // First order
  coeffs[0] = autocorr[0]
  error = 1 - autocorr[0] ** 2

  // Higher orders
  for (let i = 1; i < order && i < autocorr.length; i++) {
    // Calculate reflection coefficient
    let lambda = autocorr[i]
    for (let j = 0; j < i; j++) {
      lambda -= coeffs[j] * autocorr[i - j - 1]
    }
    lambda /= error

    // Update coefficients
    const newCoeffs = [...coeffs]
    newCoeffs[i] = lambda

    for (let j = 0; j < i; j++) {
      newCoeffs[j] = coeffs[j] - lambda * coeffs[i - j - 1]
    }

    coeffs.splice(0, coeffs.length, ...newCoeffs)

    // Update error
    error *= 1 - lambda ** 2

    if (error <= 0) break
  }

  return coeffs.slice(0, order)
}

/**
 * Calculate AR residuals
 */
function calculateArResiduals(
  centered: number[],
  arCoeffs: number[],
  lag: number = 1
): number[] {
  const n = centered.length
  const residuals: number[] = []
  const p = arCoeffs.length

  for (let t = p * lag; t < n; t++) {
    let predicted = 0
    for (let i = 0; i < p; i++) {
      predicted += arCoeffs[i] * centered[t - (i + 1) * lag]
    }
    residuals.push(centered[t] - predicted)
  }

  return residuals
}

/**
 * Fit MA coefficients
 */
function fitMaCoefficients(residuals: number[], order: number): number[] {
  if (order === 0 || residuals.length < order * 2) return []

  // Simple MA coefficient estimation using autocorrelation of residuals
  const n = residuals.length
  const mean = residuals.reduce((a, b) => a + b, 0) / n
  const centered = residuals.map((r) => r - mean)

  const coeffs: number[] = []

  for (let k = 1; k <= order; k++) {
    let sum = 0
    let norm = 0

    for (let t = k; t < n; t++) {
      sum += centered[t] * centered[t - k]
      norm += centered[t - k] ** 2
    }

    coeffs.push(norm > 0 ? sum / norm : 0)
  }

  return coeffs
}

/**
 * Generate ARIMA forecasts
 */
function generateForecasts(
  differenced: number[],
  coefficients: ArimaCoefficients,
  originalLast: number[],
  daysAhead: number,
  params: ArimaParams
): number[] {
  const { arCoeffs, maCoeffs, seasonalArCoeffs, seasonalMaCoeffs, intercept } = coefficients
  const n = differenced.length

  // Extended differenced series for forecasting
  const extended = [...differenced]
  const residuals = calculateResiduals(differenced, coefficients, params)
  const extendedResiduals = [...residuals, ...new Array(daysAhead).fill(0)]

  // Generate differenced forecasts
  for (let h = 0; h < daysAhead; h++) {
    const t = n + h
    let forecast = intercept

    // AR component
    for (let i = 0; i < arCoeffs.length; i++) {
      const idx = t - (i + 1)
      if (idx >= 0 && idx < extended.length) {
        forecast += arCoeffs[i] * (extended[idx] - intercept)
      }
    }

    // MA component (use 0 for future residuals)
    for (let i = 0; i < maCoeffs.length; i++) {
      const idx = t - (i + 1)
      if (idx >= 0 && idx < extendedResiduals.length) {
        forecast += maCoeffs[i] * extendedResiduals[idx]
      }
    }

    // Seasonal AR component
    for (let i = 0; i < seasonalArCoeffs.length; i++) {
      const idx = t - (i + 1) * params.seasonalPeriod
      if (idx >= 0 && idx < extended.length) {
        forecast += seasonalArCoeffs[i] * (extended[idx] - intercept)
      }
    }

    extended.push(forecast)
  }

  // Inverse differencing to get actual forecasts
  const forecasts = inverseDifferencing(
    extended.slice(-daysAhead),
    originalLast,
    params
  )

  return forecasts.map((f) => Math.max(0, f))
}

/**
 * Inverse differencing to recover original scale
 */
function inverseDifferencing(
  differencedForecasts: number[],
  originalLast: number[],
  params: ArimaParams
): number[] {
  let forecasts = [...differencedForecasts]

  // Reverse seasonal differencing
  for (let i = params.seasonalD - 1; i >= 0; i--) {
    const seasonalBase = originalLast.slice(
      params.d + i * params.seasonalPeriod,
      params.d + (i + 1) * params.seasonalPeriod
    )

    forecasts = forecasts.map((f, idx) => {
      const baseIdx = idx % params.seasonalPeriod
      return f + (seasonalBase[baseIdx] || 0)
    })
  }

  // Reverse regular differencing
  let cumSum = originalLast[params.d - 1] || 0
  for (let i = params.d - 1; i >= 0; i--) {
    forecasts = forecasts.map((f) => {
      cumSum += f
      return cumSum
    })
    if (i > 0) {
      cumSum = originalLast[i - 1] || 0
    }
  }

  return forecasts
}

/**
 * Calculate residuals for the fitted model
 */
function calculateResiduals(
  differenced: number[],
  coefficients: ArimaCoefficients,
  params: ArimaParams
): number[] {
  const { arCoeffs, maCoeffs, intercept } = coefficients
  const n = differenced.length
  const residuals: number[] = []
  const p = Math.max(arCoeffs.length, params.seasonalPeriod * (coefficients.seasonalArCoeffs.length || 0))

  for (let t = p; t < n; t++) {
    let predicted = intercept

    // AR component
    for (let i = 0; i < arCoeffs.length; i++) {
      predicted += arCoeffs[i] * (differenced[t - (i + 1)] - intercept)
    }

    // MA component
    for (let i = 0; i < maCoeffs.length && t - (i + 1) >= p; i++) {
      predicted += maCoeffs[i] * residuals[t - (i + 1) - p]
    }

    // Seasonal AR component
    for (let i = 0; i < coefficients.seasonalArCoeffs.length; i++) {
      const idx = t - (i + 1) * params.seasonalPeriod
      if (idx >= 0) {
        predicted += coefficients.seasonalArCoeffs[i] * (differenced[idx] - intercept)
      }
    }

    residuals.push(differenced[t] - predicted)
  }

  return residuals
}

/**
 * Calculate model confidence
 */
function calculateConfidence(
  original: number[],
  differenced: number[],
  coefficients: ArimaCoefficients
): number {
  const n = original.length

  // Data quantity score
  const dataScore = Math.min(1, n / 180)

  // Stationarity score (lower variance after differencing = better)
  const originalVariance =
    original.reduce((sum, v, i, arr) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length
      return sum + (v - mean) ** 2
    }, 0) / n

  const diffVariance =
    differenced.reduce((sum, v, i, arr) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length
      return sum + (v - mean) ** 2
    }, 0) / differenced.length

  const stationarityScore = originalVariance > 0
    ? Math.min(1, diffVariance / originalVariance)
    : 0.5

  // AR coefficient stability (should be < 1 for stability)
  const maxArCoeff = Math.max(
    0,
    ...coefficients.arCoeffs.map(Math.abs),
    ...coefficients.seasonalArCoeffs.map(Math.abs)
  )
  const stabilityScore = maxArCoeff < 1 ? 1 - maxArCoeff * 0.5 : 0.3

  // Combined confidence
  return dataScore * 0.3 + (1 - stationarityScore) * 0.4 + stabilityScore * 0.3
}

/**
 * Fallback forecast for insufficient data
 */
function fallbackForecast(
  salesData: SalesDataPoint[],
  daysAhead: number
): ModelPrediction {
  if (salesData.length === 0) {
    return {
      model: 'arima',
      forecast: 0,
      confidence: 0,
      upperBound: 0,
      lowerBound: 0,
      factors: { base: 0, trend: 0, seasonality: 1 },
    }
  }

  const values = salesData.map((d) => d.units)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  )

  // Simple random walk with drift
  const lastValue = values[values.length - 1]
  let drift = 0

  if (values.length >= 7) {
    const recent = values.slice(-7)
    const recentMean = recent.reduce((a, b) => a + b, 0) / 7
    drift = (recentMean - mean) / 7
  }

  const forecast = lastValue + drift * daysAhead

  return {
    model: 'arima',
    forecast: Math.max(0, forecast),
    confidence: Math.min(0.4, salesData.length / 90),
    upperBound: forecast + 1.96 * stdDev * Math.sqrt(daysAhead),
    lowerBound: Math.max(0, forecast - 1.96 * stdDev * Math.sqrt(daysAhead)),
    factors: {
      base: mean,
      trend: drift / mean,
      seasonality: 1,
    },
  }
}

/**
 * Generate daily ARIMA forecasts
 */
export function arimaDaily(
  salesData: SalesDataPoint[],
  daysAhead: number,
  params: Partial<ArimaParams> = {}
): Array<{ date: Date; forecast: number; confidence: number }> {
  const config = { ...DEFAULT_PARAMS, ...params }
  const minData = Math.max(config.p, config.q, config.seasonalPeriod) * 2 + 30

  if (salesData.length < minData) {
    const fallback = fallbackForecast(salesData, 1)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return Array.from({ length: daysAhead }, (_, i) => {
      const date = new Date(today)
      date.setDate(date.getDate() + i + 1)
      return {
        date,
        forecast: fallback.forecast,
        confidence: fallback.confidence * Math.pow(0.98, i),
      }
    })
  }

  const values = salesData.map((d) => d.units)
  const { differenced, originalLast } = applyDifferencing(values, config)
  const coefficients = fitArima(differenced, config)
  const forecasts = generateForecasts(
    differenced,
    coefficients,
    originalLast,
    daysAhead,
    config
  )

  const baseConfidence = calculateConfidence(values, differenced, coefficients)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return forecasts.map((forecast, i) => {
    const date = new Date(today)
    date.setDate(date.getDate() + i + 1)
    return {
      date,
      forecast,
      confidence: baseConfidence * Math.pow(0.99, i),
    }
  })
}

/**
 * Auto-select ARIMA parameters using AIC
 */
export function autoArima(
  salesData: SalesDataPoint[],
  maxP: number = 3,
  maxD: number = 2,
  maxQ: number = 3
): ArimaParams {
  if (salesData.length < 60) {
    return DEFAULT_PARAMS
  }

  const values = salesData.map((d) => d.units)
  const n = values.length

  // Split data for validation
  const trainSize = Math.floor(n * 0.8)
  const trainData = salesData.slice(0, trainSize)
  const valData = salesData.slice(trainSize)

  let bestParams = DEFAULT_PARAMS
  let bestAic = Infinity

  // Grid search
  for (let p = 0; p <= maxP; p++) {
    for (let d = 0; d <= maxD; d++) {
      for (let q = 0; q <= maxQ; q++) {
        const params = { ...DEFAULT_PARAMS, p, d, q }

        try {
          // Fit model
          const trainValues = trainData.map((d) => d.units)
          const { differenced } = applyDifferencing(trainValues, params)
          const coefficients = fitArima(differenced, params)

          // Calculate AIC
          const residuals = calculateResiduals(differenced, coefficients, params)
          const rss = residuals.reduce((sum, r) => sum + r ** 2, 0)
          const numParams = p + q + params.seasonalP + params.seasonalQ + 1
          const aic = n * Math.log(rss / n) + 2 * numParams

          // Validate on holdout set
          const prediction = arimaForecast(trainData, valData.length, params)
          const valActual = valData.reduce((sum, d) => sum + d.units, 0)
          const valError = Math.abs(prediction.forecast * valData.length - valActual) / valActual

          // Combined score
          const score = aic + valError * 1000

          if (score < bestAic) {
            bestAic = score
            bestParams = params
          }
        } catch (e) {
          // Skip invalid parameter combinations
        }
      }
    }
  }

  return bestParams
}
