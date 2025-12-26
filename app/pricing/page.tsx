'use client'

import { useState, useEffect, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { 
  DollarSign, 
  Percent, 
  TrendingUp, 
  TrendingDown,
  ChevronDown, 
  ChevronRight,
  Check,
  X,
  RefreshCw,
  Filter,
  ArrowUpDown,
  Settings2,
  History,
  AlertCircle,
  CheckCircle2,
  MinusCircle
} from 'lucide-react'

interface PricingItem {
  sku: string
  title: string
  asin: string | null
  currentPrice: number
  cost: number
  totalCost: number
  fbaFee: number
  referralFee: number
  refundPercent: number
  adsPercent: number
  recentOrders: {
    date: string
    price: number
    profit: number
    profitPercent: number
  }[]
  avgRecentProfit: number
  avgRecentProfitPercent: number
  targetPrice: number
  profitAtTarget: number
  profitPercentAtTarget: number
  status: 'green' | 'yellow' | 'red'
  schedule: {
    step: number
    price: number
    scheduledFor: string
    status: string
  }[] | null
  override: {
    targetType: string | null
    targetValue: number | null
    maxRaisePercent: number | null
  } | null
}

interface HistoryEntry {
  date: string
  oldPrice: number
  newPrice: number
  triggeredBy: string
}

const StatusIcon = ({ status }: { status: 'green' | 'yellow' | 'red' }) => {
  if (status === 'green') return <CheckCircle2 className="w-5 h-5 text-emerald-400" />
  if (status === 'yellow') return <MinusCircle className="w-5 h-5 text-amber-400" />
  return <AlertCircle className="w-5 h-5 text-red-400" />
}

export default function PricingPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<PricingItem[]>([])
  const [settings, setSettings] = useState({
    targetType: 'dollar' as 'dollar' | 'margin',
    targetValue: 5,
    maxRaisePercent: 8
  })
  const [settingsChanged, setSettingsChanged] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  
  // Filters & Selection
  const [statusFilter, setStatusFilter] = useState<'all' | 'red' | 'yellow' | 'green'>('all')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [editedPrices, setEditedPrices] = useState<Map<string, number>>(new Map())
  
  // Expanded rows for history
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [historyData, setHistoryData] = useState<Map<string, { history: HistoryEntry[], chartData: { date: string, price: number }[] }>>(new Map())
  
  // Bulk update state
  const [updating, setUpdating] = useState(false)
  const [updateResult, setUpdateResult] = useState<{ total: number, successful: number, failed: { sku: string, error: string }[] } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/pricing')
      const data = await res.json()
      if (data.success) {
        setItems(data.items)
        setSettings(data.settings)
      }
    } catch (error) {
      console.error('Failed to fetch pricing data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/pricing/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      if (res.ok) {
        setSettingsChanged(false)
        fetchData() // Refresh data with new targets
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSavingSettings(false)
    }
  }

  const fetchHistory = async (sku: string) => {
    try {
      const res = await fetch(`/api/pricing/history/${encodeURIComponent(sku)}`)
      const data = await res.json()
      if (data.success) {
        setHistoryData(prev => new Map(prev).set(sku, {
          history: data.history,
          chartData: data.chartData
        }))
      }
    } catch (error) {
      console.error('Failed to fetch history:', error)
    }
  }

  const toggleRow = (sku: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(sku)) {
      newExpanded.delete(sku)
    } else {
      newExpanded.add(sku)
      if (!historyData.has(sku)) {
        fetchHistory(sku)
      }
    }
    setExpandedRows(newExpanded)
  }

  const toggleSelectAll = () => {
    const filtered = filteredItems
    if (selectedItems.size === filtered.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(filtered.map(i => i.sku)))
    }
  }

  const toggleSelect = (sku: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(sku)) {
      newSelected.delete(sku)
    } else {
      newSelected.add(sku)
    }
    setSelectedItems(newSelected)
  }

  const handlePriceEdit = (sku: string, value: string) => {
    const price = parseFloat(value)
    if (!isNaN(price) && price > 0) {
      setEditedPrices(new Map(editedPrices).set(sku, price))
    } else if (value === '') {
      const newPrices = new Map(editedPrices)
      newPrices.delete(sku)
      setEditedPrices(newPrices)
    }
  }

  const applyScheduleStep = async (sku: string) => {
    try {
      const res = await fetch('/api/pricing/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku })
      })
      if (res.ok) {
        fetchData()
      }
    } catch (error) {
      console.error('Failed to apply schedule step:', error)
    }
  }

  const bulkUpdate = async () => {
    if (selectedItems.size === 0) return
    
    setUpdating(true)
    setUpdateResult(null)
    
    const updates = Array.from(selectedItems).map(sku => {
      const item = items.find(i => i.sku === sku)
      const editedPrice = editedPrices.get(sku)
      return {
        sku,
        newPrice: editedPrice || item?.targetPrice || 0,
        createSchedule: true
      }
    })
    
    try {
      const res = await fetch('/api/pricing/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      })
      const data = await res.json()
      
      setUpdateResult({
        total: data.total,
        successful: data.successful,
        failed: data.failedItems || []
      })
      
      if (data.successful > 0) {
        fetchData()
        setSelectedItems(new Set())
        setEditedPrices(new Map())
      }
    } catch (error) {
      console.error('Bulk update failed:', error)
    } finally {
      setUpdating(false)
    }
  }

  const filteredItems = items.filter(item => 
    statusFilter === 'all' || item.status === statusFilter
  )

  const statusCounts = {
    all: items.length,
    red: items.filter(i => i.status === 'red').length,
    yellow: items.filter(i => i.status === 'yellow').length,
    green: items.filter(i => i.status === 'green').length
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return '$0.00'
    return `$${value.toFixed(2)}`
  }
  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return '0.0%'
    return `${value.toFixed(1)}%`
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
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
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Pricing Tool</h1>
            <p className="text-[var(--muted-foreground)] mt-1">
              Optimize prices to meet profit targets
            </p>
          </div>
          <Button onClick={fetchData} variant="secondary" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        {/* Global Settings */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Global Settings</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Target Type */}
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1.5">Target Type</label>
              <select
                value={settings.targetType}
                onChange={(e) => {
                  setSettings({ ...settings, targetType: e.target.value as 'dollar' | 'margin' })
                  setSettingsChanged(true)
                }}
                className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                <option value="dollar">Dollar Amount</option>
                <option value="margin">Margin %</option>
              </select>
            </div>

            {/* Target Value */}
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1.5">
                Target {settings.targetType === 'dollar' ? 'Profit ($)' : 'Margin (%)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
                  {settings.targetType === 'dollar' ? '$' : ''}
                </span>
                <input
                  type="number"
                  step={settings.targetType === 'dollar' ? '0.01' : '1'}
                  value={settings.targetValue}
                  onChange={(e) => {
                    setSettings({ ...settings, targetValue: parseFloat(e.target.value) || 0 })
                    setSettingsChanged(true)
                  }}
                  className={`w-full py-2 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${settings.targetType === 'dollar' ? 'pl-7 pr-3' : 'pl-3 pr-7'}`}
                />
                {settings.targetType === 'margin' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">%</span>
                )}
              </div>
            </div>

            {/* Max Raise % */}
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1.5">Max Raise %</label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  value={settings.maxRaisePercent}
                  onChange={(e) => {
                    setSettings({ ...settings, maxRaisePercent: parseFloat(e.target.value) || 0 })
                    setSettingsChanged(true)
                  }}
                  className="w-full px-3 py-2 pr-7 bg-[var(--input-bg)] border border-[var(--border-color)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">%</span>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-end">
              <Button
                onClick={saveSettings}
                disabled={!settingsChanged || savingSettings}
                className="w-full"
              >
                {savingSettings ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </div>
          </div>

          <p className="text-xs text-[var(--muted-foreground)] mt-3">
            Per-item overrides can be set in Product Settings. Prices round up to .99 or .49.
          </p>
        </Card>

        {/* Status Filter Tabs & Bulk Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[var(--card-bg)] rounded-lg border border-[var(--border-color)]">
            {(['all', 'red', 'yellow', 'green'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  statusFilter === status
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  {status === 'all' && <Filter className="w-4 h-4" />}
                  {status === 'red' && <AlertCircle className="w-4 h-4 text-red-400" />}
                  {status === 'yellow' && <MinusCircle className="w-4 h-4 text-amber-400" />}
                  {status === 'green' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status]})
                </span>
              </button>
            ))}
          </div>

          {/* Bulk Actions */}
          {selectedItems.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--muted-foreground)]">
                {selectedItems.size} selected
              </span>
              <Button onClick={bulkUpdate} disabled={updating}>
                {updating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Update Selected
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Update Result Banner */}
        {updateResult && (
          <div className={`p-4 rounded-lg border ${
            updateResult.failed.length > 0 
              ? 'bg-amber-500/10 border-amber-500/30' 
              : 'bg-emerald-500/10 border-emerald-500/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {updateResult.failed.length > 0 ? (
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
                <span className="text-[var(--foreground)]">
                  Updated {updateResult.successful}/{updateResult.total} prices.
                  {updateResult.failed.length > 0 && (
                    <span className="text-amber-400 ml-1">
                      {updateResult.failed.length} failed: {updateResult.failed.map(f => f.sku).join(', ')}
                    </span>
                  )}
                </span>
              </div>
              {updateResult.failed.length > 0 && (
                <Button variant="secondary" size="sm" onClick={bulkUpdate}>
                  Retry Failed
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Pricing Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--muted)]/30">
                  <th className="p-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-[var(--border-color)] text-cyan-500 focus:ring-cyan-500/50"
                    />
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">SKU</th>
                  <th className="p-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Current Price</th>
                  <th className="p-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Recent Avg</th>
                  <th className="p-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Profit $</th>
                  <th className="p-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Profit %</th>
                  <th className="p-3 text-center text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Status</th>
                  <th className="p-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Target Price</th>
                  <th className="p-3 text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Schedule</th>
                  <th className="p-3 text-right text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Action</th>
                  <th className="p-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredItems.map((item) => (
                  <>
                    <tr 
                      key={item.sku}
                      className={`hover:bg-[var(--hover-bg)] transition-colors ${
                        selectedItems.has(item.sku) ? 'bg-cyan-500/5' : ''
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.sku)}
                          onChange={() => toggleSelect(item.sku)}
                          className="w-4 h-4 rounded border-[var(--border-color)] text-cyan-500 focus:ring-cyan-500/50"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-sm text-[var(--foreground)]">{item.sku}</span>
                          <span className="text-xs text-[var(--muted-foreground)] truncate max-w-[200px]">{item.title}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-[var(--foreground)]">
                        {formatCurrency(item.currentPrice)}
                      </td>
                      <td className="p-3 text-right">
                        {item.recentOrders.length > 0 ? (
                          <span className="font-mono text-[var(--foreground)]">
                            {formatCurrency(item.recentOrders[0].price)}
                          </span>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono ${item.avgRecentProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(item.avgRecentProfit)}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className={`font-mono ${item.avgRecentProfitPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatPercent(item.avgRecentProfitPercent)}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <StatusIcon status={item.status} />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-cyan-400">{formatCurrency(item.targetPrice)}</span>
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {formatCurrency(item.profitAtTarget)} ({formatPercent(item.profitPercentAtTarget)})
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        {item.schedule && item.schedule.length > 0 ? (
                          <div className="flex items-center gap-2 text-xs">
                            {item.schedule.map((step, idx) => (
                              <div key={step.step} className="flex items-center">
                                {idx > 0 && <span className="text-[var(--muted-foreground)] mx-1">→</span>}
                                <span className={`font-mono ${step.status === 'applied' ? 'text-emerald-400' : 'text-[var(--foreground)]'}`}>
                                  {formatCurrency(step.price)}
                                </span>
                                {step.status === 'pending' && idx === 0 && (
                                  <button
                                    onClick={() => applyScheduleStep(item.sku)}
                                    className="ml-1 px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px] hover:bg-cyan-500/30 transition-colors"
                                  >
                                    Update
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={item.targetPrice.toFixed(2)}
                          value={editedPrices.get(item.sku) || ''}
                          onChange={(e) => handlePriceEdit(item.sku, e.target.value)}
                          className="w-20 px-2 py-1 text-right font-mono text-sm bg-[var(--input-bg)] border border-[var(--border-color)] rounded focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => toggleRow(item.sku)}
                          className="p-1 hover:bg-[var(--hover-bg)] rounded transition-colors"
                        >
                          {expandedRows.has(item.sku) ? (
                            <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />
                          )}
                        </button>
                      </td>
                    </tr>
                    
                    {/* Expanded History Row */}
                    {expandedRows.has(item.sku) && (
                      <tr key={`${item.sku}-history`}>
                        <td colSpan={11} className="p-0">
                          <div className="bg-[var(--muted)]/20 p-4 border-t border-[var(--border-color)]">
                            <div className="flex items-center gap-2 mb-3">
                              <History className="w-4 h-4 text-cyan-400" />
                              <span className="text-sm font-medium text-[var(--foreground)]">Price History (Last 30 Days)</span>
                            </div>
                            
                            {historyData.has(item.sku) ? (
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Chart */}
                                <div className="bg-[var(--card-bg)] rounded-lg p-4 border border-[var(--border-color)]">
                                  <div className="h-32 flex items-end gap-1">
                                    {historyData.get(item.sku)!.chartData.map((point, idx) => {
                                      const data = historyData.get(item.sku)!.chartData
                                      const max = Math.max(...data.map(d => d.price))
                                      const min = Math.min(...data.map(d => d.price))
                                      const range = max - min || 1
                                      const height = ((point.price - min) / range) * 100
                                      
                                      return (
                                        <div
                                          key={idx}
                                          className="flex-1 bg-gradient-to-t from-cyan-500/50 to-cyan-400/80 rounded-t transition-all hover:from-cyan-500/70 hover:to-cyan-400"
                                          style={{ height: `${Math.max(height, 10)}%` }}
                                          title={`${point.date.split('T')[0]}: ${formatCurrency(point.price)}`}
                                        />
                                      )
                                    })}
                                  </div>
                                  <div className="flex justify-between mt-2 text-xs text-[var(--muted-foreground)]">
                                    <span>{historyData.get(item.sku)!.chartData[0]?.date.split('T')[0]}</span>
                                    <span>{historyData.get(item.sku)!.chartData[historyData.get(item.sku)!.chartData.length - 1]?.date.split('T')[0]}</span>
                                  </div>
                                </div>
                                
                                {/* Log */}
                                <div className="bg-[var(--card-bg)] rounded-lg p-4 border border-[var(--border-color)] max-h-40 overflow-y-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-[var(--muted-foreground)] text-xs">
                                        <th className="text-left pb-2">Date</th>
                                        <th className="text-right pb-2">Old</th>
                                        <th className="text-right pb-2">New</th>
                                        <th className="text-right pb-2">Trigger</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-color)]">
                                      {historyData.get(item.sku)!.history.slice(0, 10).map((entry, idx) => (
                                        <tr key={idx} className="text-[var(--foreground)]">
                                          <td className="py-1.5">{entry.date.split('T')[0]}</td>
                                          <td className="py-1.5 text-right font-mono">{formatCurrency(entry.oldPrice)}</td>
                                          <td className="py-1.5 text-right font-mono">{formatCurrency(entry.newPrice)}</td>
                                          <td className="py-1.5 text-right">
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                              entry.triggeredBy === 'manual' 
                                                ? 'bg-blue-500/20 text-blue-400' 
                                                : entry.triggeredBy === 'scheduled'
                                                ? 'bg-purple-500/20 text-purple-400'
                                                : 'bg-gray-500/20 text-gray-400'
                                            }`}>
                                              {entry.triggeredBy}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                      {historyData.get(item.sku)!.history.length === 0 && (
                                        <tr>
                                          <td colSpan={4} className="py-4 text-center text-[var(--muted-foreground)]">
                                            No price changes recorded
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-32">
                                <RefreshCw className="w-5 h-5 animate-spin text-cyan-500" />
                              </div>
                            )}
                            
                            {/* Recent Orders */}
                            {item.recentOrders.length > 0 && (
                              <div className="mt-4">
                                <span className="text-sm font-medium text-[var(--foreground)] mb-2 block">Recent Orders (Last 5)</span>
                                <div className="flex gap-2 flex-wrap">
                                  {item.recentOrders.map((order, idx) => (
                                    <div key={idx} className="px-3 py-2 bg-[var(--card-bg)] rounded-lg border border-[var(--border-color)] text-xs">
                                      <div className="text-[var(--muted-foreground)]">{order.date}</div>
                                      <div className="font-mono text-[var(--foreground)]">{formatCurrency(order.price)}</div>
                                      <div className={`font-mono ${order.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {formatCurrency(order.profit)} ({formatPercent(order.profitPercent)})
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-[var(--muted-foreground)]">
                      {items.length === 0 ? 'No products found' : 'No items match the selected filter'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </MainLayout>
  )
}
