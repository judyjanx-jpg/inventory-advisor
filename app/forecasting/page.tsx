'use client'

import { useState, useEffect, useMemo } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { 
  Package, Truck, AlertTriangle, TrendingUp, TrendingDown, Clock,
  ShoppingCart, ArrowRight, RefreshCw, ChevronDown, ChevronUp,
  Filter, Download, Info, Calendar, Settings, Plus, Check, X,
  BarChart3, AlertCircle, Zap, History, Brain, Target, Edit3
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ReferenceLine
} from 'recharts'

// ==========================================
// Types
// ==========================================

interface ForecastItem {
  sku: string
  title: string
  displayName?: string
  
  // Velocity
  velocity7d: number
  velocity30d: number
  velocity90d: number
  velocityTrend: 'rising' | 'stable' | 'declining'
  velocityChange7d: number
  velocityChange30d: number
  
  // Inventory
  fbaAvailable: number
  fbaInbound: number
  warehouseAvailable: number
  totalInventory: number
  
  // Days of Supply
  fbaDaysOfSupply: number
  warehouseDaysOfSupply: number
  totalDaysOfSupply: number
  
  // Supplier
  supplierId?: number
  supplierName?: string
  leadTimeDays: number
  cost: number
  moq?: number
  
  // Recommendations
  reorderPoint: number
  recommendedOrderQty: number
  recommendedFbaQty: number
  urgency: 'critical' | 'high' | 'medium' | 'low' | 'ok'
  stockoutDate?: string
  daysUntilStockout?: number
  
  // Seasonality
  seasonalityFactor: number
  upcomingEvent?: string
  
  // Forecast confidence
  confidence: number
  safetyStock: number
  
  // Smart reasoning
  reasoning: string[]
  
  // Historical for charts
  salesHistory?: { date: string; units: number; year: number }[]
  
  // Selection state
  selected?: boolean
}

interface FbaShipmentItem extends ForecastItem {
  sendQty: number // Editable quantity
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

// ==========================================
// Helper: Product Display Component (SKU first, title grayed)
// ==========================================

function ProductDisplay({ sku, title, displayName, compact = false }: { 
  sku: string
  title: string
  displayName?: string
  compact?: boolean 
}) {
  const shortTitle = (displayName || title)?.substring(0, compact ? 40 : 60)
  
  return (
    <div className="min-w-0">
      <p className="font-medium text-white">{sku}</p>
      <p className="text-xs text-gray-500 truncate">{shortTitle}</p>
    </div>
  )
}

// ==========================================
// Main Component
// ==========================================

export default function ForecastingPage() {
  const [activeTab, setActiveTab] = useState<'trends' | 'purchasing' | 'fba' | 'stockouts'>('trends')
  const [items, setItems] = useState<ForecastItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [stockouts, setStockouts] = useState<StockoutEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  
  // Filters
  const [selectedSupplier, setSelectedSupplier] = useState<number | 'all'>('all')
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all')
  const [sortBy, setSortBy] = useState<'urgency' | 'daysOfSupply' | 'value'>('urgency')
  
  // Selection for batch actions
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set())
  
  // Trend view state
  const [selectedSkuForTrend, setSelectedSkuForTrend] = useState<string | null>(null)

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

