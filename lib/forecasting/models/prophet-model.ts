/**
 * Prophet-like Forecasting Model
 *
 * Implements a decomposable time series model similar to Facebook Prophet:
 * y(t) = g(t) + s(t) + h(t) + ε(t)
 *
 * Where:
 * - g(t) = trend function (piecewise linear or logistic growth)
 * - s(t) = seasonal component (Fourier series)
 * - h(t) = holiday/event effects
 * - ε(t) = error term
 */

import { SalesDataPoint, ModelPrediction, SeasonalEvent } from '../types'

interface ProphetParams {
  // Trend
  growthMode: 'linear' | 'logistic'
  changePointPriorScale: number // Flexibility of trend
  numChangePoints: number

  // Seasonality
  yearlySeasonality: boolean
  weeklySeasonality: boolean
  seasonalityPriorScale: number
  yearlyFourierOrder: number
  weeklyFourierOrder: number

  // Events
  holidayPriorScale: number
}

interface ProphetComponents {
  trend: number[]
  weekly: number[]
  yearly: number[]
  events: number[]
  changePoints: number[]
  fitted: number[]
}

const DEFAULT_PARAMS: ProphetParams = {
  growthMode: 'linear',
  changePointPriorScale: 0.05,
  numChangePoints: 25,
  yearlySeasonality: true,
  weeklySeasonality: true,
  seasonalityPriorScale: 10,
  yearlyFourierOrder: 10,
  weeklyFourierOrder: 3,
  holidayPriorScale: 10,
}

/**
 * Prophet-like forecasting
 */
export function prophetForecast(
  salesData: SalesDataPoint[],
  daysAhead: number,
  seasonalEvents: SeasonalEvent[] = [],
  params: Partial<ProphetParams> = {}
): ModelPrediction {
  const config = { ...DEFAULT_PARAMS, ...params }

  if (salesData.length < 30) {
    return fallbackForecast(salesData, daysAhead)
  }

  // Fit model components
  const components = fitModel(salesData, config, seasonalEvents)

  // Generate forecasts
  const forecasts = generateForecasts(
    salesData,
    components,
    daysAhead,
    config,
    seasonalEvents
  )

  // Calculate average forecast
  const avgForecast = forecasts.reduce((a, b) => a + b, 0) / forecasts.length

  // Calculate confidence
  const confidence = calculateConfidence(salesData, components)

  // Calculate prediction intervals
  const residuals = salesData.map(
    (d, i) => d.units - (components.fitted[i] || 0)
  )
  const residualStdDev = Math.sqrt(
    residuals.reduce((sum, r) => sum + r * r, 0) / residuals.length
  )

  const upperBound = avgForecast + 1.96 * residualStdDev * Math.sqrt(daysAhead / 7)
  const lowerBound = Math.max(0, avgForecast - 1.96 * residualStdDev * Math.sqrt(daysAhead / 7))

  // Extract factors
  const lastTrend = components.trend[components.trend.length - 1] || avgForecast
  const avgWeekly = components.weekly.length > 0
    ? components.weekly.reduce((a, b) => a + b, 0) / components.weekly.length
    : 0
  const avgYearly = components.yearly.length > 0
    ? components.yearly.reduce((a, b) => a + b, 0) / components.yearly.length
    : 0

  return {
    model: 'prophet',
    forecast: avgForecast,
    confidence,
    upperBound,
    lowerBound,
    factors: {
      base: lastTrend,
      trend: lastTrend - (components.trend[0] || 0),
      seasonality: 1 + (avgWeekly + avgYearly) / Math.max(lastTrend, 1),
    },
  }
}

/**
 * Fit the Prophet model to historical data
 */
function fitModel(
  salesData: SalesDataPoint[],
  params: ProphetParams,
  seasonalEvents: SeasonalEvent[]
): ProphetComponents {
  const n = salesData.length

  // 1. Fit trend component
  const trend = fitTrend(salesData, params)

  // 2. Detrend the series
  const detrended = salesData.map((d, i) => d.units - trend[i])

  // 3. Fit weekly seasonality
  const weekly = params.weeklySeasonality
    ? fitWeeklySeasonality(salesData, detrended, params)
    : new Array(n).fill(0)

  // 4. Fit yearly seasonality
  const yearly = params.yearlySeasonality && n >= 365
    ? fitYearlySeasonality(salesData, detrended, params)
    : new Array(n).fill(0)

  // 5. Fit event effects
  const events = fitEventEffects(salesData, detrended, seasonalEvents, params)

  // 6. Calculate fitted values
  const fitted = salesData.map(
    (_, i) => trend[i] + weekly[i] + yearly[i] + events[i]
  )

  // 7. Detect change points for trend
  const changePoints = detectChangePoints(salesData, trend, params)

  return {
    trend,
    weekly,
    yearly,
    events,
    changePoints,
    fitted,
  }
}

