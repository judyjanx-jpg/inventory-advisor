'use client'

import React, { useState, useEffect, useMemo } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import {
  Truck, RefreshCw, BarChart3, ShoppingCart,
  AlertCircle, Calendar, Settings, GripVertical,
  Bell, Shield, Target, Cpu
} from 'lucide-react'
import {
  ModelBreakdown,
  AlertCenter,
  SeasonalityManager,
  SupplierScorecard,
  SafetyStockView,
  KPIDashboard,
  TabButton,
  SettingsPanel,
  TrendsTab,
  PurchasingTab,
  FbaTab,
  StockoutsTab,
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
import { Brain } from 'lucide-react'

// Tab configuration for rendering the tab bar
const TAB_CONFIG: Record<TabId, { icon: React.ReactNode; label: string; color: string }> = {
  trends: {
    icon: <BarChart3 className="w-5 h-5" />,
    label: "Trends",
    color: "bg-indigo-600"
  },
  purchasing: {
    icon: <ShoppingCart className="w-5 h-5" />,
    label: "Purchasing",
    color: "bg-cyan-600"
  },
  fba: {
    icon: <Truck className="w-5 h-5" />,
    label: "FBA",
    color: "bg-purple-600"
  },
  stockouts: {
    icon: <AlertCircle className="w-5 h-5" />,
    label: "Stockouts",
    color: "bg-red-600"
  },
  'ai-engine': {
    icon: <Cpu className="w-5 h-5" />,
    label: "AI Engine",
    color: "bg-emerald-600"
  },
  alerts: {
    icon: <Bell className="w-5 h-5" />,
    label: "Alerts",
    color: "bg-orange-600"
  },
  seasonality: {
    icon: <Calendar className="w-5 h-5" />,
    label: "Seasonality",
    color: "bg-blue-600"
  },
  suppliers: {
    icon: <Truck className="w-5 h-5" />,
    label: "Suppliers",
    color: "bg-amber-600"
  },
  'safety-stock': {
    icon: <Shield className="w-5 h-5" />,
    label: "Safety Stock",
    color: "bg-pink-600"
  },
  kpis: {
    icon: <Target className="w-5 h-5" />,
    label: "KPIs",
    color: "bg-teal-600"
  }
}

export default function ForecastingPage() {
  // Tab order (persisted to localStorage, but always includes all tabs)
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('forecastingTabOrder')
      if (saved) {
        try {
          const savedOrder = JSON.parse(saved)
          // Ensure all tabs are present - add any missing tabs at the end
          const missingTabs = ALL_TABS.filter(tab => !savedOrder.includes(tab))
          // Remove any tabs that no longer exist
          const validTabs = savedOrder.filter((tab: string) => ALL_TABS.includes(tab as TabId))
          return [...validTabs, ...missingTabs]
        } catch {}
      }
    }
    return [...ALL_TABS]
  })

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('forecastingActiveTab')
      if (saved && ALL_TABS.includes(saved as TabId)) {
        return saved as TabId
      }
    }
    return 'trends'
  })

  // Core data state
  const [items, setItems] = useState<ForecastItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [stockouts, setStockouts] = useState<StockoutEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)

  // Drag and drop state
  const [draggedTab, setDraggedTab] = useState<string | null>(null)

  // Filters (used by purchasing tab)
  const [selectedSupplier, setSelectedSupplier] = useState<number | 'all'>('all')
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all')
  const [sortBy, setSortBy] = useState<'urgency' | 'daysOfSupply' | 'value'>('urgency')

  // Selection for batch actions (Purchasing tab)
  const [purchaseSelectedSkus, setPurchaseSelectedSkus] = useState<Set<string>>(new Set())

  // Trend view state (multi-select for Trends tab)
  const [trendSelectedSkus, setTrendSelectedSkus] = useState<string[]>([])

  // Persist tab order to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('forecastingTabOrder', JSON.stringify(tabOrder))
    }
  }, [tabOrder])

  // Persist active tab to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('forecastingActiveTab', activeTab)
    }
  }, [activeTab])

  // Drag and drop handlers
  const handleDragStart = (tabId: string) => {
    setDraggedTab(tabId)
  }

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    if (!draggedTab || draggedTab === tabId) return

    const newOrder = [...tabOrder]
    const draggedIndex = newOrder.indexOf(draggedTab)
    const targetIndex = newOrder.indexOf(tabId)

    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, draggedTab)

    setTabOrder(newOrder)
  }

  const handleDragEnd = () => {
    setDraggedTab(null)
  }

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

    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3, ok: 4 }
    filtered.sort((a, b) => {
      if (sortBy === 'urgency') return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
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

  // Handler: navigate to trends tab with SKU selected
  const viewSkuTrend = (sku: string) => {
    setTrendSelectedSkus([sku])
    setActiveTab('trends')
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
      case 'stockouts':
        return stockouts.filter(s => !s.resolved).length
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
              Smart Inventory Forecasting
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

        {/* Settings Panel */}
        {showSettings && (
          <SettingsPanel settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} />
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[var(--border)] pb-4 overflow-x-auto">
          {tabOrder.map((tabId) => {
            const config = TAB_CONFIG[tabId as TabId]
            if (!config) return null

            return (
              <div
                key={tabId}
                draggable
                onDragStart={() => handleDragStart(tabId)}
                onDragOver={(e) => handleDragOver(e, tabId)}
                onDragEnd={handleDragEnd}
                className={`flex items-center group cursor-grab active:cursor-grabbing transition-opacity ${draggedTab === tabId ? 'opacity-50' : ''}`}
              >
                <GripVertical className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity mr-1" />
                <TabButton
                  active={activeTab === tabId}
                  onClick={() => setActiveTab(tabId as TabId)}
                  icon={config.icon}
                  label={config.label}
                  count={getTabBadgeCount(tabId as TabId)}
                  color={config.color}
                />
              </div>
            )
          })}
          <div className="ml-auto flex items-center gap-1 text-xs text-slate-600">
            <GripVertical className="w-3 h-3" />
            <span>Drag to reorder</span>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'trends' && (
          <TrendsTab
            items={items}
            selectedSkus={trendSelectedSkus}
            setSelectedSkus={setTrendSelectedSkus}
          />
        )}

        {activeTab === 'purchasing' && (
          <PurchasingTab
            items={filteredItems}
            selectedSkus={purchaseSelectedSkus}
            toggleSelection={togglePurchaseSelection}
            selectAll={selectAllPurchase}
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
            viewSkuTrend={viewSkuTrend}
            onHideProduct={hideProduct}
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

        {activeTab === 'stockouts' && (
          <StockoutsTab stockouts={stockouts} onRefresh={fetchData} />
        )}

        {activeTab === 'ai-engine' && (
          <ModelBreakdown />
        )}

        {activeTab === 'alerts' && (
          <AlertCenter />
        )}

        {activeTab === 'seasonality' && (
          <SeasonalityManager />
        )}

        {activeTab === 'suppliers' && (
          <SupplierScorecard />
        )}

        {activeTab === 'safety-stock' && (
          <SafetyStockView />
        )}

        {activeTab === 'kpis' && (
          <KPIDashboard />
        )}
      </div>
    </MainLayout>
  )
}