  // ==========================================
  // Computed Values
  // ==========================================

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
      if (sortBy === 'urgency') {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
      } else if (sortBy === 'daysOfSupply') {
        return a.totalDaysOfSupply - b.totalDaysOfSupply
      } else {
        return (b.recommendedOrderQty * b.cost) - (a.recommendedOrderQty * a.cost)
      }
    })
    
    return filtered
  }, [items, selectedSupplier, filter, activeTab, sortBy, settings])

  const applyRounding = (qty: number): number => {
    if (!settings.roundToNearest5) return qty
    return Math.ceil(qty / 5) * 5
  }

  // ==========================================
  // Handlers
  // ==========================================

  const toggleSelection = (sku: string) => {
    const newSelected = new Set(selectedSkus)
    if (newSelected.has(sku)) {
      newSelected.delete(sku)
    } else {
      newSelected.add(sku)
    }
    setSelectedSkus(newSelected)
  }

  const selectAll = () => {
    if (selectedSkus.size === filteredItems.length) {
      setSelectedSkus(new Set())
    } else {
      setSelectedSkus(new Set(filteredItems.map(i => i.sku)))
    }
  }

  const createPurchaseOrder = async () => {
    if (selectedSkus.size === 0) return
    
    const selectedItems = filteredItems.filter(i => selectedSkus.has(i.sku))
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
        setSelectedSkus(new Set())
      }
    } catch (error) {
      console.error('Failed to create PO:', error)
    }
  }

  // ==========================================
  // Render Helpers
  // ==========================================

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
            <p className="text-gray-400 mt-1">
              AI-powered predictions based on your sales history
            </p>
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
          <SettingsPanel 
            settings={settings} 
            setSettings={setSettings} 
            onClose={() => setShowSettings(false)} 
          />
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-700 pb-4">
          <TabButton 
            active={activeTab === 'trends'} 
            onClick={() => setActiveTab('trends')}
            icon={<BarChart3 className="w-5 h-5" />}
            label="Trends & Analysis"
            color="bg-indigo-600"
          />
          <TabButton 
            active={activeTab === 'purchasing'} 
            onClick={() => setActiveTab('purchasing')}
            icon={<ShoppingCart className="w-5 h-5" />}
            label="Purchasing"
            count={items.filter(i => i.urgency === 'critical' || i.urgency === 'high').length}
            color="bg-cyan-600"
          />
          <TabButton 
            active={activeTab === 'fba'} 
            onClick={() => setActiveTab('fba')}
            icon={<Truck className="w-5 h-5" />}
            label="FBA Replenishment"
            color="bg-purple-600"
          />
          <TabButton 
            active={activeTab === 'stockouts'} 
            onClick={() => setActiveTab('stockouts')}
            icon={<AlertCircle className="w-5 h-5" />}
            label="Stockout Analysis"
            count={stockouts.filter(s => !s.resolved).length}
            color="bg-red-600"
          />
        </div>

        {/* Tab Content */}
        {activeTab === 'trends' && (
          <TrendsTab 
            items={items} 
            selectedSku={selectedSkuForTrend}
            setSelectedSku={setSelectedSkuForTrend}
          />
        )}

        {activeTab === 'purchasing' && (
          <PurchasingTab
            items={filteredItems}
            selectedSkus={selectedSkus}
            toggleSelection={toggleSelection}
            selectAll={selectAll}
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
            setSelectedSkuForTrend={(sku: string) => {
              setSelectedSkuForTrend(sku)
              setActiveTab('trends')
            }}
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
          <StockoutsTab 
            stockouts={stockouts}
            onRefresh={fetchData}
          />
        )}
      </div>
    </MainLayout>
  )
}

// ==========================================
// Tab Button Component
// ==========================================

