/**
 * LSTM-like Pattern Recognition Model
 *
 * This implements a pattern-based forecasting model that mimics LSTM behavior:
 * - Sequence pattern learning
 * - Attention-like weighting for recent data
 * - Recognition of similar historical patterns
 *
 * Note: This is a statistical approximation of LSTM behavior,
 * not an actual neural network implementation.
 */

import { SalesDataPoint, ModelPrediction } from '../types'

interface LstmParams {
  sequenceLength: number     // Number of past days to consider
  numPatterns: number        // Number of patterns to learn
  attentionDecay: number     // Exponential decay for attention weights
  patternMatchThreshold: number // Minimum similarity for pattern matching
  learningRate: number       // How much to weight recent patterns
}

interface Pattern {
  sequence: number[]         // Normalized sequence values
  outcome: number            // What followed the pattern
  weight: number             // Pattern importance
  timestamp: number          // When pattern occurred
}

interface PatternLibrary {
  patterns: Pattern[]
  mean: number
  stdDev: number
  seasonalPattern: number[]  // Weekly pattern
}

const DEFAULT_PARAMS: LstmParams = {
  sequenceLength: 14,
  numPatterns: 100,
  attentionDecay: 0.95,
  patternMatchThreshold: 0.7,
  learningRate: 0.1,
}

/**
 * LSTM-like forecasting using pattern recognition
 */
export function lstmForecast(
  salesData: SalesDataPoint[],
  daysAhead: number,
  params: Partial<LstmParams> = {}
): ModelPrediction {
  const config = { ...DEFAULT_PARAMS, ...params }

  if (salesData.length < config.sequenceLength * 2) {
    return fallbackForecast(salesData, daysAhead)
  }

  // Build pattern library
  const library = buildPatternLibrary(salesData, config)

  // Get current sequence
  const currentSequence = normalizeSequence(
    salesData.slice(-config.sequenceLength).map((d) => d.units),
    library.mean,
    library.stdDev
  )

  // Find matching patterns
  const matches = findMatchingPatterns(currentSequence, library, config)

  // Generate forecast using attention mechanism
  const forecasts = generateAttentionForecast(
    salesData,
    matches,
    library,
    daysAhead,
    config
  )

  // Calculate average forecast
  const avgForecast = forecasts.reduce((a, b) => a + b, 0) / forecasts.length

  // Calculate confidence based on pattern matches
  const confidence = calculateConfidence(matches, salesData.length, config)

  // Calculate bounds
  const values = salesData.map((d) => d.units)
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + (v - library.mean) ** 2, 0) / values.length
  )
  const upperBound = avgForecast + 1.96 * stdDev * Math.sqrt(1 + daysAhead / 30)
  const lowerBound = Math.max(0, avgForecast - 1.96 * stdDev * Math.sqrt(1 + daysAhead / 30))

  return {
    model: 'lstm',
    forecast: avgForecast,
    confidence,
    upperBound,
    lowerBound,
    factors: {
      base: library.mean,
      trend: calculateTrend(salesData, config),
      seasonality: calculateSeasonalityFactor(library.seasonalPattern),
    },
  }
}

/**
 * Build a library of patterns from historical data
 */
function buildPatternLibrary(
  salesData: SalesDataPoint[],
  params: LstmParams
): PatternLibrary {
  const values = salesData.map((d) => d.units)

  // Calculate statistics
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  )

  // Extract weekly seasonal pattern
  const seasonalPattern = extractWeeklyPattern(salesData)

  // Extract patterns
  const patterns: Pattern[] = []
  const n = salesData.length

  for (let i = params.sequenceLength; i < n - 1; i++) {
    const sequence = values.slice(i - params.sequenceLength, i)
    const normalizedSeq = normalizeSequence(sequence, mean, stdDev)
    const outcome = values[i]

    // Weight more recent patterns higher
    const recency = (i - params.sequenceLength) / (n - params.sequenceLength - 1)
    const weight = 0.5 + 0.5 * recency // Range: 0.5 to 1.0

    patterns.push({
      sequence: normalizedSeq,
      outcome,
      weight,
      timestamp: i,
    })
  }

  // Keep only top patterns by weight
  patterns.sort((a, b) => b.weight - a.weight)
  const topPatterns = patterns.slice(0, params.numPatterns)

  return {
    patterns: topPatterns,
    mean,
    stdDev,
    seasonalPattern,
  }
}

/**
 * Normalize a sequence for pattern matching
 */
function normalizeSequence(
  sequence: number[],
  mean: number,
  stdDev: number
): number[] {
  if (stdDev === 0) return sequence.map(() => 0)

  return sequence.map((v) => (v - mean) / stdDev)
}

