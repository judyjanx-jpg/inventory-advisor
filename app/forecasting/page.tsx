'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import {
  Package, Truck, AlertTriangle, TrendingUp, TrendingDown, Clock,
  ShoppingCart, ArrowRight, RefreshCw, ChevronDown, ChevronUp,
  Filter, Download, Info, Calendar, Settings, Plus, Check, X,
  BarChart3, AlertCircle, Zap, History, Brain, Target, Edit3, GripVertical,
  Bell, Shield, Activity, Cpu
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ReferenceLine
} from 'recharts'
import {
  ModelBreakdown,
  AlertCenter,
  SeasonalityManager,
  SupplierScorecard,
  SafetyStockView,
  KPIDashboard
} from '@/components/forecasting'

// ==========================================
// Types
// ==========================================

interface ForecastItem {
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
  
  seasonalityFactor: number
  upcomingEvent?: string
  
  confidence: number
  safetyStock: number
  
  reasoning: string[]
  salesHistory?: { date: string; units: number; year: number }[]
  selected?: boolean
}

interface FbaShipmentItem extends ForecastItem {
  sendQty: number
  selected: boolean
}

interface Supplier {
  id: number
  name: string
  leadTimeDays: number
  productCount: number
}

interface StockoutEvent {
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

interface ForecastSettings {
  purchaseInterval: 'as_needed' | 'monthly' | 'biweekly' | 'weekly'
  purchaseDay: number
  roundToNearest5: boolean
  fbaCapacity: number
  fbaTargetDays: number
  warehouseTargetDays: number
}

interface TrendData {
  month: string
  [key: string]: number | string
}

// ==========================================
// Constants
// ==========================================

const DEFAULT_SETTINGS: ForecastSettings = {
  purchaseInterval: 'as_needed',
  purchaseDay: 1,
  roundToNearest5: true,
  fbaCapacity: 1500,
  fbaTargetDays: 45,
  warehouseTargetDays: 135,
}

const LINE_COLORS = [
  '#06B6D4', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899',
  '#3B82F6', '#EF4444', '#84CC16', '#F97316', '#6366F1',
]

// ==========================================
// Main Component
// ==========================================

const ALL_TABS = ['trends', 'purchasing', 'fba', 'stockouts', 'ai-engine', 'alerts', 'seasonality', 'suppliers', 'safety-stock', 'kpis']

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
          const validTabs = savedOrder.filter((tab: string) => ALL_TABS.includes(tab))
          return [...validTabs, ...missingTabs]
        } catch {}
      }
    }
    return ALL_TABS
  })

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('forecastingActiveTab')
      if (saved && ALL_TABS.includes(saved)) {
        return saved
      }
    }
    return 'trends'
  })
  const [items, setItems] = useState<ForecastItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [stockouts, setStockouts] = useState<StockoutEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  
  const [draggedTab, setDraggedTab] = useState<string | null>(null)
  
  // Filters
  const [selectedSupplier, setSelectedSupplier] = useState<number | 'all'>('all')
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all')
  const [sortBy, setSortBy] = useState<'urgency' | 'daysOfSupply' | 'value'>('urgency')
  
  // Selection for batch actions (Purchasing tab)
  const [purchaseSelectedSkus, setPurchaseSelectedSkus] = useState<Set<string>>(new Set())
  
  // Trend view state (multi-select for Trends tab)
  const [trendSelectedSkus, setTrendSelectedSkus] = useState<string[]>([])

  // AI Engine state
  const [aiEngineSelectedSku, setAiEngineSelectedSku] = useState<string | null>(null)

  // Save tab order to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('forecastingTabOrder', JSON.stringify(tabOrder))
    }
  }, [tabOrder])

  // Save active tab to localStorage
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

  // Computed Values
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

  const applyRounding = (qty: number): number => {
    if (!settings.roundToNearest5) return qty
    return Math.ceil(qty / 5) * 5
  }

  // Handlers
  const togglePurchaseSelection = (sku: string) => {
    const newSelected = new Set(purchaseSelectedSkus)
    if (newSelected.has(sku)) {
      newSelected.delete(sku)
    } else {
      newSelected.add(sku)
    }
    setPurchaseSelectedSkus(newSelected)
  }

  const selectAllPurchase = () => {
    if (purchaseSelectedSkus.size === filteredItems.length) {
      setPurchaseSelectedSkus(new Set())
    } else {
      setPurchaseSelectedSkus(new Set(filteredItems.map(i => i.sku)))
    }
  }

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

  // Go to trends tab with SKU selected
  const viewSkuTrend = (sku: string) => {
    setTrendSelectedSkus([sku])
    setActiveTab('trends')
  }

  // Render Helpers
  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default: return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
  }

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
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
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Brain className="w-7 h-7 text-cyan-500" />
              Smart Inventory Forecasting
            </h1>
            <p className="text-gray-400 mt-1">AI-powered predictions based on your sales history</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700"
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
        <div className="flex gap-2 border-b border-slate-700 pb-4 overflow-x-auto">
          {tabOrder.map((tabId) => {
            const tabConfig: Record<string, { icon: React.ReactNode; label: string; count?: number; color: string }> = {
              trends: {
                icon: <BarChart3 className="w-5 h-5" />,
                label: "Trends",
                color: "bg-indigo-600"
              },
              purchasing: {
                icon: <ShoppingCart className="w-5 h-5" />,
                label: "Purchasing",
                count: items.filter(i => i.urgency === 'critical' || i.urgency === 'high').length,
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
                count: stockouts.filter(s => !s.resolved).length,
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
            
            const config = tabConfig[tabId]
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
                  onClick={() => setActiveTab(tabId as typeof activeTab)}
                  icon={config.icon}
                  label={config.label}
                  count={config.count}
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
          />
        )}

        {activeTab === 'fba' && (
          <FbaTab
            items={items}
            settings={settings}
            setSettings={setSettings}
            getUrgencyColor={getUrgencyColor}
          />
        )}

        {activeTab === 'stockouts' && (
          <StockoutsTab stockouts={stockouts} onRefresh={fetchData} />
        )}

        {activeTab === 'ai-engine' && (
          <ModelBreakdown
            selectedSku={aiEngineSelectedSku}
            onSelectSku={setAiEngineSelectedSku}
          />
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

// ==========================================
// Tab Button Component
// ==========================================

function TabButton({ active, onClick, icon, label, count, color }: { 
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
  color: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
        active ? `${color} text-white` : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
          active ? 'bg-white/20' : 'bg-red-500/20 text-red-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}

// ==========================================
// Settings Panel Component
// ==========================================

function SettingsPanel({ settings, setSettings, onClose }: { 
  settings: ForecastSettings
  setSettings: (s: ForecastSettings) => void
  onClose: () => void
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-white">Forecast Settings</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <h4 className="font-medium text-gray-300">Purchasing</h4>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Purchase Interval</label>
            <select
              value={settings.purchaseInterval}
              onChange={(e) => setSettings({ ...settings, purchaseInterval: e.target.value as any })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="as_needed">As Needed</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="roundTo5"
              checked={settings.roundToNearest5}
              onChange={(e) => setSettings({ ...settings, roundToNearest5: e.target.checked })}
              className="rounded bg-slate-900 border-slate-700"
            />
            <label htmlFor="roundTo5" className="text-sm text-gray-300">Round quantities to nearest 5</label>
          </div>
        </div>
        
        <div className="space-y-4">
          <h4 className="font-medium text-gray-300">FBA Replenishment</h4>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Daily Capacity (units)</label>
            <input
              type="number"
              value={settings.fbaCapacity}
              onChange={(e) => setSettings({ ...settings, fbaCapacity: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">FBA Target Days</label>
            <input
              type="number"
              value={settings.fbaTargetDays}
              onChange={(e) => setSettings({ ...settings, fbaTargetDays: parseInt(e.target.value) || 45 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>
        
        <div className="space-y-4">
          <h4 className="font-medium text-gray-300">Inventory Targets</h4>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Warehouse Target Days</label>
            <input
              type="number"
              value={settings.warehouseTargetDays}
              onChange={(e) => setSettings({ ...settings, warehouseTargetDays: parseInt(e.target.value) || 135 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div className="pt-2 text-sm text-gray-400">
            <p>Total Target: {settings.fbaTargetDays + settings.warehouseTargetDays} days</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// Trends Tab Component - Multi-Select
// ==========================================

function TrendsTab({ items, selectedSkus, setSelectedSkus }: { 
  items: ForecastItem[]
  selectedSkus: string[]
  setSelectedSkus: (skus: string[]) => void
}) {
  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.velocity30d - a.velocity30d)
  }, [items])

  const top10Skus = useMemo(() => {
    return sortedItems.slice(0, 10).map(i => i.sku)
  }, [sortedItems])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (selectedSkus.length > 0) {
      fetchTrendData(selectedSkus)
    } else {
      setTrendData([])
    }
  }, [selectedSkus])

  const fetchTrendData = async (skus: string[]) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/forecasting/trends?skus=${skus.join(',')}`)
      const data = await response.json()
      if (data.success) {
        setTrendData(data.trends)
      }
    } catch (error) {
      console.error('Failed to fetch trends:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleSku = (sku: string) => {
    if (selectedSkus.includes(sku)) {
      setSelectedSkus(selectedSkus.filter(s => s !== sku))
    } else if (selectedSkus.length < 10) {
      setSelectedSkus([...selectedSkus, sku])
    }
  }

  const selectTop10 = () => {
    setSelectedSkus(top10Skus)
    setDropdownOpen(false)
  }

  const clearSelection = () => {
    setSelectedSkus([])
  }

  const selectedItems = items.filter(i => selectedSkus.includes(i.sku))

  return (
    <div className="space-y-6">
      {/* Multi-Select SKU Selector */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-400">Select Products to Compare (max 10)</label>
          <div className="flex gap-2">
            <button
              onClick={selectTop10}
              className="px-3 py-1 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
            >
              Top 10 Sellers
            </button>
            {selectedSkus.length > 0 && (
              <button
                onClick={clearSelection}
                className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-left text-white flex items-center justify-between"
          >
            <span className="truncate">
              {selectedSkus.length === 0 
                ? 'Click to select products...'
                : `${selectedSkus.length} product${selectedSkus.length > 1 ? 's' : ''} selected`
              }
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-80 overflow-y-auto">
              {sortedItems.map((item, index) => {
                const isSelected = selectedSkus.includes(item.sku)
                const isDisabled = !isSelected && selectedSkus.length >= 10
                
                return (
                  <button
                    key={item.sku}
                    onClick={() => !isDisabled && toggleSku(item.sku)}
                    disabled={isDisabled}
                    className={`w-full px-3 py-2 text-left flex items-center gap-3 hover:bg-slate-800 transition-colors ${
                      isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                    } ${isSelected ? 'bg-slate-800' : ''}`}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                      isSelected ? 'bg-cyan-600 border-cyan-600' : 'border-slate-600'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{item.sku}</span>
                        {index < 10 && (
                          <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">#{index + 1}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 truncate block">
                        {(item.displayName || item.title)?.substring(0, 50)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{item.velocity30d.toFixed(1)}/day</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected Tags */}
        {selectedSkus.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {selectedSkus.map((sku, index) => (
              <span 
                key={sku}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm border"
                style={{ 
                  backgroundColor: `${LINE_COLORS[index % LINE_COLORS.length]}20`,
                  color: LINE_COLORS[index % LINE_COLORS.length],
                  borderColor: LINE_COLORS[index % LINE_COLORS.length],
                }}
              >
                {sku}
                <button onClick={() => toggleSku(sku)} className="hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      {selectedSkus.length > 0 && (
        <>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-medium text-white mb-4">Sales Trend Comparison (Units/Month)</h3>
            
            {loading ? (
              <div className="h-80 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-cyan-500" />
              </div>
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }} />
                  <Legend />
                  {selectedSkus.map((sku, index) => (
                    <Line 
                      key={sku}
                      type="monotone" 
                      dataKey={sku}
                      name={sku}
                      stroke={LINE_COLORS[index % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-400">
                <p>No historical data available for selected products</p>
              </div>
            )}
          </div>

          {/* Comparison Table */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="text-lg font-medium text-white">Velocity Comparison</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">SKU</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">7-Day</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">30-Day</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">90-Day</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Trend</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Days of Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {selectedItems.map((item, index) => (
                    <tr key={item.sku} className="hover:bg-slate-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LINE_COLORS[index % LINE_COLORS.length] }} />
                          <span className="font-medium text-white">{item.sku}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-white">{item.velocity7d.toFixed(2)}/day</td>
                      <td className="px-4 py-3 text-right text-white">{item.velocity30d.toFixed(2)}/day</td>
                      <td className="px-4 py-3 text-right text-white">{item.velocity90d.toFixed(2)}/day</td>
                      <td className="px-4 py-3 text-right">
                        <span className={item.velocityChange7d >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {item.velocityChange7d >= 0 ? '+' : ''}{item.velocityChange7d?.toFixed(1) || 0}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-white">{Math.round(item.totalDaysOfSupply)} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedSkus.length === 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Select products above to compare trends</p>
          <button
            onClick={selectTop10}
            className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
          >
            Quick Start: Compare Top 10 Sellers
          </button>
        </div>
      )}
    </div>
  )
}

// ==========================================
// Purchasing Tab Component
// ==========================================

function PurchasingTab({
  items, selectedSkus, toggleSelection, selectAll, createPurchaseOrder,
  suppliers, selectedSupplier, setSelectedSupplier, filter, setFilter,
  sortBy, setSortBy, settings, applyRounding, getUrgencyColor,
  formatCurrency, formatPercent, viewSkuTrend,
}: any) {
  const [expandedSku, setExpandedSku] = useState<string | null>(null)

  const totalValue = items.reduce((sum: number, i: ForecastItem) => 
    sum + (applyRounding(i.recommendedOrderQty) * i.cost), 0)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
          >
            <option value="all">All Suppliers</option>
            {suppliers.map((s: Supplier) => (
              <option key={s.id} value={s.id}>{s.name} ({s.productCount})</option>
            ))}
          </select>
        </div>
        
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white">
          <option value="all">All Urgency</option>
          <option value="critical">Critical Only</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
        </select>
        
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white">
          <option value="urgency">Sort by Urgency</option>
          <option value="daysOfSupply">Sort by Days of Supply</option>
          <option value="value">Sort by Value</option>
        </select>
        
        <div className="flex-1" />
        
        {selectedSkus.size > 0 && (
          <button onClick={createPurchaseOrder} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg">
            <Plus className="w-4 h-4" />
            Create PO ({selectedSkus.size} items, {formatCurrency(totalValue)})
          </button>
        )}
        
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Select All */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <input
          type="checkbox"
          checked={selectedSkus.size === items.length && items.length > 0}
          onChange={selectAll}
          className="rounded bg-slate-800 border-slate-700"
        />
        <span>Select all ({items.length} items)</span>
        {settings.roundToNearest5 && (
          <span className="ml-4 px-2 py-0.5 bg-slate-700 rounded text-xs">Rounding to nearest 5 enabled</span>
        )}
      </div>

      {/* Items List */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-8 text-center">
            <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No items need purchasing right now</p>
          </div>
        ) : (
          items.map((item: ForecastItem) => (
            <div key={item.sku} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-4">
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={selectedSkus.has(item.sku)}
                    onChange={() => toggleSelection(item.sku)}
                    className="rounded bg-slate-900 border-slate-700"
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getUrgencyColor(item.urgency)}`}>
                    {item.urgency.toUpperCase()}
                  </div>
                  
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}>
                    <p className="font-medium text-white">{item.sku}</p>
                    <p className="text-xs text-gray-500 truncate">{(item.displayName || item.title)?.substring(0, 60)}</p>
                  </div>
                  
                  <div className="text-center px-4">
                    <div className="flex items-center gap-1 justify-center">
                      <span className="text-lg font-bold text-white">{item.velocity30d.toFixed(1)}</span>
                      <span className={item.velocityChange7d >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {item.velocityChange7d >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">units/day ({formatPercent(item.velocityChange7d || 0)})</p>
                  </div>
                  
                  <div className="text-center px-4">
                    <p className={`text-lg font-bold ${
                      item.totalDaysOfSupply < 30 ? 'text-red-400' :
                      item.totalDaysOfSupply < 60 ? 'text-orange-400' :
                      item.totalDaysOfSupply < 90 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {Math.round(item.totalDaysOfSupply)} days
                    </p>
                    <p className="text-xs text-gray-500">total supply</p>
                  </div>
                  
                  <div className="text-right px-4">
                    <p className="text-lg font-bold text-cyan-400">
                      {applyRounding(item.recommendedOrderQty) > 0 ? `Order ${applyRounding(item.recommendedOrderQty)}` : 'OK'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {applyRounding(item.recommendedOrderQty) > 0 && formatCurrency(applyRounding(item.recommendedOrderQty) * item.cost)}
                    </p>
                  </div>
                  
                  <button
                    onClick={(e) => { e.stopPropagation(); viewSkuTrend(item.sku); }}
                    className="p-2 hover:bg-slate-700 rounded-lg"
                    title="View Trends"
                  >
                    <BarChart3 className="w-5 h-5 text-gray-400" />
                  </button>
                  
                  <button onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)} className="p-2 hover:bg-slate-700 rounded-lg">
                    {expandedSku === item.sku ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </button>
                </div>
              </div>
              
              {expandedSku === item.sku && (
                <div className="px-4 pb-4 pt-2 border-t border-slate-700 bg-slate-900/50">
                  <div className="grid grid-cols-4 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Inventory</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">FBA</span><span className="text-white">{item.fbaAvailable || 0}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">FBA Inbound</span><span className="text-cyan-400">{item.fbaInbound || 0}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Warehouse</span><span className="text-white">{item.warehouseAvailable || 0}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Incoming PO</span><span className="text-green-400">{(item as any).incomingFromPO || 0}</span></div>
                        <div className="flex justify-between border-t border-slate-700 pt-1"><span className="text-gray-400 font-medium">Total</span><span className="text-white font-medium">{(item as any).currentInventory || item.totalInventory || 0}</span></div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Supplier</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="text-white">{item.supplierName || 'Not set'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Lead Time</span><span className="text-white">{item.leadTimeDays} days</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Unit Cost</span><span className="text-white">{formatCurrency(item.cost)}</span></div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Why This Recommendation</h4>
                      <div className="space-y-1 text-sm text-gray-300">
                        <p>• Selling {item.velocity30d.toFixed(1)}/day × 180 days = {Math.round(item.velocity30d * 180)} needed</p>
                        <p>• Have {item.totalInventory} in stock</p>
                        <p>• Gap: {Math.max(0, Math.round(item.velocity30d * 180) - item.totalInventory)} units</p>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Confidence</h4>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 bg-slate-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${item.confidence > 0.7 ? 'bg-green-500' : item.confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${item.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-white">{Math.round(item.confidence * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ==========================================
// FBA Tab Component
// ==========================================

interface IncomingPO {
  quantity: number
  expectedDate: string | null
  daysUntil: number | null  // NEW: days until arrival (negative = overdue)
  poNumber?: string
}

interface FbaShipmentItemExtended extends FbaShipmentItem {
  replenishmentNeeded: number // What we actually need to send
  incoming?: IncomingPO[] // What's on order
  shipBy: { date: Date; label: string; urgency: 'critical' | 'urgent' | 'soon' | 'normal' }
  statusCategory: 'outOfStock' | 'critical' | 'warning' | 'ok'
  statusDisplay: { label: string; color: string }
  totalDaysOfSupply: number
}

function FbaTab({ items, settings, setSettings, getUrgencyColor }: {
  items: ForecastItem[]
  settings: ForecastSettings
  setSettings: (s: ForecastSettings) => void
  getUrgencyColor: (urgency: string) => string
}) {
  const router = useRouter()
  const [shipmentItems, setShipmentItems] = useState<FbaShipmentItemExtended[]>([])
  const [incomingData, setIncomingData] = useState<Record<string, { totalQuantity: number; items: IncomingPO[] }>>({})
  const [roundFbaTo5, setRoundFbaTo5] = useState(true)
  const [isCreatingShipment, setIsCreatingShipment] = useState(false)
  const hasAutoSelectedRef = useRef(false) // Use ref to avoid re-renders
  
  // Sorting state
  const [sortColumn, setSortColumn] = useState<'sku' | 'status' | 'velocity' | 'fba' | 'inbound' | 'replenishment' | 'whAvail' | 'shipBy'>('status')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<'all' | 'outOfStock' | 'critical' | 'warning' | 'ok'>('all')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)

  // Fetch incoming PO data
  useEffect(() => {
    const fetchIncoming = async () => {
      try {
        const response = await fetch('/api/purchase-orders/incoming')
        const data = await response.json()
        if (data.success) {
          setIncomingData(data.incoming || {})
        }
      } catch (error) {
        console.error('Failed to fetch incoming POs:', error)
      }
    }
    fetchIncoming()
  }, [])

  // Smart rounding to 5s:
  // - Round UP if we have enough stock to cover it
  // - Round DOWN if we don't have enough stock
  const roundTo5 = (needed: number, available: number): number => {
    if (!roundFbaTo5) return Math.min(needed, available)
    
    const roundedUp = Math.ceil(needed / 5) * 5
    const roundedDown = Math.floor(needed / 5) * 5
    
    // If we have enough stock to cover rounding up, round up
    if (available >= roundedUp) {
      return roundedUp
    }
    // Otherwise round down what we can send
    return Math.floor(Math.min(needed, available) / 5) * 5
  }

  // Calculate ship by date based on days of supply (including inbound)
  const getShipByDate = (daysOfSupply: number, fbaTotal: number): { date: Date; label: string; urgency: 'critical' | 'urgent' | 'soon' | 'normal' } => {
    const today = new Date()
    
    if (fbaTotal === 0) {
      return { date: today, label: 'Today', urgency: 'critical' }
    }
    if (daysOfSupply < 3) {
      return { date: today, label: 'Today', urgency: 'critical' }
    }
    if (daysOfSupply < 7) {
      const date = new Date(today)
      date.setDate(date.getDate() + 1)
      return { date, label: 'Tomorrow', urgency: 'urgent' }
    }
    if (daysOfSupply < 14) {
      const date = new Date(today)
      date.setDate(date.getDate() + 3)
      return { date, label: 'In 3 days', urgency: 'soon' }
    }
    if (daysOfSupply < 21) {
      const date = new Date(today)
      date.setDate(date.getDate() + 7)
      return { date, label: 'This week', urgency: 'soon' }
    }
    const date = new Date(today)
    date.setDate(date.getDate() + 14)
    return { date, label: 'In 2 weeks', urgency: 'normal' }
  }

  // Get status category for filtering (including inbound)
  const getStatusCategory = (daysOfSupply: number, fbaTotal: number): 'outOfStock' | 'critical' | 'warning' | 'ok' => {
    if (fbaTotal === 0) return 'outOfStock'
    if (daysOfSupply < 7) return 'critical'
    if (daysOfSupply < 14) return 'warning'
    return 'ok'
  }

  // Get status label for display (based on total FBA + inbound days of supply)
  const getStatusDisplay = (fbaAvailable: number, fbaInbound: number, daysOfSupply: number): { label: string; color: string } => {
    const fbaTotal = fbaAvailable + fbaInbound
    
    if (fbaTotal === 0) {
      return { label: 'NO STOCK', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    }
    if (daysOfSupply < 7) {
      return { label: `${Math.round(daysOfSupply)}d left`, color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    }
    if (daysOfSupply < 14) {
      return { label: `${Math.round(daysOfSupply)}d left`, color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' }
    }
    if (daysOfSupply < 30) {
      return { label: `${Math.round(daysOfSupply)}d left`, color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
    }
    return { label: `${Math.round(daysOfSupply)}d left`, color: 'bg-green-500/20 text-green-400 border-green-500/30' }
  }

  useEffect(() => {
    const fbaItems = items
      .filter(item => item.fbaDaysOfSupply < settings.fbaTargetDays + 10 && item.warehouseAvailable > 0)
      .map(item => {
        const idealFbaStock = Math.ceil(settings.fbaTargetDays * item.velocity30d)
        const currentFbaTotal = item.fbaAvailable + item.fbaInbound
        const replenishmentNeeded = Math.max(0, idealFbaStock - currentFbaTotal)
        
        // Calculate days of supply including inbound
        const totalDaysOfSupply = item.velocity30d > 0 
          ? currentFbaTotal / item.velocity30d 
          : 999
        
        // Use smart rounding for sendQty
        const sendQty = roundTo5(replenishmentNeeded, item.warehouseAvailable)
        const shipBy = getShipByDate(totalDaysOfSupply, currentFbaTotal)
        const statusCategory = getStatusCategory(totalDaysOfSupply, currentFbaTotal)
        const statusDisplay = getStatusDisplay(item.fbaAvailable, item.fbaInbound, totalDaysOfSupply)
        
        // Get incoming data for this SKU
        const skuIncoming = incomingData[item.sku]
        const incomingItems: IncomingPO[] = skuIncoming?.items || []
        
        return {
          ...item,
          replenishmentNeeded,
          sendQty: sendQty,
          selected: false,
          incoming: incomingItems,
          shipBy,
          statusCategory,
          statusDisplay,
          totalDaysOfSupply,
        }
      })
    
    setShipmentItems(fbaItems)
  }, [items, settings.fbaTargetDays, roundFbaTo5, incomingData])
  
  // Auto-select on initial load - separate effect
  useEffect(() => {
    if (hasAutoSelectedRef.current || shipmentItems.length === 0) return
    
    // Sort by urgency (most urgent first) for auto-selection
    const sortedForSelection = [...shipmentItems].sort((a, b) => {
      const statusOrder = { outOfStock: 0, critical: 1, warning: 2, ok: 3 }
      const statusDiff = statusOrder[a.statusCategory] - statusOrder[b.statusCategory]
      if (statusDiff !== 0) return statusDiff
      return a.totalDaysOfSupply - b.totalDaysOfSupply
    })
    
    // Auto-select items to fill capacity, skipping items with 0 sendQty
    let capacityRemaining = settings.fbaCapacity
    const selectedSkus = new Set<string>()
    
    for (const item of sortedForSelection) {
      if (item.sendQty === 0) continue // Skip items with no qty to send
      if (item.sendQty <= capacityRemaining) {
        selectedSkus.add(item.sku)
        capacityRemaining -= item.sendQty
      }
      if (capacityRemaining <= 0) break
    }
    
    setShipmentItems(prev => prev.map(item => ({
      ...item,
      selected: selectedSkus.has(item.sku)
    })))
    hasAutoSelectedRef.current = true
  }, [shipmentItems.length, settings.fbaCapacity])

  // Sort and filter items
  const sortedAndFilteredItems = useMemo(() => {
    let filtered = [...shipmentItems]
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.statusCategory === statusFilter)
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0
      
      switch (sortColumn) {
        case 'sku':
          comparison = a.sku.localeCompare(b.sku)
          break
        case 'status':
          const statusOrder = { outOfStock: 0, critical: 1, warning: 2, ok: 3 }
          comparison = statusOrder[a.statusCategory] - statusOrder[b.statusCategory]
          if (comparison === 0) comparison = a.totalDaysOfSupply - b.totalDaysOfSupply
          break
        case 'velocity':
          comparison = a.velocity30d - b.velocity30d
          break
        case 'fba':
          comparison = a.fbaAvailable - b.fbaAvailable
          break
        case 'inbound':
          comparison = a.fbaInbound - b.fbaInbound
          break
        case 'replenishment':
          comparison = a.replenishmentNeeded - b.replenishmentNeeded
          break
        case 'whAvail':
          comparison = a.warehouseAvailable - b.warehouseAvailable
          break
        case 'shipBy':
          comparison = a.shipBy.date.getTime() - b.shipBy.date.getTime()
          break
      }
      
      return sortDirection === 'asc' ? comparison : -comparison
    })
    
    return filtered
  }, [shipmentItems, sortColumn, sortDirection, statusFilter])

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection(column === 'sku' ? 'asc' : 'desc')
    }
  }

  const SortHeader = ({ column, label, className = '' }: { column: typeof sortColumn; label: string; className?: string }) => (
    <th 
      className={`p-3 cursor-pointer hover:bg-slate-700/50 select-none ${className}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center justify-center gap-1">
        <span>{label}</span>
        {sortColumn === column && (
          <span className="text-cyan-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  )

  const selectedItems = shipmentItems.filter(i => i.selected)
  const totalSelectedUnits = selectedItems.reduce((sum, i) => sum + i.sendQty, 0)
  const capacityUsed = (totalSelectedUnits / settings.fbaCapacity) * 100

  const toggleSelect = (sku: string) => {
    setShipmentItems(prev => prev.map(item => item.sku === sku ? { ...item, selected: !item.selected } : item))
  }

  const toggleSelectAll = () => {
    const allSelected = sortedAndFilteredItems.every(i => i.selected)
    const filteredSkus = new Set(sortedAndFilteredItems.map(i => i.sku))
    setShipmentItems(prev => prev.map(item => 
      filteredSkus.has(item.sku) ? { ...item, selected: !allSelected } : item
    ))
  }

  // Track which SKU is being edited (to allow free typing)
  const [editingQty, setEditingQty] = useState<{ sku: string; value: string } | null>(null)

  const updateQty = (sku: string, qty: number) => {
    setShipmentItems(prev => prev.map(item => {
      if (item.sku !== sku) return item
      // Use smart rounding when manually adjusting
      const newQty = roundTo5(qty, item.warehouseAvailable)
      return { ...item, sendQty: newQty }
    }))
  }

  const handleQtyChange = (sku: string, value: string) => {
    // Allow free typing without rounding
    setEditingQty({ sku, value })
  }

  const handleQtyBlur = (sku: string) => {
    if (editingQty && editingQty.sku === sku) {
      const qty = parseInt(editingQty.value) || 0
      updateQty(sku, qty)
      setEditingQty(null)
    }
  }

  const handleQtyKeyDown = (e: React.KeyboardEvent, sku: string) => {
    if (e.key === 'Enter') {
      handleQtyBlur(sku)
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setEditingQty(null)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const createFbaShipment = async () => {
    const itemsToShip = selectedItems.filter(i => i.sendQty > 0)
    if (itemsToShip.length === 0) return
    
    setIsCreatingShipment(true)
    try {
      const response = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          destination: 'fba_us',
          items: itemsToShip.map(i => ({ 
            sku: i.sku, 
            productName: i.title,
            requestedQty: i.sendQty,
            adjustedQty: i.sendQty,
          })),
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        // Navigate to the shipment page
        if (data.shipment?.id) {
          router.push(`/shipments/${data.shipment.id}`)
        } else if (data.id) {
          router.push(`/shipments/${data.id}`)
        } else {
          // Fallback to shipments list
          router.push('/shipments')
        }
      } else {
        const error = await response.json()
        alert(`Failed to create shipment: ${error.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to create shipment:', error)
      alert('Failed to create shipment. Please try again.')
    } finally {
      setIsCreatingShipment(false)
    }
  }

  // UPDATED: Format incoming PO data with days until/overdue
  const formatIncoming = (incoming?: IncomingPO[]) => {
    if (!incoming || incoming.length === 0) return null
    
    // Return formatted data for display
    return {
      items: incoming,
      totalQty: incoming.reduce((sum, po) => sum + po.quantity, 0),
    }
  }

  // NEW: Render incoming PO cell with proper formatting
  const renderIncomingCell = (incoming?: IncomingPO[]) => {
    const data = formatIncoming(incoming)
    if (!data) {
      return <span className="text-gray-600">—</span>
    }
    
    return (
      <div className="text-xs space-y-0.5">
        {data.items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1 justify-center">
            <span className="text-cyan-400 font-medium">{item.quantity}</span>
            {item.daysUntil !== null ? (
              item.daysUntil < 0 ? (
                // Overdue - show in red
                <span className="text-red-400">{Math.abs(item.daysUntil)}d overdue</span>
              ) : item.daysUntil === 0 ? (
                // Arriving today
                <span className="text-green-400">today</span>
              ) : (
                // Coming soon
                <span className="text-slate-400">in {item.daysUntil}d</span>
              )
            ) : (
              // No date set - show date if available
              item.expectedDate ? (
                <span className="text-slate-500">
                  {new Date(item.expectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              ) : (
                <span className="text-slate-500">(no ETA)</span>
              )
            )}
          </div>
        ))}
      </div>
    )
  }

  const getShipByBadge = (shipBy: { label: string; urgency: string }) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
      urgent: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      soon: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      normal: 'bg-green-500/20 text-green-400 border-green-500/30',
    }
    return (
      <span className={`inline-flex items-center justify-center min-w-[5rem] px-2 py-1 rounded text-xs font-medium border ${colors[shipBy.urgency]}`}>
        {shipBy.label}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Capacity Bar & Controls */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Daily Capacity:</label>
            <input
              type="number"
              value={settings.fbaCapacity}
              onChange={(e) => setSettings({ ...settings, fbaCapacity: parseInt(e.target.value) || 0 })}
              className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
            />
            <span className="text-gray-400">units</span>
          </div>
          
          <div className="flex-1 min-w-48">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-700 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all ${capacityUsed > 100 ? 'bg-red-500' : capacityUsed > 80 ? 'bg-orange-500' : 'bg-purple-500'}`}
                  style={{ width: `${Math.min(100, capacityUsed)}%` }}
                />
              </div>
              <span className={`text-sm font-medium ${capacityUsed > 100 ? 'text-red-400' : 'text-white'}`}>
                {totalSelectedUnits} / {settings.fbaCapacity}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="roundFbaTo5"
              checked={roundFbaTo5}
              onChange={(e) => setRoundFbaTo5(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700"
            />
            <label htmlFor="roundFbaTo5" className="text-sm text-gray-300">Round to 5s</label>
          </div>
          
          {/* Status Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white hover:bg-slate-800"
            >
              <Filter className="w-4 h-4" />
              {statusFilter === 'all' ? 'All Status' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
              <ChevronDown className="w-4 h-4" />
            </button>
            
            {showFilterDropdown && (
              <div className="absolute z-10 mt-1 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-xl">
                {['all', 'outOfStock', 'critical', 'warning', 'ok'].map((status) => (
                  <button
                    key={status}
                    onClick={() => { setStatusFilter(status as any); setShowFilterDropdown(false) }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-800 ${statusFilter === status ? 'text-cyan-400' : 'text-white'}`}
                  >
                    {status === 'all' ? 'All Status' : status === 'outOfStock' ? 'Out of Stock' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={createFbaShipment}
            disabled={selectedItems.length === 0 || isCreatingShipment}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white"
          >
            {isCreatingShipment ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Truck className="w-4 h-4" />
            )}
            Create Shipment ({selectedItems.length})
          </button>
        </div>
        
        {/* Quick Stats */}
        <div className="flex gap-4 mt-3 pt-3 border-t border-slate-700">
          <div className="text-sm">
            <span className="text-gray-400">Selected:</span>
            <span className="ml-1 text-white font-medium">{selectedItems.length} items</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-400">Total Units:</span>
            <span className="ml-1 text-purple-400 font-medium">{totalSelectedUnits.toLocaleString()}</span>
          </div>
        </div>
      </div>
      
      {sortedAndFilteredItems.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-8 text-center">
          <Truck className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">
            {shipmentItems.length === 0 ? 'No FBA replenishment needed right now' : 'No items match your filter'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 text-left text-sm text-gray-400">
                  <th className="p-3 w-10">
                    <input 
                      type="checkbox" 
                      checked={sortedAndFilteredItems.length > 0 && sortedAndFilteredItems.every(i => i.selected)} 
                      onChange={toggleSelectAll} 
                      className="rounded bg-slate-900 border-slate-700" 
                    />
                  </th>
                  <SortHeader column="sku" label="SKU" className="text-left" />
                  <SortHeader column="status" label="Status" />
                  <SortHeader column="shipBy" label="Ship By" />
                  <SortHeader column="velocity" label="Velocity" />
                  <SortHeader column="fba" label="FBA" />
                  <SortHeader column="inbound" label="Inbound" />
                  <SortHeader column="replenishment" label="Replenishment" />
                  <SortHeader column="whAvail" label="WH Avail" />
                  <th className="p-3 text-center">Incoming PO</th>
                  <th className="p-3 text-center w-32">Send Qty</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredItems.map((item) => {
                  // Show what we can actually send with smart rounding
                  const smartRounded = roundTo5(item.replenishmentNeeded, item.warehouseAvailable)
                  const cantFulfill = item.replenishmentNeeded > item.warehouseAvailable
                  
                  return (
                    <tr key={item.sku} className={`border-b border-slate-700/50 hover:bg-slate-750 ${item.selected ? 'bg-purple-900/10' : ''}`}>
                      <td className="p-3">
                        <input type="checkbox" checked={item.selected} onChange={() => toggleSelect(item.sku)} className="rounded bg-slate-900 border-slate-700" />
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-white">{item.sku}</p>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[5.5rem] px-2 py-1 rounded text-xs font-medium border ${item.statusDisplay.color}`}>
                          {item.statusDisplay.label}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {getShipByBadge(item.shipBy)}
                      </td>
                      <td className="p-3 text-center text-white">{item.velocity30d.toFixed(1)}/day</td>
                      <td className="p-3 text-center text-white">{item.fbaAvailable}</td>
                      <td className="p-3 text-center text-cyan-400">{item.fbaInbound || 0}</td>
                      <td className="p-3 text-center">
                        <span className={`font-medium ${cantFulfill ? 'text-orange-400' : 'text-cyan-400'}`}>
                          {item.replenishmentNeeded}
                        </span>
                        {cantFulfill && (
                          <p className="text-xs text-orange-400">Need more</p>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-white">{item.warehouseAvailable}</span>
                      </td>
                      <td className="p-3 text-center">
                        {renderIncomingCell(item.incoming)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            value={editingQty?.sku === item.sku ? editingQty.value : item.sendQty}
                            onChange={(e) => handleQtyChange(item.sku, e.target.value)}
                            onBlur={() => handleQtyBlur(item.sku)}
                            onKeyDown={(e) => handleQtyKeyDown(e, item.sku)}
                            onFocus={(e) => setEditingQty({ sku: item.sku, value: String(item.sendQty) })}
                            className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-center"
                            min={0}
                            max={item.warehouseAvailable}
                          />
                          <button onClick={() => updateQty(item.sku, item.replenishmentNeeded)} className="p-1 hover:bg-slate-700 rounded text-gray-400 hover:text-white" title="Set to replenishment needed">
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// Stockouts Tab Component
// ==========================================

function StockoutsTab({ stockouts, onRefresh }: { stockouts: StockoutEvent[]; onRefresh: () => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Total Stockouts (90d)</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{stockouts.length}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Days Lost</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">{stockouts.reduce((sum, s) => sum + s.daysOutOfStock, 0)}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Est. Lost Sales</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">${stockouts.reduce((sum, s) => sum + s.estimatedLostSales, 0).toLocaleString()}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Unresolved</p>
          <p className="text-2xl font-bold text-white mt-1">{stockouts.filter(s => !s.resolved).length}</p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-cyan-500" />
          Root Cause Analysis
        </h3>
        
        {stockouts.length === 0 ? (
          <div className="text-center py-8">
            <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-400">No stockouts in the last 90 days! 🎉</p>
          </div>
        ) : (
          <div className="space-y-4">
            {stockouts.map((stockout) => (
              <div key={stockout.id} className={`p-4 rounded-lg border ${stockout.resolved ? 'bg-slate-900/50 border-slate-700' : 'bg-red-900/10 border-red-500/30'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-white">{stockout.sku}</h4>
                    <p className="text-xs text-gray-500">{stockout.title?.substring(0, 50)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">{new Date(stockout.stockoutDate).toLocaleDateString()}</p>
                    <p className="text-sm text-red-400">{stockout.daysOutOfStock} days out of stock</p>
                  </div>
                </div>
                
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Root Cause</p>
                    <p className="text-sm text-orange-400 mt-1">{stockout.rootCause}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Prevention Action</p>
                    <p className="text-sm text-cyan-400 mt-1">{stockout.preventionAction}</p>
                  </div>
                </div>
                
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-yellow-400">Est. lost sales: ${stockout.estimatedLostSales.toLocaleString()}</p>
                  {!stockout.resolved && <button className="text-sm text-cyan-400 hover:text-cyan-300">Mark as Resolved</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
