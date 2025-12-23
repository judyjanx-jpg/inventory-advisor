'use client'

import React, { useState, useEffect, useMemo } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import {
  ShoppingCart, Truck, Rocket, Microscope,
  RefreshCw, Settings, Brain
} from 'lucide-react'
import {
  TabButton,
  SettingsPanel,
  PurchasingTab,
  FbaTab,
  PushReadinessTab,
  DeepDiveTab,
  DashboardHeader,
} from '@/components/forecasting'
import {
  ForecastItem,
  Supplier,
  StockoutEvent,
  ForecastSettings,
  DEFAULT_SETTINGS,
  ALL_TABS,
  TabId,
} from '@/types/forecasting'

// Tab configuration for the new 4-tab structure
const TAB_CONFIG: Record<TabId, { icon: React.ReactNode; label: string; color: string }> = {
  purchasing: {
    icon: <ShoppingCart className="w-5 h-5" />,
    label: "Purchasing",
    color: "bg-cyan-600"
  },
  fba: {
    icon: <Truck className="w-5 h-5" />,
    label: "FBA Replenishment",
    color: "bg-purple-600"
  },
  'push-readiness': {
    icon: <Rocket className="w-5 h-5" />,
    label: "Push Readiness",
    color: "bg-green-600"
  },
  'deep-dive': {
    icon: <Microscope className="w-5 h-5" />,
    label: "Deep Dive",
    color: "bg-indigo-600"
  }
}