function TabButton({ 
  active, onClick, icon, label, count, color 
}: { 
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

function SettingsPanel({ 
  settings, 
  setSettings, 
  onClose 
}: { 
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
            <label htmlFor="roundTo5" className="text-sm text-gray-300">
              Round quantities to nearest 5
            </label>
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
// Trends Tab Component
// ==========================================

function TrendsTab({ 
  items, 
  selectedSku,
  setSelectedSku 
}: { 
  items: ForecastItem[]
  selectedSku: string | null
  setSelectedSku: (sku: string | null) => void
}) {
  const [trendData, setTrendData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Sort by velocity for dropdown
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.velocity30d - a.velocity30d)
  }, [items])

  // Auto-select top seller
  useEffect(() => {
    if (!selectedSku && sortedItems.length > 0) {
      setSelectedSku(sortedItems[0].sku)
    }
  }, [sortedItems, selectedSku, setSelectedSku])

  useEffect(() => {
    if (selectedSku) {
      fetchTrendData(selectedSku)
    }
  }, [selectedSku])

  const fetchTrendData = async (sku: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/forecasting/trends?sku=${sku}`)
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

  const selectedItem = items.find(i => i.sku === selectedSku)

  return (
    <div className="space-y-6">
      {/* SKU Selector - SKU first */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <label className="text-sm text-gray-400 block mb-2">Select Product to Analyze</label>
        <select
          value={selectedSku || ''}
          onChange={(e) => setSelectedSku(e.target.value || null)}
          className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
        >
          <option value="">Choose a product...</option>
          {sortedItems.map(item => (
            <option key={item.sku} value={item.sku}>
              {item.sku} — {(item.displayName || item.title)?.substring(0, 50)}
            </option>
          ))}
        </select>
      </div>

      {selectedSku && selectedItem && (
        <>
          {/* AI Analysis Card */}
          <div className="bg-gradient-to-r from-cyan-900/30 to-indigo-900/30 rounded-xl border border-cyan-500/30 p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-cyan-500/20 rounded-lg">
                <Brain className="w-6 h-6 text-cyan-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-white">{selectedItem.sku}</h3>
                  <span className="text-sm text-gray-500">{(selectedItem.displayName || selectedItem.title)?.substring(0, 40)}</span>
                </div>
                <div className="space-y-2 text-gray-300">
                  <p className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <span>
                      Sold <strong className="text-white">{Math.round(selectedItem.velocity7d * 7)} units</strong> in the last 7 days
                      <span className={selectedItem.velocityChange7d >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {' '}({selectedItem.velocityChange7d >= 0 ? '+' : ''}{selectedItem.velocityChange7d?.toFixed(1) || 0}% vs previous week)
                      </span>
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span>
                      At current velocity of <strong className="text-white">{selectedItem.velocity30d.toFixed(1)}/day</strong>, 
                      you have <strong className="text-white">{Math.round(selectedItem.totalDaysOfSupply)} days</strong> of inventory
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-cyan-400" />
                    <span>
                      <strong className="text-white">Recommendation:</strong>{' '}
                      {selectedItem.recommendedOrderQty > 0 
                        ? `Order ${selectedItem.recommendedOrderQty} units to maintain 180-day supply`
                        : 'Inventory levels are healthy'}
                    </span>
                  </p>
                </div>
                
                {/* Confidence */}
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">Forecast Confidence:</span>
                    <div className="flex-1 max-w-xs bg-slate-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          selectedItem.confidence > 0.7 ? 'bg-green-500' :
                          selectedItem.confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${selectedItem.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-white">
                      {Math.round(selectedItem.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-medium text-white mb-4">Sales Trend: Current Year vs Previous Year</h3>
            
            {loading ? (
              <div className="h-80 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-cyan-500" />
              </div>
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }} />
                  <Legend />
                  <Area type="monotone" dataKey="previousYear" name="Previous Year" stroke="#6B7280" fill="#6B7280" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="currentYear" name="Current Year" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-400">
                <p>No historical data available for this product</p>
              </div>
            )}
          </div>

          {/* Velocity Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <p className="text-sm text-gray-400">7-Day Velocity</p>
              <p className="text-2xl font-bold text-cyan-400 mt-1">{selectedItem.velocity7d.toFixed(2)}/day</p>
              {selectedItem.velocityChange7d !== undefined && (
                <p className={`text-sm mt-1 ${selectedItem.velocityChange7d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedItem.velocityChange7d >= 0 ? '↑' : '↓'} {Math.abs(selectedItem.velocityChange7d).toFixed(1)}%
                </p>
              )}
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <p className="text-sm text-gray-400">30-Day Velocity</p>
              <p className="text-2xl font-bold text-indigo-400 mt-1">{selectedItem.velocity30d.toFixed(2)}/day</p>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <p className="text-sm text-gray-400">90-Day Velocity</p>
              <p className="text-2xl font-bold text-purple-400 mt-1">{selectedItem.velocity90d.toFixed(2)}/day</p>
            </div>
          </div>
        </>
      )}

      {!selectedSku && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Select a product above to view trends and analysis</p>
        </div>
      )}
    </div>
  )
}