/**
 * Fit piecewise linear trend
 */
function fitTrend(
  salesData: SalesDataPoint[],
  params: ProphetParams
): number[] {
  const n = salesData.length
  const values = salesData.map((d) => d.units)

  if (params.growthMode === 'linear') {
    // Piecewise linear with change points
    return fitPiecewiseLinear(values, params)
  } else {
    // Logistic growth
    return fitLogisticGrowth(values, params)
  }
}

/**
 * Piecewise linear trend fitting
 */
function fitPiecewiseLinear(
  values: number[],
  params: ProphetParams
): number[] {
  const n = values.length

  // Simple linear regression for base trend
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean)
    denominator += (i - xMean) ** 2
  }

  const slope = denominator !== 0 ? numerator / denominator : 0
  const intercept = yMean - slope * xMean

  // Generate trend line
  const trend = values.map((_, i) => intercept + slope * i)

  // Apply change point detection and adjustment
  const numChangePoints = Math.min(params.numChangePoints, Math.floor(n / 10))

  if (numChangePoints > 0) {
    const adjustedTrend = applyChangePoints(values, trend, numChangePoints, params)
    return adjustedTrend
  }

  return trend
}

/**
 * Apply change points to trend
 */
function applyChangePoints(
  values: number[],
  baseTrend: number[],
  numChangePoints: number,
  params: ProphetParams
): number[] {
  const n = values.length
  const trend = [...baseTrend]

  // Identify potential change points
  const residuals = values.map((v, i) => v - baseTrend[i])
  const windowSize = Math.floor(n / (numChangePoints + 1))

  for (let i = 0; i < numChangePoints; i++) {
    const start = windowSize * (i + 1) - Math.floor(windowSize / 2)
    const end = Math.min(start + windowSize, n)

    // Check for significant level change
    const beforeMean = residuals.slice(Math.max(0, start - windowSize), start)
      .reduce((a, b) => a + b, 0) / windowSize
    const afterMean = residuals.slice(start, end)
      .reduce((a, b) => a + b, 0) / Math.min(windowSize, end - start)

    const change = afterMean - beforeMean

    // Apply change with regularization
    const adjustedChange = change * (1 - params.changePointPriorScale)

    for (let j = start; j < n; j++) {
      trend[j] += adjustedChange * ((j - start) / (n - start))
    }
  }

  return trend
}

/**
 * Logistic growth trend
 */
function fitLogisticGrowth(
  values: number[],
  params: ProphetParams
): number[] {
  const n = values.length

  // Estimate capacity (maximum value + 50%)
  const maxVal = Math.max(...values)
  const capacity = maxVal * 1.5

  // Estimate growth rate
  const midPoint = n / 2
  const growthRate = 0.1

  return values.map((_, i) =>
    capacity / (1 + Math.exp(-growthRate * (i - midPoint)))
  )
}

/**
 * Fit weekly seasonality using Fourier series
 */
function fitWeeklySeasonality(
  salesData: SalesDataPoint[],
  detrended: number[],
  params: ProphetParams
): number[] {
  const n = salesData.length
  const period = 7 // Weekly

  // Create Fourier features
  const features: number[][] = []

  for (let i = 0; i < n; i++) {
    const t = i / period * 2 * Math.PI
    const row: number[] = []

    for (let k = 1; k <= params.weeklyFourierOrder; k++) {
      row.push(Math.sin(k * t))
      row.push(Math.cos(k * t))
    }

    features.push(row)
  }

  // Fit using simple least squares
  const coefficients = fitFourier(features, detrended)

  // Generate seasonality component
  return features.map((row) =>
    row.reduce((sum, f, i) => sum + f * coefficients[i], 0)
  )
}

/**
 * Fit yearly seasonality
 */
function fitYearlySeasonality(
  salesData: SalesDataPoint[],
  detrended: number[],
  params: ProphetParams
): number[] {
  const n = salesData.length
  const period = 365.25 // Yearly

  // Create Fourier features
  const features: number[][] = []

  for (let i = 0; i < n; i++) {
    const t = i / period * 2 * Math.PI
    const row: number[] = []

    for (let k = 1; k <= params.yearlyFourierOrder; k++) {
      row.push(Math.sin(k * t))
      row.push(Math.cos(k * t))
    }

    features.push(row)
  }

  // Fit using simple least squares
  const coefficients = fitFourier(features, detrended)

  // Generate seasonality component
  return features.map((row) =>
    row.reduce((sum, f, i) => sum + f * coefficients[i], 0)
  )
}

/**
 * Fit Fourier coefficients using ridge regression
 */
