// types/profit.ts
// Shared types for profit dashboard to avoid circular imports

export type PeriodType = 'today' | 'yesterday' | '2daysAgo' | '3daysAgo' | '7days' | '14days' | '30days' | 'mtd' | 'forecast' | 'lastMonth'
export type GroupByType = 'sku' | 'asin' | 'parent' | 'brand' | 'supplier' | 'channel'
export type PresetType = 'default' | 'simple' | 'days' | 'recent' | 'months'

export interface PeriodData {
  period: string
  dateRange: string
  sales: number
  salesChange?: number
  orders: number
  units: number
  promos: number
  refunds: number
  refundCount: number
  adCost: number
  amazonFees: number
  cogs: number
  grossProfit: number
  netProfit: number
  netProfitChange?: number
  estPayout: number
  margin: number
  roi: number
  acos: number | null
  tacos: number | null
  realAcos: number | null
}

export interface ProductProfit {
  id: string
  sku: string
  asin: string
  parentAsin?: string
  displayName?: string  // Internal SKU/name set by user
  title: string         // Amazon product title
  imageUrl?: string
  brand?: string
  supplier?: string
  channel?: string
  unitsSold: number
  refunds: number
  refundRate: number
  sales: number
  adSpend: number
  cogs: number
  cogsTotal: number
  amazonFees: number
  netProfit: number
  margin: number
  roi: number
  realAcos: number | null
  sessions: number
  unitSessionPct: number
  bsr?: number
  bsrChange?: number
}
