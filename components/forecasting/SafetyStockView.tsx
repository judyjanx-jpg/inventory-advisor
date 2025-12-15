'use client'

import { useState, useEffect } from 'react'
import {
  Shield, AlertTriangle, CheckCircle, Info, RefreshCw,
  ChevronDown, ChevronUp, Calculator, TrendingUp
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'

interface SafetyStockItem {
  masterSku: string
  title: string
  currentStock: number
  safetyStockUnits: number
  recommendedDays: number
  serviceLevel: number
  demandVariability: number
  leadTimeVariability: number
  avgDailyDemand: number
  leadTimeDays: number
  status: 'adequate' | 'low' | 'critical'
}

interface ServiceLevelOption {
  level: number
  zScore: number
  label: string
  description: string
}

const SERVICE_LEVELS: ServiceLevelOption[] = [
  { level: 0.99, zScore: 2.33, label: '99%', description: 'Premium - 1 stockout per 100 cycles' },
  { level: 0.95, zScore: 1.65, label: '95%', description: 'Standard - 5 stockouts per 100 cycles' },
  { level: 0.90, zScore: 1.28, label: '90%', description: 'Basic - 10 stockouts per 100 cycles' },
]

export default function SafetyStockView() {
  const [items, setItems] = useState<SafetyStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [defaultServiceLevel, setDefaultServiceLevel] = useState(0.95)
  const [expandedSku, setExpandedSku] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'critical' | 'low' | 'adequate'>('all')
  const [showFormula, setShowFormula] = useState(false)

  useEffect(() => {
    fetchSafetyStock()
  }, [])

  const fetchSafetyStock = async () => {
    setLoading(true)
    try {
      // This would call the safety stock API
      const response = await fetch('/api/forecasting/recommendations')
      const data = await response.json()
      if (data.success) {
        // Transform data to safety stock view
        const transformedItems: SafetyStockItem[] = (data.items || []).map((item: any) => {
          const avgDailyDemand = item.velocity30d || 0
          const demandVariability = 0.2 // Would be calculated from actual data
          const leadTimeVariability = 0.15 // Would be calculated from actual data
          const leadTimeDays = item.leadTimeDays || 30
          const serviceLevel = defaultServiceLevel
          const zScore = SERVICE_LEVELS.find(s => s.level === serviceLevel)?.zScore || 1.65

          // Safety stock formula: Z × √(L × σd² + d² × σL²)
          const safetyStockUnits = Math.ceil(
            zScore * Math.sqrt(
              leadTimeDays * Math.pow(avgDailyDemand * demandVariability, 2) +
              Math.pow(avgDailyDemand, 2) * Math.pow(leadTimeDays * leadTimeVariability, 2)
            )
          )

          const recommendedDays = avgDailyDemand > 0 ? Math.ceil(safetyStockUnits / avgDailyDemand) : 14
          const currentStock = item.totalInventory || 0

          let status: 'adequate' | 'low' | 'critical' = 'adequate'
          if (currentStock < safetyStockUnits * 0.5) status = 'critical'
          else if (currentStock < safetyStockUnits) status = 'low'

          return {
            masterSku: item.sku,
            title: item.title || item.displayName,
            currentStock,
            safetyStockUnits,
            recommendedDays,
            serviceLevel,
            demandVariability,
            leadTimeVariability,
            avgDailyDemand,
            leadTimeDays,
            status,
          }
        })
        setItems(transformedItems)
      }
    } catch (error) {
      console.error('Failed to fetch safety stock:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredItems = items.filter(item => {
    if (filter === 'all') return true
    return item.status === filter
  })

  const summary = {
    total: items.length,
    adequate: items.filter(i => i.status === 'adequate').length,
    low: items.filter(i => i.status === 'low').length,
    critical: items.filter(i => i.status === 'critical').length,
    avgSafetyDays: items.length > 0
      ? (items.reduce((sum, i) => sum + i.recommendedDays, 0) / items.length).toFixed(1)
      : 0,
  }

  // Chart data
  const chartData = items.slice(0, 10).map(item => ({
    name: item.masterSku.substring(0, 10),
    current: item.currentStock,
    safetyStock: item.safetyStockUnits,
  }))

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'critical':
        return { color: 'text-red-400', bgColor: 'bg-red-500/20', borderColor: 'border-red-500/30', icon: AlertTriangle }
      case 'low':
        return { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', borderColor: 'border-yellow-500/30', icon: AlertTriangle }
      default:
        return { color: 'text-green-400', bgColor: 'bg-green-500/20', borderColor: 'border-green-500/30', icon: CheckCircle }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Total SKUs</p>
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-1">{summary.total}</p>
        </div>
        <div
          className={`bg-slate-800 rounded-xl p-4 border cursor-pointer transition-all ${
            filter === 'adequate' ? 'border-green-500 ring-1 ring-green-500' : 'border-slate-700 hover:border-green-500/50'
          }`}
          onClick={() => setFilter(filter === 'adequate' ? 'all' : 'adequate')}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Adequate</p>
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-green-400 mt-1">{summary.adequate}</p>
        </div>
        <div
          className={`bg-slate-800 rounded-xl p-4 border cursor-pointer transition-all ${
            filter === 'low' ? 'border-yellow-500 ring-1 ring-yellow-500' : 'border-slate-700 hover:border-yellow-500/50'
          }`}
          onClick={() => setFilter(filter === 'low' ? 'all' : 'low')}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Low</p>
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          </div>
          <p className="text-2xl font-bold text-yellow-400 mt-1">{summary.low}</p>
        </div>
        <div
          className={`bg-slate-800 rounded-xl p-4 border cursor-pointer transition-all ${
            filter === 'critical' ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-700 hover:border-red-500/50'
          }`}
          onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Critical</p>
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-red-400 mt-1">{summary.critical}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Avg Safety Days</p>
            <Calculator className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-purple-400 mt-1">{summary.avgSafetyDays}</p>
        </div>
      </div>

      {/* Service Level Selector & Formula */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Default Service Level:</span>
            <div className="flex gap-2">
              {SERVICE_LEVELS.map(level => (
                <button
                  key={level.level}
                  onClick={() => setDefaultServiceLevel(level.level)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    defaultServiceLevel === level.level
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500">
              {SERVICE_LEVELS.find(l => l.level === defaultServiceLevel)?.description}
            </span>
          </div>
          <button
            onClick={() => setShowFormula(!showFormula)}
            className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300"
          >
            <Calculator className="w-4 h-4" />
            {showFormula ? 'Hide' : 'Show'} Formula
          </button>
        </div>

        {showFormula && (
          <div className="mt-4 p-4 bg-slate-900/50 rounded-lg">
            <h4 className="text-sm font-medium text-white mb-2">Safety Stock Formula</h4>
            <div className="font-mono text-cyan-400 text-center py-2 text-lg">
              Safety Stock = Z × √(L × σd² + d² × σL²)
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
              <div>
                <p className="text-gray-400">Z (Z-score)</p>
                <p className="text-white">{SERVICE_LEVELS.find(l => l.level === defaultServiceLevel)?.zScore} for {(defaultServiceLevel * 100).toFixed(0)}% service level</p>
              </div>
              <div>
                <p className="text-gray-400">L (Lead Time)</p>
                <p className="text-white">Days from order to delivery</p>
              </div>
              <div>
                <p className="text-gray-400">σd (Demand Std Dev)</p>
                <p className="text-white">Variability in daily sales</p>
              </div>
              <div>
                <p className="text-gray-400">σL (Lead Time Std Dev)</p>
                <p className="text-white">Variability in supplier delivery</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-medium text-white mb-4">Current Stock vs Safety Stock (Top 10)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }} />
              <Legend />
              <Bar dataKey="current" name="Current Stock" fill="#06B6D4" />
              <Bar dataKey="safetyStock" name="Safety Stock" fill="#F59E0B" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Items List */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="font-medium text-white">Safety Stock Recommendations</h3>
          <button
            onClick={fetchSafetyStock}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-gray-300"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr className="text-xs font-medium text-gray-400 uppercase">
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Current Stock</th>
                <th className="px-4 py-3 text-center">Safety Stock</th>
                <th className="px-4 py-3 text-center">Safety Days</th>
                <th className="px-4 py-3 text-center">Avg Daily Demand</th>
                <th className="px-4 py-3 text-center">Lead Time</th>
                <th className="px-4 py-3 text-center">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredItems.slice(0, 50).map(item => {
                const statusConfig = getStatusConfig(item.status)
                const StatusIcon = statusConfig.icon
                const isExpanded = expandedSku === item.masterSku
                const deficit = item.safetyStockUnits - item.currentStock

                return (
                  <>
                    <tr key={item.masterSku} className="hover:bg-slate-700/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{item.masterSku}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{item.title}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor}`}>
                          <StatusIcon className="w-3 h-3" />
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-white">{item.currentStock}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-medium ${deficit > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                          {item.safetyStockUnits}
                        </span>
                        {deficit > 0 && (
                          <p className="text-xs text-red-400">-{deficit} deficit</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-white">{item.recommendedDays}d</td>
                      <td className="px-4 py-3 text-center text-white">{item.avgDailyDemand.toFixed(1)}/day</td>
                      <td className="px-4 py-3 text-center text-white">{item.leadTimeDays}d</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setExpandedSku(isExpanded ? null : item.masterSku)}
                          className="p-1 hover:bg-slate-600 rounded text-gray-400 hover:text-white"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-900/50">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="grid grid-cols-4 gap-6">
                            <div>
                              <h5 className="text-sm font-medium text-gray-400 mb-2">Calculation Inputs</h5>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Service Level</span>
                                  <span className="text-white">{(item.serviceLevel * 100).toFixed(0)}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Demand Variability</span>
                                  <span className="text-white">{(item.demandVariability * 100).toFixed(0)}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Lead Time Variability</span>
                                  <span className="text-white">{(item.leadTimeVariability * 100).toFixed(0)}%</span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <h5 className="text-sm font-medium text-gray-400 mb-2">Stock Analysis</h5>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Current Stock</span>
                                  <span className="text-white">{item.currentStock} units</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Safety Stock</span>
                                  <span className="text-white">{item.safetyStockUnits} units</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Coverage</span>
                                  <span className={item.currentStock >= item.safetyStockUnits ? 'text-green-400' : 'text-red-400'}>
                                    {((item.currentStock / item.safetyStockUnits) * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="col-span-2">
                              <h5 className="text-sm font-medium text-gray-400 mb-2">Recommendation</h5>
                              {item.status === 'critical' && (
                                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                                  <p className="text-sm text-red-300">
                                    <strong>Urgent:</strong> Stock is critically below safety levels.
                                    Order at least {deficit} units immediately to maintain {(item.serviceLevel * 100).toFixed(0)}% service level.
                                  </p>
                                </div>
                              )}
                              {item.status === 'low' && (
                                <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                                  <p className="text-sm text-yellow-300">
                                    <strong>Warning:</strong> Stock is below recommended safety level.
                                    Consider ordering {deficit} units to maintain buffer.
                                  </p>
                                </div>
                              )}
                              {item.status === 'adequate' && (
                                <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                                  <p className="text-sm text-green-300">
                                    <strong>Healthy:</strong> Current stock meets or exceeds safety stock requirements.
                                    Buffer of {item.currentStock - item.safetyStockUnits} units above minimum.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
