/**
 * Model Weight Optimizer
 *
 * Self-improving logic that adjusts model weights based on historical accuracy.
 * Runs weekly backtests and optimizes ensemble weights per SKU.
 */

import { prisma } from '@/lib/prisma'
import {
  SalesDataPoint,
  ForecastModelType,
  ModelAccuracy,
  BacktestResult,
  ModelWeights,
} from '../types'
import { exponentialSmoothingDaily } from '../models/exponential-smoothing'
import { prophetDaily } from '../models/prophet-model'
import { lstmDaily } from '../models/lstm-model'
import { arimaDaily } from '../models/arima-model'

interface OptimizationResult {
  masterSku: string
  previousWeights: ModelWeights
  newWeights: ModelWeights
  improvement: number
  backtestResults: BacktestResult[]
}

/**
 * Run weekly backtest for all SKUs and update model weights
 */
export async function runWeeklyOptimization(): Promise<{
  totalSkusProcessed: number
  skusImproved: number
  averageImprovement: number
  results: OptimizationResult[]
}> {
  // Get all products with sufficient sales history
  const products = await prisma.product.findMany({
    where: {
      isHidden: false,
    },
    select: {
      sku: true,
    },
  })

  const results: OptimizationResult[] = []
  let skusImproved = 0
  let totalImprovement = 0

  for (const product of products) {
    try {
      const result = await optimizeModelWeights(product.sku)
      if (result) {
        results.push(result)
        if (result.improvement > 0) {
          skusImproved++
          totalImprovement += result.improvement
        }
      }
    } catch (error) {
      console.error(`Error optimizing weights for ${product.sku}:`, error)
    }
  }

  return {
    totalSkusProcessed: products.length,
    skusImproved,
    averageImprovement: skusImproved > 0 ? totalImprovement / skusImproved : 0,
    results,
  }
}

/**
 * Optimize model weights for a single SKU
 */
export async function optimizeModelWeights(
  masterSku: string
): Promise<OptimizationResult | null> {
  // Get sales history
  const salesHistory = await getSalesHistory(masterSku)

  if (salesHistory.length < 90) {
    // Not enough data for optimization
    return null
  }

  // Get current weights
  const currentWeights = await getCurrentWeights(masterSku)

  // Run backtests for each model
  const backtestResults = await runBacktests(masterSku, salesHistory)

  // Calculate optimal weights based on MAPE
  const newWeights = calculateOptimalWeights(backtestResults, currentWeights)

  // Calculate improvement
  const previousMape = await calculateEnsembleMape(
    masterSku,
    salesHistory,
    currentWeights
  )
  const newMape = await calculateEnsembleMape(masterSku, salesHistory, newWeights)
  const improvement = previousMape > 0 ? (previousMape - newMape) / previousMape : 0

  // Save new weights if improved
  if (newMape < previousMape || !currentWeights.overallMape) {
    await saveModelWeights(masterSku, newWeights, newMape)
  }

  return {
    masterSku,
    previousWeights: currentWeights,
    newWeights,
    improvement,
    backtestResults,
  }
}

/**
 * Get sales history for a SKU
 */