/**
 * Extract weekly seasonal pattern
 */
function extractWeeklyPattern(salesData: SalesDataPoint[]): number[] {
  const dayTotals: number[] = [0, 0, 0, 0, 0, 0, 0]
  const dayCounts: number[] = [0, 0, 0, 0, 0, 0, 0]

  for (const data of salesData) {
    const dayOfWeek = data.date.getDay()
    dayTotals[dayOfWeek] += data.units
    dayCounts[dayOfWeek]++
  }

  const dayAverages = dayTotals.map((total, i) =>
    dayCounts[i] > 0 ? total / dayCounts[i] : 0
  )

  const overallAvg = dayAverages.reduce((a, b) => a + b, 0) / 7

  // Return as multipliers (1.0 = average)
  return dayAverages.map((avg) => (overallAvg > 0 ? avg / overallAvg : 1))
}

/**
 * Find patterns matching the current sequence
 */
function findMatchingPatterns(
  currentSequence: number[],
  library: PatternLibrary,
  params: LstmParams
): Array<{ pattern: Pattern; similarity: number }> {
  const matches: Array<{ pattern: Pattern; similarity: number }> = []

  for (const pattern of library.patterns) {
    const similarity = calculateSimilarity(currentSequence, pattern.sequence)

    if (similarity >= params.patternMatchThreshold) {
      matches.push({ pattern, similarity })
    }
  }

  // Sort by similarity (descending)
  matches.sort((a, b) => b.similarity - a.similarity)

  return matches
}

/**
 * Calculate similarity between two sequences using cosine similarity
 */
function calculateSimilarity(seq1: number[], seq2: number[]): number {
  if (seq1.length !== seq2.length) return 0

  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < seq1.length; i++) {
    dotProduct += seq1[i] * seq2[i]
    norm1 += seq1[i] ** 2
    norm2 += seq2[i] ** 2
  }

  if (norm1 === 0 || norm2 === 0) return 0

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
}

/**
 * Generate forecast using attention-weighted pattern matching
 */
function generateAttentionForecast(
  salesData: SalesDataPoint[],
  matches: Array<{ pattern: Pattern; similarity: number }>,
  library: PatternLibrary,
  daysAhead: number,
  params: LstmParams
): number[] {
  const forecasts: number[] = []
  const n = salesData.length

  // Calculate recent trend
  const recentValues = salesData.slice(-14).map((d) => d.units)
  const recentMean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length
  const trendFactor = recentMean / library.mean

  for (let h = 1; h <= daysAhead; h++) {
    let weightedSum = 0
    let totalWeight = 0

    // Attention weights: combine similarity with recency
    for (const { pattern, similarity } of matches) {
      // Recency weight (more recent patterns get higher attention)
      const recency = Math.pow(params.attentionDecay, n - pattern.timestamp)

      // Combined attention weight
      const attention = similarity * pattern.weight * (1 + recency)

      weightedSum += pattern.outcome * attention
      totalWeight += attention
    }

    // Base forecast from pattern matching
    let forecast: number

    if (totalWeight > 0) {
      forecast = weightedSum / totalWeight
    } else {
      // Fallback to simple average with trend
      forecast = library.mean * trendFactor
    }

    // Apply seasonal adjustment
    const futureDate = new Date(salesData[n - 1].date)
    futureDate.setDate(futureDate.getDate() + h)
    const dayOfWeek = futureDate.getDay()
    const seasonalMultiplier = library.seasonalPattern[dayOfWeek]

    forecast *= seasonalMultiplier

    // Apply trend with decay
    const trendDecay = Math.pow(0.99, h)
    forecast *= (1 + (trendFactor - 1) * trendDecay)

    forecasts.push(Math.max(0, forecast))
  }

  return forecasts
}

/**
 * Calculate confidence based on pattern matches
 */
function calculateConfidence(
  matches: Array<{ pattern: Pattern; similarity: number }>,
  dataLength: number,
  params: LstmParams
): number {
  // Data quantity score
  const dataScore = Math.min(1, dataLength / 180)

  // Pattern match quality score
  let matchScore = 0
  if (matches.length > 0) {
    const avgSimilarity = matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length
    matchScore = avgSimilarity * Math.min(1, matches.length / 10)
  }

  // Combine scores
  return dataScore * 0.4 + matchScore * 0.6
}

/**
 * Calculate trend factor
 */
