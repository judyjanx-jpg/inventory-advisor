/**
 * Forecasting Types
 *
 * Comprehensive type definitions for the multi-model forecasting engine
 */

// ==========================================
// Model Types
// ==========================================

export type ForecastModelType =
  | 'prophet'
  | 'lstm'
  | 'exponential_smoothing'
  | 'arima'
  | 'ensemble'

export type LocationType = 'fba' | 'warehouse' | 'total'

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low' | 'ok'

export type TrendDirection = 'rising' | 'stable' | 'declining'

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low'

export type GrowthStatus = 'ready_for_growth' | 'maintenance_mode' | 'stock_risk'

export type WatchStatus = 'normal' | 'high_watch' | 'critical'

export type SpikeCause = 'deal' | 'ads' | 'listing_change' | 'organic' | 'unknown'

export type SeasonalEventType = 'micro_peak' | 'major_peak' | 'custom'

export type ImportanceLevel = 'best_seller' | 'regular' | 'slow_mover'

// ==========================================
// Data Interfaces
// ==========================================

export interface SalesDataPoint {
  date: Date
  units: number
  revenue?: number
  channel?: string
}

export interface InventoryPosition {
  fbaAvailable: number
  fbaInbound: number
  fbaReserved: number
  warehouseAvailable: number
  total: number
}

export interface VelocityData {
  velocity7d: number
  velocity30d: number
  velocity90d: number
  trend: TrendDirection
  trendPercent: number
  effectiveVelocity: number
  demandStdDev: number
}

export interface DaysOfSupply {
  fba: number
  warehouse: number
  total: number
}

// ==========================================
// Model Output Interfaces
// ==========================================

export interface ModelPrediction {
  model: ForecastModelType
  forecast: number
  confidence: number
  upperBound: number
  lowerBound: number
  factors: {
    base: number
    trend: number
    seasonality: number
  }
}

export interface EnsembleForecast {
  date: Date
  baseForecast: number
  finalForecast: number
  confidence: number

  // Individual model predictions
  prophetForecast: number | null
  lstmForecast: number | null
  exponentialSmoothingForecast: number | null
  arimaForecast: number | null

  // Applied multipliers
  seasonalityMultiplier: number
  dealMultiplier: number
  spikeMultiplier: number

  // Safety stock and recommendations
  safetyStock: number
  recommendedInventory: number

  // Confidence bounds
  upperBound: number
  lowerBound: number

  // Explanation
  reasoning: string[]
}

// ==========================================
// Accuracy & Learning Interfaces
// ==========================================

export interface ModelAccuracy {
  model: ForecastModelType
  mape: number // Mean Absolute Percentage Error
  rmse: number // Root Mean Squared Error
  mae: number  // Mean Absolute Error
  bias: number // Forecast bias (positive = over-forecasting)
  sampleSize: number
  lastUpdated: Date
}

export interface ModelWeights {
  masterSku: string
  prophetWeight: number
  lstmWeight: number
  exponentialSmoothingWeight: number
  arimaWeight: number
  overallMape: number | null
  lastUpdated: Date
}

export interface BacktestResult {
  masterSku: string
  model: ForecastModelType
  period: {
    start: Date
    end: Date
  }
  metrics: {
    mape: number
    rmse: number
    mae: number
    hitRate: number // % of forecasts within 20% of actual
  }
  forecasts: Array<{
    date: Date
    predicted: number
    actual: number
    error: number
    percentError: number
  }>
}

// ==========================================
// Seasonality Interfaces
// ==========================================

export interface SeasonalEvent {
  id: number
  name: string
  eventType: SeasonalEventType
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
  baseMultiplier: number
  learnedMultiplier: number | null
  skuMultipliers: Record<string, number>
  isActive: boolean
}

export interface SeasonalityPattern {
  month: number
  dayOfWeek?: number
  multiplier: number
  confidence: number
  sampleSize: number
}

export interface DetectedSeasonality {
  hasSeasonality: boolean
  yearlyPattern: SeasonalityPattern[]
  weeklyPattern: SeasonalityPattern[]
  upcomingEvents: Array<{
    event: SeasonalEvent
    daysUntil: number
    multiplier: number
  }>
}

// ==========================================
// Lead Time Interfaces
// ==========================================

export interface LeadTimeData {
  supplierId: number
  supplierName: string

