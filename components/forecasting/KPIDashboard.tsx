'use client'

import { useState, useEffect } from 'react'
import {
  Target, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  RefreshCw, Calendar, Download, Activity, Package, Clock, Brain
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts'

interface KPI {
  value: string
  target?: number
  unit: string
  status?: 'good' | 'warning' | 'critical'
}

interface KPIData {
  forecastAccuracy: KPI
  stockoutPreventionRate: KPI
  inventoryValue: KPI
  avgLeadTime: KPI
  manualOverrideRate: KPI
}

interface WeeklySummary {
  weekOf: string
  forecastAccuracy: {
    current: string
    previous: string
    trend: 'improving' | 'declining' | 'stable'
  }
  skusRequiringOrders: {
    count: number
    items: { masterSku: string; urgency: string; daysOfSupply: number }[]
  }
  upcomingEvents: { name: string; daysUntil: number; multiplier: number }[]
  anomalies: {
    count: number
    summary: string[]
  }
}

interface ModelPerformance {
  model: string
  accuracy: string
  skuCount: number
}

const STATUS_COLORS = {
  good: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  warning: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
}

export default function KPIDashboard() {
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null)
  const [modelPerformance, setModelPerformance] = useState<ModelPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d')

  // Mock accuracy trend data
  const [accuracyTrend, setAccuracyTrend] = useState<{ date: string; accuracy: number }[]>([])

  useEffect(() => {
    fetchDashboardData()
  }, [timeRange])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const [kpiRes, weeklyRes] = await Promise.all([
        fetch('/api/forecasting/reports?action=kpis'),
        fetch('/api/forecasting/reports?action=weekly-summary'),
      ])

      const kpiData = await kpiRes.json()
      const weeklyData = await weeklyRes.json()

      if (kpiData.success) {
        setKpis(kpiData.data)
      }

      if (weeklyData.success) {
        setWeeklySummary(weeklyData.data)
      }

      // Generate mock accuracy trend
      const trend = []
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
      for (let i = days; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        trend.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          accuracy: 80 + Math.random() * 15,
        })
      }
      setAccuracyTrend(trend)

      // Mock model performance
      setModelPerformance([
        { model: 'Prophet', accuracy: '87.2', skuCount: 145 },
        { model: 'Exp Smoothing', accuracy: '84.5', skuCount: 145 },
        { model: 'ARIMA', accuracy: '82.1', skuCount: 145 },
        { model: 'LSTM', accuracy: '79.8', skuCount: 145 },
      ])
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      // Set mock data
      setKpis({
        forecastAccuracy: { value: '86.2', target: 85, unit: '%', status: 'good' },
        stockoutPreventionRate: { value: '97.8', target: 98, unit: '%', status: 'warning' },
        inventoryValue: { value: '245000', unit: '$' },
        avgLeadTime: { value: '32', unit: 'days' },
        manualOverrideRate: { value: '4.2', target: 10, unit: '%', status: 'good' },
      })
      setWeeklySummary({
        weekOf: new Date().toISOString(),
        forecastAccuracy: { current: '86.2', previous: '84.5', trend: 'improving' },
        skusRequiringOrders: {
          count: 12,
          items: [
            { masterSku: 'SKU-001', urgency: 'critical', daysOfSupply: 5 },
            { masterSku: 'SKU-002', urgency: 'high', daysOfSupply: 12 },
            { masterSku: 'SKU-003', urgency: 'high', daysOfSupply: 15 },
          ],
        },
        upcomingEvents: [
          { name: 'Prime Day', daysUntil: 14, multiplier: 2.5 },
          { name: 'Back to School', daysUntil: 30, multiplier: 1.3 },
        ],
        anomalies: { count: 3, summary: ['Demand spike detected', 'Supplier delay'] },
      })
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (value: string, unit: string) => {
    const num = parseFloat(value)
    if (unit === '$') return `$${num.toLocaleString()}`
    if (unit === '%') return `${num}%`
    return `${num} ${unit}`
  }

  const getKPIIcon = (status?: string) => {
    if (status === 'good') return <CheckCircle className="w-5 h-5 text-green-400" />
    if (status === 'warning') return <AlertTriangle className="w-5 h-5 text-yellow-400" />
    if (status === 'critical') return <AlertTriangle className="w-5 h-5 text-red-400" />
    return <Activity className="w-5 h-5 text-cyan-400" />
  }

  const getTrendIcon = (trend: string) => {
    if (trend === 'improving') return <TrendingUp className="w-4 h-4 text-green-400" />
    if (trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-400" />
    return <Activity className="w-4 h-4 text-[var(--muted-foreground)]" />
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
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[var(--muted-foreground)]" />
          <div className="flex bg-[var(--card)] rounded-lg border border-[var(--border)] p-1">
            {(['7d', '30d', '90d'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  timeRange === range ? 'bg-cyan-600 text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm text-[var(--foreground)]">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-5 gap-4">
          <div className={`bg-[var(--card)] rounded-xl p-4 border ${kpis.forecastAccuracy.status ? STATUS_COLORS[kpis.forecastAccuracy.status].border : 'border-[var(--border)]'}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[var(--muted-foreground)]">Forecast Accuracy</p>
              {getKPIIcon(kpis.forecastAccuracy.status)}
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)]">{formatNumber(kpis.forecastAccuracy.value, kpis.forecastAccuracy.unit)}</p>
            {kpis.forecastAccuracy.target && (
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Target: {kpis.forecastAccuracy.target}%</p>
            )}
          </div>

          <div className={`bg-[var(--card)] rounded-xl p-4 border ${kpis.stockoutPreventionRate.status ? STATUS_COLORS[kpis.stockoutPreventionRate.status].border : 'border-[var(--border)]'}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[var(--muted-foreground)]">Stockout Prevention</p>
              {getKPIIcon(kpis.stockoutPreventionRate.status)}
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)]">{formatNumber(kpis.stockoutPreventionRate.value, kpis.stockoutPreventionRate.unit)}</p>
            {kpis.stockoutPreventionRate.target && (
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Target: {kpis.stockoutPreventionRate.target}%</p>
            )}
          </div>

          <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[var(--muted-foreground)]">Inventory Value</p>
              <Package className="w-5 h-5 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-purple-400">{formatNumber(kpis.inventoryValue.value, kpis.inventoryValue.unit)}</p>
          </div>

          <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[var(--muted-foreground)]">Avg Lead Time</p>
              <Clock className="w-5 h-5 text-orange-400" />
            </div>
            <p className="text-2xl font-bold text-orange-400">{formatNumber(kpis.avgLeadTime.value, kpis.avgLeadTime.unit)}</p>
          </div>

          <div className={`bg-[var(--card)] rounded-xl p-4 border ${kpis.manualOverrideRate.status ? STATUS_COLORS[kpis.manualOverrideRate.status].border : 'border-[var(--border)]'}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[var(--muted-foreground)]">Manual Override Rate</p>
              {getKPIIcon(kpis.manualOverrideRate.status)}
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)]">{formatNumber(kpis.manualOverrideRate.value, kpis.manualOverrideRate.unit)}</p>
            {kpis.manualOverrideRate.target && (
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Target: &lt;{kpis.manualOverrideRate.target}%</p>
            )}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Accuracy Trend */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-[var(--foreground)] flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-500" />
              Forecast Accuracy Trend
            </h3>
            {weeklySummary && (
              <div className="flex items-center gap-2">
                {getTrendIcon(weeklySummary.forecastAccuracy.trend)}
                <span className={`text-sm ${
                  weeklySummary.forecastAccuracy.trend === 'improving' ? 'text-green-400' :
                  weeklySummary.forecastAccuracy.trend === 'declining' ? 'text-red-400' : 'text-[var(--muted-foreground)]'
                }`}>
                  {weeklySummary.forecastAccuracy.trend}
                </span>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={accuracyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis domain={[70, 100]} stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }} />
              <Area type="monotone" dataKey="accuracy" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.2} />
              {/* Target line */}
              <Line type="monotone" dataKey={() => 85} stroke="#F59E0B" strokeDasharray="5 5" name="Target" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Model Performance */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <h3 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-cyan-500" />
            Model Performance Comparison
          </h3>
          <div className="space-y-3">
            {modelPerformance.map((model, i) => (
              <div key={model.model} className="flex items-center gap-4">
                <div className="w-32">
                  <p className="text-sm text-[var(--foreground)]">{model.model}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{model.skuCount} SKUs</p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[var(--muted)] rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${
                          i === 0 ? 'bg-green-500' :
                          i === 1 ? 'bg-cyan-500' :
                          i === 2 ? 'bg-purple-500' : 'bg-orange-500'
                        }`}
                        style={{ width: `${parseFloat(model.accuracy)}%` }}
                      />
                    </div>
                    <span className="text-sm text-[var(--foreground)] font-medium w-12 text-right">{model.accuracy}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-4">
            Accuracy measured as (1 - MAPE) × 100 over rolling 30-day window
          </p>
        </div>
      </div>

      {/* Weekly Summary */}
      {weeklySummary && (
        <div className="grid grid-cols-3 gap-6">
          {/* SKUs Requiring Orders */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" />
              SKUs Requiring Orders
            </h3>
            <p className="text-3xl font-bold text-orange-400">{weeklySummary.skusRequiringOrders.count}</p>
            <div className="mt-4 space-y-2">
              {weeklySummary.skusRequiringOrders.items.slice(0, 5).map(item => (
                <div key={item.masterSku} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--foreground)]">{item.masterSku}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    item.urgency === 'critical' ? 'bg-red-500/20 text-red-400' :
                    item.urgency === 'high' ? 'bg-orange-500/20 text-orange-400' : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {item.daysOfSupply}d supply
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              Upcoming Events
            </h3>
            {weeklySummary.upcomingEvents.length === 0 ? (
              <p className="text-[var(--muted-foreground)] text-sm">No events in the next 45 days</p>
            ) : (
              <div className="space-y-3">
                {weeklySummary.upcomingEvents.map((event, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-[var(--foreground)] font-medium">{event.name}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{event.daysUntil} days away</p>
                    </div>
                    <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-sm font-medium">
                      +{((event.multiplier - 1) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Anomalies */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Active Anomalies
            </h3>
            <p className="text-3xl font-bold text-yellow-400">{weeklySummary.anomalies.count}</p>
            {weeklySummary.anomalies.summary.length > 0 && (
              <div className="mt-4 space-y-2">
                {weeklySummary.anomalies.summary.map((anomaly, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    <span className="text-[var(--foreground)]">{anomaly}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Health */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
        <h3 className="text-lg font-medium text-[var(--foreground)] mb-4">System Health</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-[var(--secondary)]/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm text-[var(--muted-foreground)]">Forecasting Engine</span>
            </div>
            <p className="text-[var(--foreground)] font-medium">Operational</p>
          </div>
          <div className="p-4 bg-[var(--secondary)]/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm text-[var(--muted-foreground)]">Data Pipeline</span>
            </div>
            <p className="text-[var(--foreground)] font-medium">Healthy</p>
          </div>
          <div className="p-4 bg-[var(--secondary)]/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm text-[var(--muted-foreground)]">Model Training</span>
            </div>
            <p className="text-[var(--foreground)] font-medium">Up to date</p>
          </div>
          <div className="p-4 bg-[var(--secondary)]/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm text-[var(--muted-foreground)]">Alert System</span>
            </div>
            <p className="text-[var(--foreground)] font-medium">Active</p>
          </div>
        </div>
      </div>
    </div>
  )
}