function fitFourier(features: number[][], target: number[]): number[] {
  const n = features.length
  const k = features[0]?.length || 0

  if (k === 0 || n === 0) return []

  // Ridge regression with regularization
  const lambda = 0.1

  // X'X + λI
  const XtX: number[][] = Array(k).fill(null).map(() => Array(k).fill(0))
  const XtY: number[] = Array(k).fill(0)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      XtY[j] += features[i][j] * target[i]
      for (let l = 0; l < k; l++) {
        XtX[j][l] += features[i][j] * features[i][l]
      }
    }
  }

  // Add regularization
  for (let i = 0; i < k; i++) {
    XtX[i][i] += lambda
  }

  // Solve using simple method (for small k)
  return solveLinearSystem(XtX, XtY)
}

/**
 * Simple linear system solver (for small systems)
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length
  const augmented = A.map((row, i) => [...row, b[i]])

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
        maxRow = row
      }
    }

    // Swap rows
    [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]]

    // Eliminate
    if (Math.abs(augmented[col][col]) < 1e-10) continue

    for (let row = col + 1; row < n; row++) {
      const factor = augmented[row][col] / augmented[col][col]
      for (let j = col; j <= n; j++) {
        augmented[row][j] -= factor * augmented[col][j]
      }
    }
  }

  // Back substitution
  const x = Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let sum = augmented[i][n]
    for (let j = i + 1; j < n; j++) {
      sum -= augmented[i][j] * x[j]
    }
    x[i] = Math.abs(augmented[i][i]) > 1e-10 ? sum / augmented[i][i] : 0
  }

  return x
}

/**
 * Fit event/holiday effects
 */
function fitEventEffects(
  salesData: SalesDataPoint[],
  detrended: number[],
  seasonalEvents: SeasonalEvent[],
  params: ProphetParams
): number[] {
  const n = salesData.length
  const effects = new Array(n).fill(0)

  if (seasonalEvents.length === 0) return effects

  for (const event of seasonalEvents) {
    // Find data points within this event
    const eventIndices: number[] = []

    for (let i = 0; i < n; i++) {
      const date = salesData[i].date
      if (isDateInEvent(date, event)) {
        eventIndices.push(i)
      }
    }

    if (eventIndices.length === 0) continue

    // Calculate average effect during event
    const eventValues = eventIndices.map((i) => detrended[i])
    const nonEventValues = detrended.filter((_, i) => !eventIndices.includes(i))

    const eventMean = eventValues.reduce((a, b) => a + b, 0) / eventValues.length
    const nonEventMean = nonEventValues.length > 0
      ? nonEventValues.reduce((a, b) => a + b, 0) / nonEventValues.length
      : 0

    const effect = (eventMean - nonEventMean) * (1 - 1 / params.holidayPriorScale)

    // Apply effect
    for (const i of eventIndices) {
      effects[i] = effect
    }
  }

  return effects
}

/**
 * Check if date falls within a seasonal event
 */
function isDateInEvent(date: Date, event: SeasonalEvent): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()

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
 * Detect change points in trend
 */
function detectChangePoints(
  salesData: SalesDataPoint[],
  trend: number[],
  params: ProphetParams
): number[] {
  const n = salesData.length
  const changePoints: number[] = []

  if (n < 30) return changePoints

  // Calculate trend differences
  const diffs = trend.slice(1).map((t, i) => t - trend[i])

  // Find significant changes
  const diffMean = diffs.reduce((a, b) => a + b, 0) / diffs.length
  const diffStd = Math.sqrt(
    diffs.reduce((sum, d) => sum + (d - diffMean) ** 2, 0) / diffs.length
  )

  const threshold = 2 * diffStd

  for (let i = 10; i < n - 10; i++) {
    const windowBefore = diffs.slice(Math.max(0, i - 5), i)
    const windowAfter = diffs.slice(i, Math.min(n - 1, i + 5))

    const beforeMean = windowBefore.reduce((a, b) => a + b, 0) / windowBefore.length
    const afterMean = windowAfter.reduce((a, b) => a + b, 0) / windowAfter.length

    if (Math.abs(afterMean - beforeMean) > threshold) {
      changePoints.push(i)
    }
  }

  return changePoints
}

/**
 * Generate forecasts using fitted model
 */
