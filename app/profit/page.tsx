// app/profit/page.tsx
'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { PeriodCards } from '@/components/profit/PeriodCards'
import { ProductProfitTable } from '@/components/profit/ProductProfitTable'
import { PeriodSelector } from '@/components/profit/PeriodSelector'
import { GroupBySelector } from '@/components/profit/GroupBySelector'
import { ColumnSelector } from '@/components/profit/ColumnSelector'
import { Download, RefreshCw, FileText, Package } from 'lucide-react'

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
  title: string
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

const DEFAULT_COLUMNS = [
  'unitsSold',
  'refunds',
  'sales',
  'adSpend',
  'cogs',
  'netProfit',
  'roi',
  'realAcos',
]

export default function ProfitDashboard() {
  const [periodData, setPeriodData] = useState<PeriodData[]>([])
  const [products, setProducts] = useState<ProductProfit[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('yesterday')
  const [selectedPreset, setSelectedPreset] = useState<PresetType>('default')
  const [groupBy, setGroupBy] = useState<GroupByType>('sku')
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS)
  const [compareMode, setCompareMode] = useState<'none' | 'previous' | 'lastYear'>('none')
  const [activeTab, setActiveTab] = useState<'products' | 'orders'>('products')

  // Fetch periods when preset changes
  useEffect(() => {
    setInitialLoadDone(false)  // Reset so fetchPeriods handles product fetch
    fetchPeriods()
  }, [selectedPreset])

  // Fetch products when period or groupBy changes (but not on initial load - fetchPeriods handles that)
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  useEffect(() => {
    if (initialLoadDone && periodData.length > 0) {
      fetchProducts()
    }
  }, [selectedPeriod, groupBy])

  const fetchPeriods = async () => {
    setLoading(true)
    try {
      const periodsRes = await fetch(`/api/profit/periods?preset=${selectedPreset}`)
      if (periodsRes.ok) {
        const data = await periodsRes.json()
        const periods = data.periods || []
        setPeriodData(periods)

        // Determine which period to use for products
        if (periods.length > 0) {
          const periodExists = periods.some((p: PeriodData) => p.period === selectedPeriod)
          const periodToUse = periodExists ? selectedPeriod : periods[0].period as PeriodType

          if (!periodExists) {
            setSelectedPeriod(periodToUse)
          }

          // Fetch products for the correct period
          await fetchProductsForPeriod(periodToUse)
        }
      }
    } catch (error) {
      console.error('Error fetching periods:', error)
    } finally {
      setLoading(false)
      setInitialLoadDone(true)
    }
  }

  const fetchProducts = async () => {
    await fetchProductsForPeriod(selectedPeriod)
  }

  const fetchProductsForPeriod = async (period: PeriodType) => {
    try {
      const productsRes = await fetch(`/api/profit/products?period=${period}&groupBy=${groupBy}`)
      if (productsRes.ok) {
        const data = await productsRes.json()
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  const fetchDashboardData = async () => {
    await fetchPeriods()
  }

  const handleExport = () => {
    // TODO: Implement CSV export
    console.log('Export clicked')
  }

  const getPeriodLabel = () => {
    switch (selectedPeriod) {
      case 'today': return 'Today'
      case 'yesterday': return 'Yesterday'
      case 'mtd': return 'Month to Date'
      case 'forecast': return 'This Month (Forecast)'
      case 'lastMonth': return 'Last Month'
      default: return selectedPeriod
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Profit Dashboard</h1>
            <p className="text-slate-400 mt-1">Track profitability by product and period</p>
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector
              selectedPreset={selectedPreset}
              onPresetChange={(preset) => setSelectedPreset(preset as PresetType)}
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
            />
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Period Cards */}
        <PeriodCards 
          data={periodData} 
          loading={loading}
          selectedPeriod={selectedPeriod}
          onPeriodSelect={setSelectedPeriod}
        />

        {/* Product Table Section */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          {/* Table Header */}
          <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h2 className="font-semibold text-white text-lg">
                {getPeriodLabel()}
              </h2>
              
              {/* Tabs */}
              <div className="flex">
                <button 
                  onClick={() => setActiveTab('products')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'products' 
                      ? 'text-cyan-400 border-cyan-400' 
                      : 'text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  Products
                </button>
                <button 
                  onClick={() => setActiveTab('orders')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'orders' 
                      ? 'text-cyan-400 border-cyan-400' 
                      : 'text-slate-400 border-transparent hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Order Items
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <GroupBySelector value={groupBy} onChange={setGroupBy} />
              <ColumnSelector 
                visibleColumns={visibleColumns} 
                onChange={setVisibleColumns} 
              />
              <button 
                onClick={handleExport}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                title="Export CSV"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Product Table */}
          {activeTab === 'products' ? (
            <ProductProfitTable 
              products={products}
              loading={loading}
              visibleColumns={visibleColumns}
              groupBy={groupBy}
            />
          ) : (
            <div className="p-12 text-center text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Order Items view coming soon</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
