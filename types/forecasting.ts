// Types for the Forecasting domain
// Extracted from app/forecasting/page.tsx to centralize type definitions

export interface ForecastItem {
  sku: string
  title: string
  displayName?: string

  velocity7d: number
  velocity30d: number
  velocity90d: number
  velocityTrend: 'rising' | 'stable' | 'declining'
  velocityChange7d: number
  velocityChange30d: number

  fbaAvailable: number
  fbaInbound: number
  warehouseAvailable: number
  incomingFromPO: number
  incomingPODetails?: Array<{ qty: number; poNumber: string; expectedDate: string | null; status: string }>
  currentInventory: number
  totalInventory: number

  fbaDaysOfSupply: number
  warehouseDaysOfSupply: number
  totalDaysOfSupply: number

  supplierId?: number
  supplierName?: string
  leadTimeDays: number
  cost: number
  moq?: number

  reorderPoint: number
  recommendedOrderQty: number
  recommendedFbaQty: number
  urgency: 'critical' | 'high' | 'medium' | 'low' | 'ok'
  stockoutDate?: string
  daysUntilStockout?: number
  purchaseByDate?: string
  daysToPurchase?: number

  seasonalityFactor: number
  upcomingEvent?: string

  confidence: number
  safetyStock: number

  reasoning: string[]
  salesHistory?: { date: string; units: number; year: number }[]
  selected?: boolean
}

export interface FbaShipmentItem extends ForecastItem {
  sendQty: number
  selected: boolean
}

export interface Supplier {
  id: number
  name: string
  leadTimeDays: number
  productCount: number
}

export interface StockoutEvent {
  id: number
  sku: string
  title: string
  stockoutDate: string
  daysOutOfStock: number
  estimatedLostSales: number
  rootCause: string
  preventionAction: string
  resolved: boolean
}

export interface ForecastSettings {
  purchaseInterval: 'as_needed' | 'monthly' | 'biweekly' | 'weekly'
  purchaseDay: number
  roundToNearest5: boolean
  fbaCapacity: number
  fbaTargetDays: number
  warehouseTargetDays: number
}

export interface TrendData {
  month: string
  [key: string]: number | string
}

// FBA Tab specific types
export interface IncomingPO {
  quantity: number
  expectedDate: string | null
  daysUntil: number | null
  poNumber?: string
}

export interface FbaShipmentItemExtended extends FbaShipmentItem {
  replenishmentNeeded: number
  incoming?: IncomingPO[]
  shipBy: { date: Date; label: string; urgency: 'critical' | 'urgent' | 'soon' | 'normal' }
  statusCategory: 'outOfStock' | 'critical' | 'warning' | 'ok'
  statusDisplay: { label: string; color: string }
  totalDaysOfSupply: number
}

// Filter and sort types
export type UrgencyFilter = 'all' | 'critical' | 'high' | 'medium'
export type SortOption = 'urgency' | 'daysOfSupply' | 'value'
export type PurchasingSortColumn = 'sku' | 'velocity' | 'daysOfStock' | 'incomingPO' | 'orderQty' | 'orderByDate'
export type FbaSortColumn = 'sku' | 'status' | 'velocity' | 'fba' | 'inbound' | 'replenishment' | 'whAvail' | 'shipBy'
export type FbaStatusFilter = 'all' | 'outOfStock' | 'critical' | 'warning' | 'ok'

// Constants
export const DEFAULT_SETTINGS: ForecastSettings = {
  purchaseInterval: 'as_needed',
  purchaseDay: 1,
  roundToNearest5: true,
  fbaCapacity: 1500,
  fbaTargetDays: 45,
  warehouseTargetDays: 135,
}

// Legacy tabs (kept for backwards compatibility)
export const ALL_TABS_LEGACY = ['trends', 'purchasing', 'fba', 'stockouts', 'ai-engine', 'alerts', 'seasonality', 'suppliers', 'safety-stock', 'kpis'] as const

// New simplified tabs per spec
export const ALL_TABS = ['purchasing', 'fba', 'push-readiness', 'deep-dive'] as const

export type TabId = typeof ALL_TABS[number]
export type TabIdLegacy = typeof ALL_TABS_LEGACY[number]

export const LINE_COLORS = [
  '#06B6D4', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899',
  '#3B82F6', '#EF4444', '#84CC16', '#F97316', '#6366F1',
]

// Push Readiness types
export interface PushReadinessResult {
  sku: string
  currentVelocity: number
  maxSustainablePush: number // e.g., 3 means 3x current velocity
  daysOfBuffer: number
  status: 'ready' | 'limited' | 'not_ready'
  limitingFactor?: string // e.g., "warehouse stock", "lead time", "supplier capacity"
}

export interface PushCheckRequest {
  sku: string
  pushMultiplier: number // e.g., 2 for +100%, 3 for +200%
  durationDays: number
}

export interface PushCheckResult {
  ready: boolean
  daysOfBuffer: number
  message: string
  recommendation?: string
}

// Manual Spike types
export interface ManualSpike {
  id: number
  masterSku: string
  spikeType: 'influencer' | 'tiktok' | 'deal' | 'seasonal' | 'marketing' | 'other'
  liftMultiplier: number // e.g., 2 for +100%
  startDate: string
  endDate: string
  notes?: string
  status: 'scheduled' | 'active' | 'completed'
  createdAt: string
}

export interface ManualSpikeResult {
  id: number
  manualSpikeId: number
  predictedLift: number
  actualLift: number
  variance: number
  notes?: string
}

// Growth Watchlist types
export interface GrowthWatchlistItem {
  id: number
  masterSku: string
  targetLift: number // e.g., 1.5 for 50% growth target
  notes?: string
  addedAt: string
  pushReadiness: PushReadinessResult
}

// Deep Dive section types
export type DeepDiveSection =
  | 'factors'
  | 'seasonality'
  | 'manual-spikes'
  | 'anomalies'
  | 'lead-times'
  | 'stockouts'
  | 'model-performance'
  | 'calculation'