function generateForecasts(
  salesData: SalesDataPoint[],
  components: ProphetComponents,
  daysAhead: number,
  params: ProphetParams,
  seasonalEvents: SeasonalEvent[]
): number[] {
  const n = salesData.length
  const forecasts: number[] = []

  // Get last trend value and slope
  const lastTrend = components.trend[n - 1]
  const trendSlope = n > 1
    ? (components.trend[n - 1] - components.trend[n - 2])
    : 0

  // Get weekly and yearly patterns
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let h = 1; h <= daysAhead; h++) {
    // Extrapolate trend
    const trend = lastTrend + h * trendSlope

    // Get weekly seasonality
    const futureIndex = n + h - 1
    const weeklyIdx = futureIndex % 7
    const weekly = params.weeklySeasonality && components.weekly.length >= 7
      ? components.weekly[weeklyIdx] || 0
      : 0

    // Get yearly seasonality
    const yearlyIdx = futureIndex % 365
    const yearly = params.yearlySeasonality && components.yearly.length >= 365
      ? components.yearly[yearlyIdx % components.yearly.length] || 0
      : 0

    // Check for events
    const futureDate = new Date(today)
    futureDate.setDate(futureDate.getDate() + h)

    let eventEffect = 0
    for (const event of seasonalEvents) {
      if (isDateInEvent(futureDate, event)) {
        // Use learned multiplier if available, otherwise base
        const multiplier = event.learnedMultiplier || event.baseMultiplier
        eventEffect = lastTrend * (multiplier - 1)
        break
      }
    }

    // Combine components
    const forecast = Math.max(0, trend + weekly + yearly + eventEffect)
    forecasts.push(forecast)
  }

  return forecasts
}

/**
 * Calculate model confidence
 */
function calculateConfidence(
  salesData: SalesDataPoint[],
  components: ProphetComponents
): number {
  const n = salesData.length

  // Data quantity score
  const dataScore = Math.min(1, n / 180) // Full at 6 months

  // Fit quality score (R-squared)
  const actual = salesData.map((d) => d.units)
  const fitted = components.fitted
  const actualMean = actual.reduce((a, b) => a + b, 0) / n

  const ssTot = actual.reduce((sum, a) => sum + (a - actualMean) ** 2, 0)
  const ssRes = actual.reduce((sum, a, i) => sum + (a - fitted[i]) ** 2, 0)

  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0

  // Stability score
  const recentResiduals = actual.slice(-30).map((a, i) => a - fitted[n - 30 + i])
  const recentMean = recentResiduals.reduce((a, b) => a + b, 0) / recentResiduals.length
  const recentStd = Math.sqrt(
    recentResiduals.reduce((sum, r) => sum + (r - recentMean) ** 2, 0) / recentResiduals.length
  )
  const actualMeanRecent = actual.slice(-30).reduce((a, b) => a + b, 0) / 30
  const cv = actualMeanRecent > 0 ? recentStd / actualMeanRecent : 1
  const stabilityScore = Math.max(0, 1 - cv)

  // Combined confidence
  return dataScore * 0.3 + rSquared * 0.4 + stabilityScore * 0.3
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
      model: 'prophet',
      forecast: 0,
      confidence: 0,
      upperBound: 0,
      lowerBound: 0,
      factors: { base: 0, trend: 0, seasonality: 1 },
    }
  }

  // Simple average with trend
  const values = salesData.map((d) => d.units)
  const avgVelocity = values.reduce((a, b) => a + b, 0) / values.length

  const recent = values.slice(-7)
  const older = values.slice(-14, -7)
  let trend = 0

  if (older.length > 0) {
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length
    trend = (recentAvg - olderAvg) / recentAvg
  }

  const forecast = avgVelocity * (1 + trend * daysAhead / 30)

  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + (v - avgVelocity) ** 2, 0) / values.length
  )

  return {
    model: 'prophet',
    forecast: Math.max(0, forecast),
    confidence: Math.min(0.5, salesData.length / 60),
    upperBound: forecast + 1.96 * stdDev,
    lowerBound: Math.max(0, forecast - 1.96 * stdDev),
    factors: {
      base: avgVelocity,
      trend: trend,
      seasonality: 1,
    },
  }
}

/**
 * Generate daily forecasts
 */
export function prophetDaily(
  salesData: SalesDataPoint[],
  daysAhead: number,
  seasonalEvents: SeasonalEvent[] = [],
  params: Partial<ProphetParams> = {}
): Array<{ date: Date; forecast: number; confidence: number }> {
  const config = { ...DEFAULT_PARAMS, ...params }

  if (salesData.length < 30) {
    const fallback = fallbackForecast(salesData, 1)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return Array.from({ length: daysAhead }, (_, i) => {
      const date = new Date(today)
      date.setDate(date.getDate() + i + 1)
      return {
        date,
        forecast: fallback.forecast,
        confidence: fallback.confidence * Math.pow(0.99, i),
      }
    })
  }

  const components = fitModel(salesData, config, seasonalEvents)
  const forecasts = generateForecasts(
    salesData,
    components,
    daysAhead,
    config,
    seasonalEvents
  )

  const baseConfidence = calculateConfidence(salesData, components)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return forecasts.map((forecast, i) => {
    const date = new Date(today)
    date.setDate(date.getDate() + i + 1)
    return {
      date,
      forecast,
      confidence: baseConfidence * Math.pow(0.995, i),
    }
  })
}