function calculateTrend(
  salesData: SalesDataPoint[],
  params: LstmParams
): number {
  const n = salesData.length
  if (n < 14) return 0

  const recent7 = salesData.slice(-7).map((d) => d.units)
  const older7 = salesData.slice(-14, -7).map((d) => d.units)

  const recentAvg = recent7.reduce((a, b) => a + b, 0) / 7
  const olderAvg = older7.reduce((a, b) => a + b, 0) / 7

  if (olderAvg === 0) return 0

  return (recentAvg - olderAvg) / olderAvg
}

/**
 * Calculate seasonality factor
 */
function calculateSeasonalityFactor(seasonalPattern: number[]): number {
  const maxMultiplier = Math.max(...seasonalPattern)
  const minMultiplier = Math.min(...seasonalPattern)
  return maxMultiplier / Math.max(minMultiplier, 0.1)
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
      model: 'lstm',
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

  // Simple trend
  let trend = 0
  if (salesData.length >= 7) {
    const recent = values.slice(-7)
    const recentMean = recent.reduce((a, b) => a + b, 0) / 7
    trend = (recentMean - mean) / mean
  }

  const forecast = mean * (1 + trend * daysAhead / 30)

  return {
    model: 'lstm',
    forecast: Math.max(0, forecast),
    confidence: Math.min(0.4, salesData.length / 90),
    upperBound: forecast + 1.96 * stdDev,
    lowerBound: Math.max(0, forecast - 1.96 * stdDev),
    factors: {
      base: mean,
      trend,
      seasonality: 1,
    },
  }
}

/**
 * Generate daily LSTM forecasts
 */
export function lstmDaily(
  salesData: SalesDataPoint[],
  daysAhead: number,
  params: Partial<LstmParams> = {}
): Array<{ date: Date; forecast: number; confidence: number }> {
  const config = { ...DEFAULT_PARAMS, ...params }

  if (salesData.length < config.sequenceLength * 2) {
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

  const library = buildPatternLibrary(salesData, config)
  const currentSequence = normalizeSequence(
    salesData.slice(-config.sequenceLength).map((d) => d.units),
    library.mean,
    library.stdDev
  )
  const matches = findMatchingPatterns(currentSequence, library, config)
  const forecasts = generateAttentionForecast(
    salesData,
    matches,
    library,
    daysAhead,
    config
  )

  const baseConfidence = calculateConfidence(matches, salesData.length, config)
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

/**
 * Learn from a new data point (online learning)
 */
export function updatePattern(
  library: PatternLibrary,
  newDataPoint: SalesDataPoint,
  recentSequence: number[],
  params: LstmParams
): PatternLibrary {
  const normalizedSeq = normalizeSequence(recentSequence, library.mean, library.stdDev)

  const newPattern: Pattern = {
    sequence: normalizedSeq,
    outcome: newDataPoint.units,
    weight: 1.0, // New patterns start with high weight
    timestamp: Date.now(),
  }

  // Add new pattern
  library.patterns.push(newPattern)

  // Remove oldest low-weight patterns if over limit
  if (library.patterns.length > params.numPatterns) {
    library.patterns.sort((a, b) => b.weight - a.weight)
    library.patterns = library.patterns.slice(0, params.numPatterns)
  }

  // Update mean incrementally
  const n = library.patterns.length
  library.mean = (library.mean * (n - 1) + newDataPoint.units) / n

  // Update stdDev (approximate)
  const newVariance =
    library.patterns.reduce(
      (sum, p) => sum + (p.outcome - library.mean) ** 2,
      0
    ) / n
  library.stdDev = Math.sqrt(newVariance)

  return library
}

/**
 * Detect anomalous patterns
 */
export function detectAnomalousPattern(
  currentSequence: number[],
  library: PatternLibrary,
  params: LstmParams
): { isAnomalous: boolean; anomalyScore: number; reason: string } {
  const normalizedSeq = normalizeSequence(
    currentSequence,
    library.mean,
    library.stdDev
  )

  // Find best matching pattern
  let bestSimilarity = 0
  for (const pattern of library.patterns) {
    const similarity = calculateSimilarity(normalizedSeq, pattern.sequence)
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
    }
  }

  // If no good match found, it's anomalous
  const isAnomalous = bestSimilarity < params.patternMatchThreshold * 0.8
  const anomalyScore = 1 - bestSimilarity

  let reason = ''
  if (isAnomalous) {
    // Analyze why it's anomalous
    const recentMean = currentSequence.reduce((a, b) => a + b, 0) / currentSequence.length
    const expectedMean = library.mean

    if (recentMean > expectedMean * 1.5) {
      reason = 'Unusual spike in sales'
    } else if (recentMean < expectedMean * 0.5) {
      reason = 'Unusual drop in sales'
    } else {
      reason = 'Unusual pattern shape'
    }
  }

  return { isAnomalous, anomalyScore, reason }
}
