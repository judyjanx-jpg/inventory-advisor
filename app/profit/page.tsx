// app/profit/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { PeriodCards } from '@/components/profit/PeriodCards'
import { ProductProfitTable } from '@/components/profit/ProductProfitTable'
import { PeriodSelector } from '@/components/profit/PeriodSelector'
import { GroupBySelector } from '@/components/profit/GroupBySelector'
import { ColumnSelector } from '@/components/profit/ColumnSelector'
import { Download, RefreshCw, FileText, Package } from 'lucide-react'
import type { PeriodType, GroupByType, PresetType, PeriodData, ProductProfit } from '@/types/profit'

// Re-export types for backwards compatibility
export type { PeriodType, GroupByType, PresetType, PeriodData, ProductProfit }

// LocalStorage keys for persisting user preferences
const STORAGE_KEYS = {
  preset: 'profit-dashboard-preset',
  groupBy: 'profit-dashboard-groupBy',
  period: 'profit-dashboard-period',
  columns: 'profit-dashboard-columns',
}

// Helper to safely read from localStorage (handles SSR)
function getStoredValue<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

// Helper to safely write to localStorage
function setStoredValue<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
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
  const [isHydrated, setIsHydrated] = useState(false)
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null)
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null)

  // Load persisted preferences from localStorage on mount
  useEffect(() => {
    const storedPreset = getStoredValue<PresetType>(STORAGE_KEYS.preset, 'default')
    const storedGroupBy = getStoredValue<GroupByType>(STORAGE_KEYS.groupBy, 'sku')
    const storedPeriod = getStoredValue<PeriodType>(STORAGE_KEYS.period, 'yesterday')
    const storedColumns = getStoredValue<string[]>(STORAGE_KEYS.columns, DEFAULT_COLUMNS)

    setSelectedPreset(storedPreset)
    setGroupBy(storedGroupBy)
    setSelectedPeriod(storedPeriod)
    setVisibleColumns(storedColumns)
    setIsHydrated(true)
  }, [])

  // Persist preset to localStorage when it changes
  useEffect(() => {
    if (isHydrated) {
      setStoredValue(STORAGE_KEYS.preset, selectedPreset)
    }
  }, [selectedPreset, isHydrated])

  // Persist groupBy to localStorage when it changes
  useEffect(() => {
    if (isHydrated) {
      setStoredValue(STORAGE_KEYS.groupBy, groupBy)
    }
  }, [groupBy, isHydrated])

  // Persist period to localStorage when it changes
  useEffect(() => {
    if (isHydrated) {
      setStoredValue(STORAGE_KEYS.period, selectedPeriod)
    }
  }, [selectedPeriod, isHydrated])

  // Persist visible columns to localStorage when they change
  useEffect(() => {
    if (isHydrated) {
      setStoredValue(STORAGE_KEYS.columns, visibleColumns)
    }
  }, [visibleColumns, isHydrated])

  // Fetch periods when preset changes (only after hydration)
  useEffect(() => {
    // Wait for hydration to complete before fetching
    if (!isHydrated) return

    console.log('useEffect triggered - selectedPreset changed to:', selectedPreset)

    const fetchPeriodsForPreset = async (preset: PresetType) => {
      console.log('fetchPeriodsForPreset called with:', preset)
      setLoading(true)
      setInitialLoadDone(false)
      try {
        console.log('Fetching periods from API...')
        let url = `/api/profit/periods?preset=${preset}`
        if (preset === 'custom' && customStartDate && customEndDate) {
          url += `&startDate=${customStartDate.toISOString().split('T')[0]}&endDate=${customEndDate.toISOString().split('T')[0]}`
        }
        const periodsRes = await fetch(url)
        console.log('Periods API response status:', periodsRes.status)
        if (periodsRes.ok) {
          const data = await periodsRes.json()
          console.log('Periods API response data:', data)
          const periods = data.periods || []
          console.log('Parsed periods:', periods)
          setPeriodData(periods)
          
          if (periods.length === 0) {
            console.warn('No periods returned from API. Response:', data)
          }

          // Determine which period to use for products
          // Always ensure we have a valid period selected from the fetched periods
          if (periods.length > 0) {
            const periodExists = periods.some((p: PeriodData) => p.period === selectedPeriod)
            const periodToUse = periodExists ? selectedPeriod : periods[0].period as PeriodType

            // Update selected period if it doesn't exist in fetched periods
            if (!periodExists) {
              console.log(`Selected period "${selectedPeriod}" not found in fetched periods, using "${periodToUse}"`)
              setSelectedPeriod(periodToUse)
            }

            // Always fetch products for the selected/fallback period
            let productsUrl = `/api/profit/products?period=${periodToUse}&groupBy=${groupBy}`
            if (preset === 'custom' && customStartDate && customEndDate) {
              productsUrl += `&startDate=${customStartDate.toISOString().split('T')[0]}&endDate=${customEndDate.toISOString().split('T')[0]}`
            }
            console.log('Fetching products for period:', periodToUse)
            const productsRes = await fetch(productsUrl)
            if (productsRes.ok) {
              const prodData = await productsRes.json()
              console.log('Products API response:', prodData)
              setProducts(prodData.products || [])
            } else {
              const errorText = await productsRes.text()
              console.error('Products API error:', productsRes.status, errorText)
            }
          } else {
            console.warn('No periods available, cannot fetch products')
            // Clear products if no periods available
            setProducts([])
          }
        } else {
          const errorText = await periodsRes.text()
          console.error('Periods API error:', periodsRes.status, errorText)
          try {
            const errorData = JSON.parse(errorText)
            console.error('Error details:', errorData)
          } catch {
            // Error text is not JSON
          }
        }
      } catch (error) {
        console.error('Error fetching periods:', error)
      } finally {
        setLoading(false)
        setInitialLoadDone(true)
      }
    }

    fetchPeriodsForPreset(selectedPreset)
  }, [selectedPreset, isHydrated, customStartDate, customEndDate])

  // Fetch products when period or groupBy changes (but not on initial load - useEffect above handles that)
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  useEffect(() => {
    const fetchProductsForCurrentPeriod = async () => {
      // Only fetch if initial load is done AND we have period data
      if (!initialLoadDone || periodData.length === 0) {
        console.log('Skipping product fetch - initialLoadDone:', initialLoadDone, 'periodData.length:', periodData.length)
        return
      }

      // Verify the selected period exists in the fetched periods
      const periodExists = periodData.some((p: PeriodData) => p.period === selectedPeriod)
      if (!periodExists && periodData.length > 0) {
        // If selected period doesn't exist, use the first available period
        const firstPeriod = periodData[0].period as PeriodType
        console.log(`Selected period "${selectedPeriod}" not in periodData, using "${firstPeriod}"`)
        setSelectedPeriod(firstPeriod)
        return // Will trigger this effect again with the new period
      }

      try {
        let url = `/api/profit/products?period=${selectedPeriod}&groupBy=${groupBy}`
        if (selectedPreset === 'custom' && customStartDate && customEndDate) {
          url += `&startDate=${customStartDate.toISOString().split('T')[0]}&endDate=${customEndDate.toISOString().split('T')[0]}`
        }
        console.log('Fetching products for period:', selectedPeriod)
        const productsRes = await fetch(url)
        if (productsRes.ok) {
          const data = await productsRes.json()
          console.log('Products fetched:', data.products?.length || 0, 'products')
          setProducts(data.products || [])
        } else {
          const errorText = await productsRes.text()
          console.error('Products API error:', productsRes.status, errorText)
        }
      } catch (error) {
        console.error('Error fetching products:', error)
      }
    }

    fetchProductsForCurrentPeriod()
  }, [selectedPeriod, groupBy, initialLoadDone, periodData, selectedPreset, customStartDate, customEndDate])

  const fetchDashboardData = async () => {
    // Trigger a refresh by resetting and re-fetching
    setInitialLoadDone(false)
    setLoading(true)
    try {
      let periodsUrl = `/api/profit/periods?preset=${selectedPreset}`
      if (selectedPreset === 'custom' && customStartDate && customEndDate) {
        periodsUrl += `&startDate=${customStartDate.toISOString().split('T')[0]}&endDate=${customEndDate.toISOString().split('T')[0]}`
      }
      const periodsRes = await fetch(periodsUrl)
      if (periodsRes.ok) {
        const data = await periodsRes.json()
        setPeriodData(data.periods || [])
      }
      let productsUrl = `/api/profit/products?period=${selectedPeriod}&groupBy=${groupBy}`
      if (selectedPreset === 'custom' && customStartDate && customEndDate) {
        productsUrl += `&startDate=${customStartDate.toISOString().split('T')[0]}&endDate=${customEndDate.toISOString().split('T')[0]}`
      }
      const productsRes = await fetch(productsUrl)
      if (productsRes.ok) {
        const data = await productsRes.json()
        setProducts(data.products || [])
      }
    } catch (error) {
      console.error('Error refreshing data:', error)
    } finally {
      setLoading(false)
      setInitialLoadDone(true)
    }
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
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Profit Dashboard</h1>
            <p className="text-[var(--muted-foreground)] mt-1">Track profitability by product and period</p>
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector
              selectedPreset={selectedPreset}
              onPresetChange={(preset) => {
                console.log('PeriodSelector onPresetChange called with:', preset)
                setSelectedPreset(preset as PresetType)
                if (preset === 'custom') {
                  setSelectedPeriod('custom')
                }
              }}
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onCustomDateChange={(startDate, endDate) => {
                setCustomStartDate(startDate)
                setCustomEndDate(endDate)
                if (startDate && endDate) {
                  // Trigger fetch when custom dates are set
                  setSelectedPreset('custom')
                  setSelectedPeriod('custom')
                }
              }}
            />
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)] rounded-lg transition-colors disabled:opacity-50"
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
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
          {/* Table Header */}
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h2 className="font-semibold text-[var(--foreground)] text-lg">
                {getPeriodLabel()}
              </h2>
              
              {/* Tabs */}
              <div className="flex">
                <button 
                  onClick={() => setActiveTab('products')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'products' 
                      ? 'text-cyan-400 border-cyan-400' 
                      : 'text-[var(--muted-foreground)] border-transparent hover:text-[var(--foreground)]'
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
                      : 'text-[var(--muted-foreground)] border-transparent hover:text-[var(--foreground)]'
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
                className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)] rounded transition-colors"
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
            <div className="p-12 text-center text-[var(--muted-foreground)]">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Order Items view coming soon</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
