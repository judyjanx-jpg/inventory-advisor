'use client'

import { useState, useEffect } from 'react'
import {
  Bell, AlertTriangle, AlertCircle, Info, CheckCircle,
  X, Filter, ChevronDown, RefreshCw, Clock, Archive
} from 'lucide-react'

interface ForecastAlert {
  id: string
  masterSku: string
  type: string
  title: string
  message: string
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  metadata?: Record<string, any>
  createdAt: string
  acknowledgedAt?: string
  resolvedAt?: string
}

const URGENCY_CONFIG = {
  CRITICAL: {
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: AlertCircle,
    bgColor: 'bg-red-900/10',
    borderColor: 'border-red-500/30',
  },
  HIGH: {
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    icon: AlertTriangle,
    bgColor: 'bg-orange-900/10',
    borderColor: 'border-orange-500/30',
  },
  MEDIUM: {
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: Info,
    bgColor: 'bg-yellow-900/10',
    borderColor: 'border-yellow-500/30',
  },
  LOW: {
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: Info,
    bgColor: 'bg-blue-900/10',
    borderColor: 'border-blue-500/30',
  },
}

const ALERT_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'stockout', label: 'Stockout Risk' },
  { value: 'spike', label: 'Demand Spike' },
  { value: 'anomaly', label: 'Anomaly' },
  { value: 'seasonality', label: 'Seasonal Event' },
  { value: 'supplier', label: 'Supplier Issue' },
  { value: 'accuracy', label: 'Accuracy Warning' },
]