  // Three types of lead times
  statedLeadTime: number     // What supplier promises
  avgActualLeadTime: number  // Calculated from PO history
  worstCaseLeadTime: number  // 95th percentile

  // Reliability metrics
  onTimeRate: number         // 0-1
  leadTimeVariance: number   // Standard deviation
  reliabilityScore: number   // 0-1 composite score

  // FBA receiving times
  avgFbaReceivingTime: number
  worstCaseFbaReceivingTime: number

  // Trend
  isGettingWorse: boolean
  trendPercent: number

  poCount: number
  lastCalculated: Date
}

export interface LeadTimeAlert {
  supplierId: number
  supplierName: string
  alertType: 'variance_increase' | 'avg_increase' | 'reliability_drop'
  severity: AlertSeverity
  message: string
  previousValue: number
  currentValue: number
  recommendedAction: string
}

// ==========================================
// New Item Forecasting Interfaces
// ==========================================

export interface AnalogSkuMatch {
  analogSku: string
  matchScore: number // 0-1
  matchReasons: string[]
  matchCriteria: {
    category: boolean
    priceRange: boolean
    brand: boolean
    supplier: boolean
  }
  analogPerformance: {
    avgVelocity30d: number
    avgVelocity90d: number
    firstMonthVelocity: number
  }
}

export interface NewItemForecast {
  masterSku: string
  isNewItem: boolean
  daysSinceLaunch: number
  watchStatus: WatchStatus

  // Analog-based forecasting
  analogSku: string | null
  analogMatchScore: number | null

  // Forecast
  baseVelocity: number
  adjustedVelocity: number
  confidence: number

  // Monitoring
  nextCheckDate: Date
  checkFrequency: 'daily' | 'every_3_days' | 'weekly'

  // Performance vs forecast
  actualVsForecasted: number | null // % difference
  needsRecalibration: boolean
}

// ==========================================
// Spike Detection Interfaces
// ==========================================

export interface SpikeDetection {
  masterSku: string
  isSpiking: boolean
  spikeMultiplier: number
  daysSpiking: number
  spikeStartDate: Date | null

  // Cause analysis
  probableCause: SpikeCause
  causeConfidence: number
  causeDetails: {
    adSpendChange?: number
    listingChangeDate?: Date
    activeDeal?: string
  }

  // Impact
  currentVelocity: number
  baselineVelocity: number

  // Recommendations
  inventoryImpact: {
    daysOfSupplyAtNewRate: number
    additionalUnitsNeeded: number
    urgency: UrgencyLevel
  }

  // Decay projection
  projectedDecay: Array<{
    daysFromNow: number
    projectedMultiplier: number
  }>
}

// ==========================================
// Deal & Promotion Interfaces
// ==========================================

export interface DealPerformance {
  dealId: string
  masterSku: string
  dealType: 'lightning' | '7day' | 'coupon' | 'prime_day' | 'bfcm' | 'custom'

  // Timing
  startDate: Date
  endDate: Date
  discountPercent: number

  // Performance
  actualSalesLift: number // Multiplier vs baseline
  expectedSalesLift: number

  // Context
  dayOfWeek: number
  isHolidaySeason: boolean
  isPrimeDay: boolean
}

export interface ScheduledDeal {
  dealId: string
  masterSku: string
  dealType: string
  startDate: Date
  endDate: Date
  discountPercent: number
  expectedSalesLift: number

  // Inventory requirements
  requiredUnits: number
  currentFbaUnits: number
  shortfall: number
  sendByDate: Date
}

// ==========================================
// Safety Stock Interfaces
// ==========================================

export interface SafetyStockCalculation {
  masterSku: string

  // Inputs
  demandStdDev: number
  leadTimeDays: number
  leadTimeStdDev: number
  serviceLevelTarget: number // e.g., 0.95 for 95%
  zScore: number
  importance: ImportanceLevel

  // Calculation
  safetyStock: number

  // Adjustments
  seasonalityAdjustment: number
  supplierReliabilityAdjustment: number
  finalSafetyStock: number

  // Reasoning
  reasoning: string[]
}

// ==========================================
// Anomaly & Root Cause Interfaces
// ==========================================

export interface AnomalyEvent {
  id: string
  masterSku: string
  eventType: 'stockout' | 'overstock' | 'storage_fee_spike' | 'forecast_miss'

  // Timing
  detectedAt: Date
  startDate: Date
  endDate: Date | null
  durationDays: number

  // Impact
  financialImpact: number // Estimated $ impact
  unitImpact: number // Units affected