// ==========================================
// Purchasing Tab Component
// ==========================================

function PurchasingTab({
  items,
  selectedSkus,
  toggleSelection,
  selectAll,
  createPurchaseOrder,
  suppliers,
  selectedSupplier,
  setSelectedSupplier,
  filter,
  setFilter,
  sortBy,
  setSortBy,
  settings,
  applyRounding,
  getUrgencyColor,
  formatCurrency,
  formatPercent,
  setSelectedSkuForTrend,
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
        
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
        >
          <option value="all">All Urgency</option>
          <option value="critical">Critical Only</option>
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
        </select>
        
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
        >
          <option value="urgency">Sort by Urgency</option>
          <option value="daysOfSupply">Sort by Days of Supply</option>
          <option value="value">Sort by Value</option>
        </select>
        
        <div className="flex-1" />
        
        {selectedSkus.size > 0 && (
          <button
            onClick={createPurchaseOrder}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg"
          >
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
          <span className="ml-4 px-2 py-0.5 bg-slate-700 rounded text-xs">
            Rounding to nearest 5 enabled
          </span>
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
                  
                  {/* SKU First, Title Grayed */}
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
                    onClick={(e) => { e.stopPropagation(); setSelectedSkuForTrend(item.sku); }}
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
                        <div className="flex justify-between">
                          <span className="text-gray-500">FBA</span>
                          <span className="text-white">{item.fbaAvailable + item.fbaInbound}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Warehouse</span>
                          <span className="text-white">{item.warehouseAvailable}</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-700 pt-1">
                          <span className="text-gray-400 font-medium">Total</span>
                          <span className="text-white font-medium">{item.totalInventory}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-gray-400 mb-2">Supplier</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Name</span>
                          <span className="text-white">{item.supplierName || 'Not set'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Lead Time</span>
                          <span className="text-white">{item.leadTimeDays} days</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Unit Cost</span>
                          <span className="text-white">{formatCurrency(item.cost)}</span>
                        </div>
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
                            className={`h-2 rounded-full ${
                              item.confidence > 0.7 ? 'bg-green-500' :
                              item.confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
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
// FBA Tab Component - Enhanced with selection, editable qty, send by date
// ==========================================

function FbaTab({
  items,
  settings,
  setSettings,
  getUrgencyColor,
}: {
  items: ForecastItem[]
  settings: ForecastSettings
  setSettings: (s: ForecastSettings) => void
  getUrgencyColor: (urgency: string) => string
}) {
  // State for editable shipment items
  const [shipmentItems, setShipmentItems] = useState<FbaShipmentItem[]>([])
  const [sendByDate, setSendByDate] = useState<string>(() => {
    // Default to 3 days from now
    const date = new Date()
    date.setDate(date.getDate() + 3)
    return date.toISOString().split('T')[0]
  })

  // Initialize shipment items from forecast items
  useEffect(() => {
    const fbaItems = items
      .filter(item => 
        item.fbaDaysOfSupply < settings.fbaTargetDays + 10 &&
        item.warehouseAvailable > 0
      )
      .sort((a, b) => {
        // Sort by urgency first
        const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3, ok: 4 }
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || a.fbaDaysOfSupply - b.fbaDaysOfSupply
      })
      .map(item => ({
        ...item,
        sendQty: Math.min(item.recommendedFbaQty, item.warehouseAvailable),
        selected: item.urgency === 'critical' || item.urgency === 'high', // Auto-select urgent items
      }))
    
    setShipmentItems(fbaItems)
  }, [items, settings.fbaTargetDays])

  // Calculate totals for selected items
  const selectedItems = shipmentItems.filter(i => i.selected)
  const totalSelectedUnits = selectedItems.reduce((sum, i) => sum + i.sendQty, 0)
  const capacityUsed = (totalSelectedUnits / settings.fbaCapacity) * 100

  // Toggle selection
  const toggleSelect = (sku: string) => {
    setShipmentItems(prev => prev.map(item => 
      item.sku === sku ? { ...item, selected: !item.selected } : item
    ))
  }

  // Select all / none
  const toggleSelectAll = () => {
    const allSelected = shipmentItems.every(i => i.selected)
    setShipmentItems(prev => prev.map(item => ({ ...item, selected: !allSelected })))
  }

  // Update quantity
  const updateQty = (sku: string, qty: number) => {
    setShipmentItems(prev => prev.map(item => {
      if (item.sku !== sku) return item
      const maxQty = item.warehouseAvailable
      const newQty = Math.max(0, Math.min(qty, maxQty))
      return { ...item, sendQty: newQty }
    }))
  }

  // Create shipment
  const createFbaShipment = async () => {
    const itemsToShip = selectedItems.filter(i => i.sendQty > 0)
    if (itemsToShip.length === 0) return

    try {
      const response = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sendByDate,
          items: itemsToShip.map(i => ({
            sku: i.sku,
            quantity: i.sendQty,
          }))
        }),
      })
      
      if (response.ok) {
        alert(`FBA Shipment created for ${itemsToShip.length} SKUs!`)
      }
    } catch (error) {
      console.error('Failed to create shipment:', error)
    }
  }

  return (
    <div className="space-y-4">
      {/* Capacity & Send By Date Bar */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="flex items-center gap-6">
          {/* Capacity Input */}
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
          
          {/* Capacity Bar */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-700 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all ${
                    capacityUsed > 100 ? 'bg-red-500' : 
                    capacityUsed > 80 ? 'bg-orange-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(100, capacityUsed)}%` }}
                />
              </div>
              <span className={`text-sm font-medium ${capacityUsed > 100 ? 'text-red-400' : 'text-white'}`}>
                {totalSelectedUnits} / {settings.fbaCapacity}
              </span>
            </div>
          </div>

          {/* Send By Date */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <label className="text-sm text-gray-400">Send By:</label>
            <input
              type="date"
              value={sendByDate}
              onChange={(e) => setSendByDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
            />
          </div>
          
          {/* Create Shipment Button */}
          <button
            onClick={createFbaShipment}
            disabled={selectedItems.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              selectedItems.length > 0 
                ? 'bg-purple-600 hover:bg-purple-700' 
                : 'bg-slate-700 cursor-not-allowed text-gray-500'
            }`}
          >
            <Truck className="w-4 h-4" />
            Create Shipment ({selectedItems.length} SKUs)
          </button>
        </div>
      </div>

      {/* Capacity Warning */}
      {capacityUsed > 100 && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">
              Selected items exceed daily capacity by {totalSelectedUnits - settings.fbaCapacity} units. 
              Reduce quantities or deselect some items.
            </p>
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">FBA Replenishment List</h3>
          <p className="text-sm text-gray-400">
            {shipmentItems.length} items need replenishment
          </p>
        </div>
        
        {shipmentItems.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-8 text-center">
            <Truck className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No FBA replenishment needed right now</p>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 text-left text-sm text-gray-400">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={shipmentItems.length > 0 && shipmentItems.every(i => i.selected)}
                      onChange={toggleSelectAll}
                      className="rounded bg-slate-900 border-slate-700"
                    />
                  </th>
                  <th className="p-3">SKU / Product</th>
                  <th className="p-3 text-center">Urgency</th>
                  <th className="p-3 text-center">FBA Days</th>
                  <th className="p-3 text-center">Velocity</th>
                  <th className="p-3 text-center">WH Avail</th>
                  <th className="p-3 text-center w-32">Send Qty</th>
                </tr>
              </thead>
              <tbody>
                {shipmentItems.map((item) => (
                  <tr 
                    key={item.sku} 
                    className={`border-b border-slate-700/50 hover:bg-slate-750 ${
                      item.selected ? 'bg-purple-900/10' : ''
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleSelect(item.sku)}
                        className="rounded bg-slate-900 border-slate-700"
                      />
                    </td>
                    <td className="p-3">
                      {/* SKU First, Title Grayed */}
                      <p className="font-medium text-white">{item.sku}</p>
                      <p className="text-xs text-gray-500 truncate max-w-xs">
                        {(item.displayName || item.title)?.substring(0, 50)}
                      </p>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getUrgencyColor(item.urgency)}`}>
                        {item.urgency.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`font-medium ${
                        item.fbaDaysOfSupply < 14 ? 'text-red-400' :
                        item.fbaDaysOfSupply < 30 ? 'text-orange-400' : 'text-white'
                      }`}>
                        {Math.round(item.fbaDaysOfSupply)}
                      </span>
                    </td>
                    <td className="p-3 text-center text-white">
                      {item.velocity30d.toFixed(1)}/day
                    </td>
                    <td className="p-3 text-center text-white">
                      {item.warehouseAvailable}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          value={item.sendQty}
                          onChange={(e) => updateQty(item.sku, parseInt(e.target.value) || 0)}
                          className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-center"
                          min={0}
                          max={item.warehouseAvailable}
                        />
                        <button
                          onClick={() => updateQty(item.sku, item.recommendedFbaQty)}
                          className="p-1 hover:bg-slate-700 rounded text-gray-400 hover:text-white"
                          title="Reset to recommended"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>
                      {item.sendQty !== item.recommendedFbaQty && (
                        <p className="text-xs text-gray-500 mt-1">
                          Rec: {item.recommendedFbaQty}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {selectedItems.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Selected Shipment Summary</p>
              <p className="text-white font-medium">
                {selectedItems.length} SKUs • {totalSelectedUnits} units • Send by {new Date(sendByDate).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={createFbaShipment}
              className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium"
            >
              <Truck className="w-5 h-5" />
              Create FBA Shipment
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// Stockouts Tab Component
// ==========================================

function StockoutsTab({ 
  stockouts, 
  onRefresh 
}: { 
  stockouts: StockoutEvent[]
  onRefresh: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Total Stockouts (90d)</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{stockouts.length}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Days Lost</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">
            {stockouts.reduce((sum, s) => sum + s.daysOutOfStock, 0)}
          </p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Est. Lost Sales</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            ${stockouts.reduce((sum, s) => sum + s.estimatedLostSales, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Unresolved</p>
          <p className="text-2xl font-bold text-white mt-1">
            {stockouts.filter(s => !s.resolved).length}
          </p>
        </div>
      </div>

      {/* Stockouts List */}
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
              <div 
                key={stockout.id}
                className={`p-4 rounded-lg border ${
                  stockout.resolved 
                    ? 'bg-slate-900/50 border-slate-700' 
                    : 'bg-red-900/10 border-red-500/30'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    {/* SKU First */}
                    <h4 className="font-medium text-white">{stockout.sku}</h4>
                    <p className="text-xs text-gray-500">{stockout.title?.substring(0, 50)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">
                      {new Date(stockout.stockoutDate).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-red-400">
                      {stockout.daysOutOfStock} days out of stock
                    </p>
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
                  <p className="text-sm text-yellow-400">
                    Est. lost sales: ${stockout.estimatedLostSales.toLocaleString()}
                  </p>
                  {!stockout.resolved && (
                    <button className="text-sm text-cyan-400 hover:text-cyan-300">
                      Mark as Resolved
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