async function getSalesHistory(masterSku: string): Promise<SalesDataPoint[]> {
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  // Try dailyProfit table first
  try {
    const dailyProfits = await prisma.dailyProfit.findMany({
      where: {
        masterSku,
        date: { gte: twoYearsAgo },
      },
      orderBy: { date: 'asc' },
    })

    if (dailyProfits.length > 0) {
      return dailyProfits.map((dp) => ({
        date: dp.date,
        units: dp.unitsSold,
        revenue: Number(dp.revenue),
      }))
    }
  } catch (error) {
    // Table might not exist
  }

  // Fallback to aggregating from orders
  const orders = await prisma.orderItem.findMany({
    where: {
      masterSku,
      order: {
        purchaseDate: { gte: twoYearsAgo },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
    include: {
      order: {
        select: { purchaseDate: true },
      },
    },
    orderBy: {
      order: { purchaseDate: 'asc' },
    },
  })

  // Aggregate by date
  const dailyMap = new Map<string, number>()

  for (const item of orders) {
    const dateStr = item.order.purchaseDate.toISOString().split('T')[0]
    dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + item.quantity)
  }

  return Array.from(dailyMap.entries())
    .map(([dateStr, units]) => ({
      date: new Date(dateStr),
      units,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

/**
 * Get current model weights
 */
async function getCurrentWeights(masterSku: string): Promise<ModelWeights> {
  try {
    const weights = await prisma.modelWeight.findUnique({
      where: { masterSku },
    })

    if (weights) {
      return {
        masterSku,
        prophetWeight: Number(weights.prophetWeight),
        lstmWeight: Number(weights.lstmWeight),
        exponentialSmoothingWeight: Number(weights.exponentialSmoothingWeight),
        arimaWeight: 0.15,
        overallMape: weights.overallMape ? Number(weights.overallMape) : null,
        lastUpdated: weights.lastUpdated,
      }
    }
  } catch (error) {
    // Table might not exist
  }

  // Default equal weights
  return {
    masterSku,
    prophetWeight: 0.30,
    lstmWeight: 0.25,
    exponentialSmoothingWeight: 0.30,
    arimaWeight: 0.15,
    overallMape: null,
    lastUpdated: new Date(),
  }
}

/**
 * Run backtests for all models
 */
async function runBacktests(
  masterSku: string,
  salesHistory: SalesDataPoint[]
): Promise<BacktestResult[]> {
  const results: BacktestResult[] = []
  const models: ForecastModelType[] = [
    'exponential_smoothing',
    'prophet',
    'lstm',
    'arima',
  ]

  // Use rolling window backtest
  const windowSize = 30 // Forecast horizon
  const numWindows = Math.min(6, Math.floor(salesHistory.length / windowSize) - 1)

  if (numWindows < 2) {
    return results
  }

  for (const model of models) {
    const forecasts: Array<{
      date: Date
      predicted: number
      actual: number
      error: number
      percentError: number
    }> = []

    // Run backtest for each window
    for (let w = 0; w < numWindows; w++) {
      const trainEnd = salesHistory.length - (numWindows - w) * windowSize
      const testStart = trainEnd
      const testEnd = testStart + windowSize

      const trainData = salesHistory.slice(0, trainEnd)
      const testData = salesHistory.slice(testStart, testEnd)

      // Get forecasts
      const modelForecasts = await getModelForecasts(model, trainData, windowSize)

      // Calculate errors
      for (let i = 0; i < testData.length; i++) {
        const predicted = modelForecasts[i]?.forecast || 0
        const actual = testData[i].units
        const error = Math.abs(predicted - actual)
        const percentError = actual > 0 ? error / actual : 0

        forecasts.push({
          date: testData[i].date,
          predicted,
          actual,
          error,
          percentError,
        })
      }
    }

    // Calculate metrics
    const mape = forecasts.length > 0
      ? forecasts.reduce((sum, f) => sum + f.percentError, 0) / forecasts.length
      : 0

    const mae = forecasts.length > 0
      ? forecasts.reduce((sum, f) => sum + f.error, 0) / forecasts.length
      : 0

    const rmse = forecasts.length > 0
      ? Math.sqrt(
          forecasts.reduce((sum, f) => sum + f.error ** 2, 0) / forecasts.length
        )
      : 0

    const within20 = forecasts.filter((f) => f.percentError <= 0.2).length
    const hitRate = forecasts.length > 0 ? within20 / forecasts.length : 0

    results.push({
      masterSku,
      model,
      period: {
        start: salesHistory[salesHistory.length - numWindows * windowSize].date,
        end: salesHistory[salesHistory.length - 1].date,
      },
      metrics: {
        mape,
        rmse,
        mae,
        hitRate,
      },
      forecasts,
    })
  }

  return results
}

/**
 * Get forecasts from a specific model
 */
async function getModelForecasts(
  model: ForecastModelType,
  trainData: SalesDataPoint[],
  horizon: number
): Promise<Array<{ date: Date; forecast: number }>> {
  switch (model) {
    case 'exponential_smoothing':
      return exponentialSmoothingDaily(trainData, horizon)
    case 'prophet':
      return prophetDaily(trainData, horizon)
    case 'lstm':
      return lstmDaily(trainData, horizon)
    case 'arima':
      return arimaDaily(trainData, horizon)
    default:
      return []
  }
}

/**
 * Calculate optimal weights based on backtest MAPE
 */
function calculateOptimalWeights(
  backtestResults: BacktestResult[],
  currentWeights: ModelWeights
): ModelWeights {
  // Get MAPE for each model
  const modelMape: Record<string, number> = {}

  for (const result of backtestResults) {
    modelMape[result.model] = result.metrics.mape
  }

  // Calculate inverse MAPE weights (lower MAPE = higher weight)
  // Add small constant to avoid division by zero
  const epsilon = 0.01
  const inverseMape: Record<string, number> = {}
  let totalInverse = 0

  for (const model of Object.keys(modelMape)) {
    const mape = modelMape[model]
    if (mape < 1) {
      // Only include models with reasonable MAPE
      inverseMape[model] = 1 / (mape + epsilon)
      totalInverse += inverseMape[model]
    }
  }

  // Normalize to weights
  const newWeights: ModelWeights = {
    masterSku: currentWeights.masterSku,
    prophetWeight: 0.25,
    lstmWeight: 0.25,
    exponentialSmoothingWeight: 0.25,
    arimaWeight: 0.25,
    overallMape: null,
    lastUpdated: new Date(),
  }

  if (totalInverse > 0) {
    newWeights.prophetWeight = (inverseMape['prophet'] || 0) / totalInverse
    newWeights.lstmWeight = (inverseMape['lstm'] || 0) / totalInverse
    newWeights.exponentialSmoothingWeight =
      (inverseMape['exponential_smoothing'] || 0) / totalInverse
    newWeights.arimaWeight = (inverseMape['arima'] || 0) / totalInverse
  }

  // Apply smoothing with current weights (don't change too drastically)
  const smoothingFactor = 0.3 // 30% new, 70% old
  newWeights.prophetWeight =
    smoothingFactor * newWeights.prophetWeight +
    (1 - smoothingFactor) * currentWeights.prophetWeight
  newWeights.lstmWeight =
    smoothingFactor * newWeights.lstmWeight +
    (1 - smoothingFactor) * currentWeights.lstmWeight
  newWeights.exponentialSmoothingWeight =
    smoothingFactor * newWeights.exponentialSmoothingWeight +
    (1 - smoothingFactor) * currentWeights.exponentialSmoothingWeight
  newWeights.arimaWeight =
    smoothingFactor * newWeights.arimaWeight +
    (1 - smoothingFactor) * currentWeights.arimaWeight

  // Normalize
  const total =
    newWeights.prophetWeight +
    newWeights.lstmWeight +
    newWeights.exponentialSmoothingWeight +
    newWeights.arimaWeight

  newWeights.prophetWeight /= total
  newWeights.lstmWeight /= total
  newWeights.exponentialSmoothingWeight /= total
  newWeights.arimaWeight /= total

  return newWeights
}

/**
 * Calculate ensemble MAPE with given weights
 */
async function calculateEnsembleMape(
  masterSku: string,
  salesHistory: SalesDataPoint[],
  weights: ModelWeights
): Promise<number> {
  if (salesHistory.length < 60) return 1.0

  const windowSize = 30
  const trainData = salesHistory.slice(0, -windowSize)
  const testData = salesHistory.slice(-windowSize)

  // Get forecasts from each model
  const [expForecasts, prophetForecasts, lstmForecasts, arimaForecasts] =
    await Promise.all([
      exponentialSmoothingDaily(trainData, windowSize),
      prophetDaily(trainData, windowSize),
      lstmDaily(trainData, windowSize),
      arimaDaily(trainData, windowSize),
    ])

  // Calculate weighted ensemble forecasts and MAPE
  let totalError = 0
  let count = 0

  const totalWeight =
    weights.prophetWeight +
    weights.lstmWeight +
    weights.exponentialSmoothingWeight +
    weights.arimaWeight

  for (let i = 0; i < testData.length; i++) {
    const actual = testData[i].units
    if (actual <= 0) continue

    const ensembleForecast =
      ((prophetForecasts[i]?.forecast || 0) * weights.prophetWeight +
        (lstmForecasts[i]?.forecast || 0) * weights.lstmWeight +
        (expForecasts[i]?.forecast || 0) * weights.exponentialSmoothingWeight +
        (arimaForecasts[i]?.forecast || 0) * weights.arimaWeight) /
      totalWeight

    totalError += Math.abs(ensembleForecast - actual) / actual
    count++
  }

  return count > 0 ? totalError / count : 1.0
}

/**
 * Save optimized weights to database
 */
async function saveModelWeights(
  masterSku: string,
  weights: ModelWeights,
  mape: number
): Promise<void> {
  try {
    await prisma.modelWeight.upsert({
      where: { masterSku },
      create: {
        masterSku,
        prophetWeight: weights.prophetWeight,
        lstmWeight: weights.lstmWeight,
        exponentialSmoothingWeight: weights.exponentialSmoothingWeight,
        prophetMape: null,
        lstmMape: null,
        exponentialSmoothingMape: null,
        overallMape: mape,
        lastUpdated: new Date(),
      },
      update: {
        prophetWeight: weights.prophetWeight,
        lstmWeight: weights.lstmWeight,
        exponentialSmoothingWeight: weights.exponentialSmoothingWeight,
        overallMape: mape,
        lastUpdated: new Date(),
      },
    })
  } catch (error) {
    console.error('Error saving model weights for %s:', masterSku, error)
  }
}

/**
 * Track forecast accuracy after the fact
 */
export async function trackForecastAccuracy(
  masterSku: string,
  forecastDate: Date,
  location: string,
  predictedUnits: number,
  modelUsed: ForecastModelType
): Promise<void> {
  // Get actual sales for that date
  const nextDay = new Date(forecastDate)
  nextDay.setDate(nextDay.getDate() + 1)

  const actualSales = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku,
      order: {
        purchaseDate: {
          gte: forecastDate,
          lt: nextDay,
        },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  const actualUnits = actualSales._sum.quantity || 0
  const absoluteError = Math.abs(predictedUnits - actualUnits)
  const percentageError = actualUnits > 0 ? absoluteError / actualUnits : 0
  const squaredError = absoluteError ** 2
  const withinConfidence = percentageError <= 0.2 // Within 20%

  // Store accuracy record
  try {
    await prisma.forecastAccuracy.create({
      data: {
        masterSku,
        forecastDate,
        location,
        predictedUnits,
        modelUsed,
        actualUnits,
        absoluteError,
        percentageError,
        squaredError,
        withinConfidence,
      },
    })
  } catch (error) {
    // Might already exist or table doesn't exist
    console.error('Error tracking forecast accuracy:', error)
  }
}

/**
 * Generate accuracy report
 */
export async function generateAccuracyReport(
  startDate: Date,
  endDate: Date
): Promise<{
  overallMape: number
  modelPerformance: Array<{
    model: ForecastModelType
    mape: number
    sampleSize: number
  }>
  topAccuracySkus: Array<{ masterSku: string; mape: number }>
  worstAccuracySkus: Array<{ masterSku: string; mape: number }>
}> {
  try {
    // Get accuracy records
    const records = await prisma.forecastAccuracy.findMany({
      where: {
        forecastDate: {
          gte: startDate,
          lte: endDate,
        },
        actualUnits: { gt: 0 },
      },
    })

    if (records.length === 0) {
      return {
        overallMape: 0,
        modelPerformance: [],
        topAccuracySkus: [],
        worstAccuracySkus: [],
      }
    }

    // Overall MAPE
    const overallMape =
      records.reduce((sum, r) => sum + Number(r.percentageError), 0) /
      records.length

    // By model
    const modelStats = new Map<
      string,
      { totalError: number; count: number }
    >()

    for (const record of records) {
      const model = record.modelUsed || 'ensemble'
      const current = modelStats.get(model) || { totalError: 0, count: 0 }
      current.totalError += Number(record.percentageError)
      current.count++
      modelStats.set(model, current)
    }

    const modelPerformance = Array.from(modelStats.entries()).map(
      ([model, stats]) => ({
        model: model as ForecastModelType,
        mape: stats.totalError / stats.count,
        sampleSize: stats.count,
      })
    )

    // By SKU
    const skuStats = new Map<string, { totalError: number; count: number }>()

    for (const record of records) {
      const current = skuStats.get(record.masterSku) || {
        totalError: 0,
        count: 0,
      }
      current.totalError += Number(record.percentageError)
      current.count++
      skuStats.set(record.masterSku, current)
    }

    const skuMape = Array.from(skuStats.entries())
      .map(([masterSku, stats]) => ({
        masterSku,
        mape: stats.totalError / stats.count,
      }))
      .sort((a, b) => a.mape - b.mape)

    return {
      overallMape,
      modelPerformance,
      topAccuracySkus: skuMape.slice(0, 10),
      worstAccuracySkus: skuMape.slice(-10).reverse(),
    }
  } catch (error) {
    console.error('Error generating accuracy report:', error)
    return {
      overallMape: 0,
      modelPerformance: [],
      topAccuracySkus: [],
      worstAccuracySkus: [],
    }
  }
}