export default function ForecastingPage() {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('forecastingActiveTab')
      if (saved && ALL_TABS.includes(saved as TabId)) {
        return saved as TabId
      }
    }
    return 'purchasing'
  })

  // Core data state
  const [items, setItems] = useState<ForecastItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [stockouts, setStockouts] = useState<StockoutEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)

  // Filters (used by purchasing tab)
  const [selectedSupplier, setSelectedSupplier] = useState<number | 'all'>('all')
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all')
  const [sortBy, setSortBy] = useState<'urgency' | 'daysOfSupply' | 'value'>('urgency')

  // Selection for batch actions (Purchasing tab)
  const [purchaseSelectedSkus, setPurchaseSelectedSkus] = useState<Set<string>>(new Set())

  // Persist active tab to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('forecastingActiveTab', activeTab)
    }
  }, [activeTab])

  // Fetch data on mount
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [forecastRes, suppliersRes, stockoutsRes] = await Promise.all([
        fetch('/api/forecasting/recommendations'),
        fetch('/api/suppliers?withProductCount=true'),
        fetch('/api/forecasting/stockouts'),
      ])

      const forecastData = await forecastRes.json()
      if (forecastData.success) {
        setItems(forecastData.items)
      }

      const suppliersData = await suppliersRes.json()
      if (suppliersData.success) {
        setSuppliers(suppliersData.suppliers || [])
      }

      const stockoutsData = await stockoutsRes.json()
      if (stockoutsData.success) {
        setStockouts(stockoutsData.stockouts || [])
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Computed: filtered items for purchasing tab
  const filteredItems = useMemo(() => {
    let filtered = [...items]

    if (selectedSupplier !== 'all') {
      filtered = filtered.filter(item => item.supplierId === selectedSupplier)
    }

    if (filter !== 'all') {
      filtered = filtered.filter(item => item.urgency === filter)
    }

    if (activeTab === 'purchasing') {
      filtered = filtered.filter(item =>
        item.totalDaysOfSupply < (settings.warehouseTargetDays + settings.fbaTargetDays) ||
        item.urgency !== 'ok'
      )
    }

    const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, ok: 4 }
    filtered.sort((a, b) => {
      if (sortBy === 'urgency') return (urgencyOrder[a.urgency] || 4) - (urgencyOrder[b.urgency] || 4)
      if (sortBy === 'daysOfSupply') return a.totalDaysOfSupply - b.totalDaysOfSupply
      return (b.recommendedOrderQty * b.cost) - (a.recommendedOrderQty * a.cost)
    })

    return filtered
  }, [items, selectedSupplier, filter, activeTab, sortBy, settings])

  // Utility: apply rounding to quantities
  const applyRounding = (qty: number): number => {
    if (!settings.roundToNearest5) return qty
    return Math.ceil(qty / 5) * 5
  }

  // Handler: toggle purchase selection
  const togglePurchaseSelection = (sku: string) => {
    const newSelected = new Set(purchaseSelectedSkus)
    if (newSelected.has(sku)) {
      newSelected.delete(sku)
    } else {
      newSelected.add(sku)
    }
    setPurchaseSelectedSkus(newSelected)
  }

  // Handler: select all for purchase
  const selectAllPurchase = () => {
    if (purchaseSelectedSkus.size === filteredItems.length) {
      setPurchaseSelectedSkus(new Set())
    } else {
      setPurchaseSelectedSkus(new Set(filteredItems.map(i => i.sku)))
    }
  }

  // Handler: create purchase order
  const createPurchaseOrder = async () => {
    if (purchaseSelectedSkus.size === 0) return

    const selectedItems = filteredItems.filter(i => purchaseSelectedSkus.has(i.sku))
    const poData = selectedItems.map(item => ({
      sku: item.sku,
      quantity: applyRounding(item.recommendedOrderQty),
      unitCost: item.cost,
      supplierId: item.supplierId,
    }))

    try {
      const response = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: poData }),
      })

      if (response.ok) {
        alert('Purchase Order created!')
        setPurchaseSelectedSkus(new Set())
      }
    } catch (error) {
      console.error('Failed to create PO:', error)
    }
  }

  // Handler: hide product from forecasting
  const hideProduct = async (sku: string) => {
    try {
      const res = await fetch('/api/products/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, hidden: true })
      })
      if (res.ok) {
        // Remove from local state immediately
        setItems(prev => prev.filter(i => i.sku !== sku))
      }
    } catch (error) {
      console.error('Failed to hide product:', error)
    }
  }

  // Handler: bulk hide multiple products
  const bulkHideProducts = async (skus: string[]) => {
    if (skus.length === 0) return
    
    try {
      // Hide all products in parallel
      await Promise.all(skus.map(sku => 
        fetch('/api/products/hide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku, hidden: true })
        })
      ))
      
      // Remove from local state
      setItems(prev => prev.filter(i => !skus.includes(i.sku)))
      setPurchaseSelectedSkus(new Set())
    } catch (error) {
      console.error('Failed to bulk hide products:', error)
    }
  }

  // Handler: clear purchase selection
  const clearPurchaseSelection = () => {
    setPurchaseSelectedSkus(new Set())
  }

  // Handler: flag a spike from push readiness
  const handleFlagSpike = async (sku: string, multiplier: number, durationDays: number) => {
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + durationDays)

    try {
      const response = await fetch('/api/forecasting/manual-spikes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterSku: sku,
          spikeType: 'marketing',
          liftMultiplier: multiplier,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          notes: `Flagged from Push Readiness check - ${multiplier}x for ${durationDays} days`,
        }),
      })

      if (response.ok) {
        alert('Spike flagged successfully!')
      }
    } catch (error) {
      console.error('Failed to flag spike:', error)
    }
  }

  // Utility: get urgency color class
  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default: return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  // Utility: format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
  }

  // Utility: format percent
  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  // Helper: get tab badge count
  const getTabBadgeCount = (tabId: TabId): number | undefined => {
    switch (tabId) {
      case 'purchasing':
        return items.filter(i => i.urgency === 'critical' || i.urgency === 'high').length
      case 'fba':
        return items.filter(i => i.fbaDaysOfSupply < 14 && i.warehouseAvailable > 0).length
      default:
        return undefined
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
              <Brain className="w-7 h-7 text-cyan-500" />
              Inventory Forecasting
            </h1>
            <p className="text-gray-400 mt-1">AI-powered predictions based on your sales history</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] hover:bg-[var(--secondary)] rounded-lg border border-[var(--border)]"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Dashboard Header with 3 Key Metrics */}
        <DashboardHeader items={items} fbaTargetDays={settings.fbaTargetDays} />

        {/* Settings Panel */}
        {showSettings && (
          <SettingsPanel settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} />
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[var(--border)] pb-4">
          {ALL_TABS.map((tabId) => {
            const config = TAB_CONFIG[tabId]
            if (!config) return null

            return (
              <TabButton
                key={tabId}
                active={activeTab === tabId}
                onClick={() => setActiveTab(tabId)}
                icon={config.icon}
                label={config.label}
                count={getTabBadgeCount(tabId)}
                color={config.color}
              />
            )
          })}
        </div>

        {/* Tab Content */}
        {activeTab === 'purchasing' && (
          <PurchasingTab
            items={filteredItems}
            selectedSkus={purchaseSelectedSkus}
            toggleSelection={togglePurchaseSelection}
            selectAll={selectAllPurchase}
            clearSelection={clearPurchaseSelection}
            createPurchaseOrder={createPurchaseOrder}
            suppliers={suppliers}
            selectedSupplier={selectedSupplier}
            setSelectedSupplier={setSelectedSupplier}
            filter={filter}
            setFilter={setFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            settings={settings}
            applyRounding={applyRounding}
            getUrgencyColor={getUrgencyColor}
            formatCurrency={formatCurrency}
            formatPercent={formatPercent}
            viewSkuTrend={() => {}}
            onHideProduct={hideProduct}
            onBulkHideProducts={bulkHideProducts}
          />
        )}

        {activeTab === 'fba' && (
          <FbaTab
            items={items}
            settings={settings}
            setSettings={setSettings}
            getUrgencyColor={getUrgencyColor}
            onHideProduct={hideProduct}
          />
        )}

        {activeTab === 'push-readiness' && (
          <PushReadinessTab
            items={items}
            settings={settings}
            onFlagSpike={handleFlagSpike}
          />
        )}

        {activeTab === 'deep-dive' && (
          <DeepDiveTab
            items={items}
            settings={settings}
            onRefresh={fetchData}
          />
        )}
      </div>
    </MainLayout>
  )
}