  // Root cause
  rootCause: string
  rootCauseConfidence: number
  contributingFactors: Array<{
    factor: string
    contribution: number // % contribution to issue
  }>

  // Corrective actions
  automaticAdjustments: Array<{
    parameter: string
    oldValue: number
    newValue: number
    reason: string
  }>

  // Resolution
  isResolved: boolean
  resolvedAt: Date | null
  notes: string
}

// ==========================================
// Alert Interfaces
// ==========================================

export interface ForecastAlert {
  id: string
  masterSku: string | null

  alertType:
    | 'stockout_imminent'
    | 'seasonal_prep'
    | 'spike_detected'
    | 'forecast_accuracy_low'
    | 'supplier_reliability'
    | 'new_item_deviation'
    | 'deal_inventory'
    | 'goal_adjustment'

  severity: AlertSeverity
  urgency: UrgencyLevel

  title: string
  message: string
  context: Record<string, any>

  // Actionable
  recommendedAction: string
  actionDeadline: Date | null

  // Status
  isRead: boolean
  isResolved: boolean
  isDismissed: boolean

  createdAt: Date
}

// ==========================================
// Reporting Interfaces
// ==========================================

export interface AccuracyReport {
  period: {
    start: Date
    end: Date
  }

  // Overall metrics
  overallMape: number
  previousPeriodMape: number | null
  improvement: number | null

  // By model
  modelPerformance: Array<{
    model: ForecastModelType
    mape: number
    skuCount: number
    bestForSkus: string[]
  }>

  // By SKU category
  categoryPerformance: Array<{
    category: string
    mape: number
    skuCount: number
  }>

  // Top/Bottom performers
  topAccuracySkus: Array<{
    masterSku: string
    mape: number
  }>
  worstAccuracySkus: Array<{
    masterSku: string
    mape: number
    reason: string
  }>
}

export interface WeeklyReport {
  weekOf: Date

  // Accuracy
  forecastAccuracy: number
  accuracyTrend: 'improving' | 'stable' | 'declining'

  // Inventory health
  skusRequiringOrders: Array<{
    masterSku: string
    urgency: UrgencyLevel
    recommendedQty: number
    reason: string
  }>

  // Seasonal prep
  upcomingEvents: Array<{
    event: string
    daysUntil: number
    prepStatus: 'ready' | 'needs_attention' | 'at_risk'
    skusAffected: number
  }>

  // Anomalies
  anomaliesDetected: number
  anomaliesSummary: string[]
}

// ==========================================
// Configuration Interfaces
// ==========================================

export interface ForecastConfig {
  // Target inventory levels (days)
  targets: {
    fba: number
    warehouse: number
    total: number
  }

  // FBA settings
  fbaReceivingDays: number
  fbaReceivingBuffer: number

  // Safety stock Z-scores
  safetyStockZScore: {
    bestSeller: number
    regular: number
    slowMover: number
  }

  // Urgency thresholds
  urgencyThresholds: {
    critical: number
    high: number
    medium: number
    low: number
  }

  // New item settings
  newItemThresholds: {
    dailyCheckDays: number
    triDailyCheckDays: number
    recalibrationThreshold: number // % deviation
  }

  // Spike detection
  spikeDetection: {
    threshold: number // % increase
    minConsecutiveDays: number
    decayPeriodDays: number
  }

  // Model settings
  modelSettings: {
    minDataPoints: number
    lookbackDays: number
    forecastHorizon: number
  }
}

// ==========================================
// Goal Optimization Interfaces
// ==========================================

export interface GoalAnalysis {
  // Current targets
  currentTargets: {
    fba: number
    warehouse: number
    total: number
  }

  // Performance metrics
  metrics: {
    stockoutRate: number // % of SKUs that stocked out
    excessInventoryCost: number // $ tied up in excess
    averageDaysOfSupply: number
    storageFeesMonthly: number
  }

  // Recommendations
  recommendations: Array<{
    target: 'fba' | 'warehouse' | 'total'
    currentValue: number
    recommendedValue: number
    reason: string
    projectedSavings: number
    projectedRisk: string
  }>

  // Per-category recommendations
  categoryRecommendations: Array<{
    category: string
    currentTarget: number
    recommendedTarget: number
    reason: string
  }>

  // Seasonal adjustments
  seasonalAdjustments: Array<{
    period: string
    recommendedTarget: number
    reason: string
  }>
}