export default function AlertCenter() {
  const [alerts, setAlerts] = useState<ForecastAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unacknowledged' | 'acknowledged'>('unacknowledged')
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchAlerts()
  }, [])

  const fetchAlerts = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/forecasting/engine?action=alerts')
      const data = await response.json()
      if (data.success) {
        setAlerts(data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
      // Mock data for demo
      setAlerts([
        {
          id: '1',
          masterSku: 'SKU-001',
          type: 'stockout',
          title: 'Stockout Risk - SKU-001',
          message: 'Inventory will run out in 5 days at current velocity',
          urgency: 'CRITICAL',
          metadata: { daysUntilStockout: 5, velocity: 12.5 },
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          masterSku: 'SKU-002',
          type: 'spike',
          title: 'Demand Spike Detected',
          message: 'Sales increased 85% over baseline. Possible cause: Advertising',
          urgency: 'HIGH',
          metadata: { magnitude: 0.85, cause: 'advertising' },
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: '3',
          masterSku: 'SKU-003',
          type: 'seasonality',
          title: 'Prime Day Approaching',
          message: 'Prime Day starts in 14 days. Expected demand increase: +120%',
          urgency: 'MEDIUM',
          metadata: { daysUntil: 14, multiplier: 2.2 },
          createdAt: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          id: '4',
          masterSku: 'SKU-004',
          type: 'supplier',
          title: 'Supplier Lead Time Warning',
          message: 'Supplier ABC Co. average lead time increased to 45 days (stated: 30)',
          urgency: 'MEDIUM',
          metadata: { actualLeadTime: 45, statedLeadTime: 30 },
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: '5',
          masterSku: 'SKU-005',
          type: 'anomaly',
          title: 'Sales Anomaly Detected',
          message: 'Unusual sales pattern detected. 3 standard deviations from expected',
          urgency: 'LOW',
          metadata: { deviation: 3.2 },
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          acknowledgedAt: new Date().toISOString(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const acknowledgeAlert = async (alertId: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, acknowledgedAt: new Date().toISOString() } : a
    ))
    // API call would go here
  }

  const resolveAlert = async (alertId: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, resolvedAt: new Date().toISOString() } : a
    ))
    // API call would go here
  }

  const dismissAlert = async (alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId))
    // API call would go here
  }

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'unacknowledged' && alert.acknowledgedAt) return false
    if (filter === 'acknowledged' && !alert.acknowledgedAt) return false
    if (urgencyFilter !== 'all' && alert.urgency !== urgencyFilter) return false
    if (typeFilter !== 'all' && alert.type !== typeFilter) return false
    return true
  })

  const alertCounts = {
    critical: alerts.filter(a => a.urgency === 'CRITICAL' && !a.acknowledgedAt).length,
    high: alerts.filter(a => a.urgency === 'HIGH' && !a.acknowledgedAt).length,
    medium: alerts.filter(a => a.urgency === 'MEDIUM' && !a.acknowledgedAt).length,
    low: alerts.filter(a => a.urgency === 'LOW' && !a.acknowledgedAt).length,
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
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
      <div className="grid grid-cols-4 gap-4">
        <div
          className={`bg-slate-800 rounded-xl p-4 border cursor-pointer transition-all ${
            urgencyFilter === 'CRITICAL' ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-700 hover:border-red-500/50'
          }`}
          onClick={() => setUrgencyFilter(urgencyFilter === 'CRITICAL' ? 'all' : 'CRITICAL')}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Critical</p>
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-3xl font-bold text-red-400 mt-1">{alertCounts.critical}</p>
        </div>
        <div
          className={`bg-slate-800 rounded-xl p-4 border cursor-pointer transition-all ${
            urgencyFilter === 'HIGH' ? 'border-orange-500 ring-1 ring-orange-500' : 'border-slate-700 hover:border-orange-500/50'
          }`}
          onClick={() => setUrgencyFilter(urgencyFilter === 'HIGH' ? 'all' : 'HIGH')}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">High</p>
            <AlertTriangle className="w-5 h-5 text-orange-400" />
          </div>
          <p className="text-3xl font-bold text-orange-400 mt-1">{alertCounts.high}</p>
        </div>
        <div
          className={`bg-slate-800 rounded-xl p-4 border cursor-pointer transition-all ${
            urgencyFilter === 'MEDIUM' ? 'border-yellow-500 ring-1 ring-yellow-500' : 'border-slate-700 hover:border-yellow-500/50'
          }`}
          onClick={() => setUrgencyFilter(urgencyFilter === 'MEDIUM' ? 'all' : 'MEDIUM')}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Medium</p>
            <Info className="w-5 h-5 text-yellow-400" />
          </div>
          <p className="text-3xl font-bold text-yellow-400 mt-1">{alertCounts.medium}</p>
        </div>
        <div
          className={`bg-slate-800 rounded-xl p-4 border cursor-pointer transition-all ${
            urgencyFilter === 'LOW' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-700 hover:border-blue-500/50'
          }`}
          onClick={() => setUrgencyFilter(urgencyFilter === 'LOW' ? 'all' : 'LOW')}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Low</p>
            <Info className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-blue-400 mt-1">{alertCounts.low}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 p-1">
            <button
              onClick={() => setFilter('unacknowledged')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filter === 'unacknowledged' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Unread ({alerts.filter(a => !a.acknowledgedAt).length})
            </button>
            <button
              onClick={() => setFilter('acknowledged')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filter === 'acknowledged' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Acknowledged
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filter === 'all' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              All
            </button>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm ${
              showFilters ? 'text-cyan-400' : 'text-gray-400'
            } hover:text-white`}
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAlerts}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-gray-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {alerts.filter(a => !a.acknowledgedAt).length > 0 && (
            <button
              onClick={() => alerts.filter(a => !a.acknowledgedAt).forEach(a => acknowledgeAlert(a.id))}
              className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm text-white"
            >
              <CheckCircle className="w-4 h-4" />
              Acknowledge All
            </button>
          )}
        </div>
      </div>

      {/* Extended Filters */}
      {showFilters && (
        <div className="flex items-center gap-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Alert Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              {ALERT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { setTypeFilter('all'); setUrgencyFilter('all'); }}
            className="text-sm text-cyan-400 hover:text-cyan-300"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Alerts List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
            <Bell className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No alerts match your filters</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const config = URGENCY_CONFIG[alert.urgency]
            const Icon = config.icon

            return (
              <div
                key={alert.id}
                className={`bg-slate-800 rounded-xl border p-4 transition-all ${
                  alert.acknowledgedAt ? 'border-slate-700 opacity-60' : config.borderColor
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${config.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-white">{alert.title}</h4>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${config.color}`}>
                        {alert.urgency}
                      </span>
                      {alert.acknowledgedAt && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-gray-400">
                          Acknowledged
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300">{alert.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(alert.createdAt)}
                      </span>
                      <span>SKU: {alert.masterSku}</span>
                      <span className="capitalize">{alert.type}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!alert.acknowledgedAt && (
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="p-2 hover:bg-slate-700 rounded-lg text-gray-400 hover:text-green-400"
                        title="Acknowledge"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="p-2 hover:bg-slate-700 rounded-lg text-gray-400 hover:text-cyan-400"
                      title="Mark Resolved"
                    >
                      <Archive className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="p-2 hover:bg-slate-700 rounded-lg text-gray-400 hover:text-red-400"
                      title="Dismiss"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Metadata Details */}
                {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-4 text-sm">
                    {Object.entries(alert.metadata).map(([key, value]) => (
                      <span key={key} className="text-gray-400">
                        <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}: </span>
                        <span className="text-white">
                          {typeof value === 'number' ? (
                            key.includes('multiplier') || key.includes('magnitude')
                              ? `${(value * 100).toFixed(0)}%`
                              : value.toFixed(1)
                          ) : value}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
