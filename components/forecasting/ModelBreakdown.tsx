'use client'

import { useState, useEffect } from 'react'
import {
  Brain, TrendingUp, Activity, BarChart3, AlertTriangle,
  ChevronDown, ChevronUp, RefreshCw, Info, Zap
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts'

interface ModelForecast {
  model: string
  weight: number
  forecast: number
  confidence: number
  color: string
}

interface ForecastData {
  date: string
  finalForecast: number
  exponentialSmoothing: number
  prophet: number
  lstm: number
  arima: number
  actual?: number
}

interface ForecastDetails {
  masterSku: string
  forecasts: ForecastData[]
  modelWeights: ModelForecast[]
  summary: {
    avgDailyForecast: number
    totalForecast: number
    avgConfidence: number
    hasSeasonality: boolean
    isSpiking: boolean
    isNewItem: boolean
    urgency: string
  }
  seasonality: {
    hasSeasonality: boolean
    upcomingEvents: { name: string; daysUntil: number; multiplier: number }[]
  }
  spike: {
    isSpiking: boolean
    cause?: string
    magnitude?: number
  }
  newItem: {
    isNewItem: boolean
    analogSku?: string
    daysTracked?: number
  }
  safetyStock: {
    recommendedDays: number
    safetyStockUnits: number
    serviceLevel: number
  }
}

const MODEL_COLORS = {
  exponentialSmoothing: '#06B6D4',
  prophet: '#8B5CF6',
  lstm: '#F59E0B',
  arima: '#10B981',
  final: '#EC4899',
}

interface Props {
  selectedSku: string | null
  onSelectSku?: (sku: string) => void
}

export default function ModelBreakdown({ selectedSku, onSelectSku }: Props) {
  const [loading, setLoading] = useState(false)
  const [forecastData, setForecastData] = useState<ForecastDetails | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [skus, setSkus] = useState<{ sku: string; title: string }[]>([])

  useEffect(() => {
    fetchSkus()
  }, [])

  useEffect(() => {
    if (selectedSku) {
      fetchForecast(selectedSku)
    }
  }, [selectedSku])

  const fetchSkus = async () => {
    try {
      const response = await fetch('/api/products?limit=100')
      const data = await response.json()
      if (data.success) {
        setSkus(data.products.map((p: any) => ({ sku: p.masterSku, title: p.title })))
      }
    } catch (error) {
      console.error('Failed to fetch SKUs:', error)
    }
  }

  const fetchForecast = async (sku: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/forecasting/engine?action=forecast&sku=${sku}&days=30`)
      const data = await response.json()
      if (data.success) {
        // Transform the data for display
        const transformedData: ForecastDetails = {
          masterSku: sku,
          forecasts: data.data.forecasts.map((f: any) => ({
            date: new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            finalForecast: f.finalForecast,
            exponentialSmoothing: f.models?.exponentialSmoothing?.forecast || 0,
            prophet: f.models?.prophet?.forecast || 0,
            lstm: f.models?.lstm?.forecast || 0,
            arima: f.models?.arima?.forecast || 0,
          })),
          modelWeights: [
            { model: 'Exponential Smoothing', weight: data.data.modelWeights?.exponentialSmoothing || 0.25, forecast: 0, confidence: 0.8, color: MODEL_COLORS.exponentialSmoothing },
            { model: 'Prophet', weight: data.data.modelWeights?.prophet || 0.25, forecast: 0, confidence: 0.85, color: MODEL_COLORS.prophet },
            { model: 'LSTM', weight: data.data.modelWeights?.lstm || 0.25, forecast: 0, confidence: 0.75, color: MODEL_COLORS.lstm },
            { model: 'ARIMA', weight: data.data.modelWeights?.arima || 0.25, forecast: 0, confidence: 0.82, color: MODEL_COLORS.arima },
          ],
          summary: data.data.summary,
          seasonality: data.data.seasonality || { hasSeasonality: false, upcomingEvents: [] },
          spike: data.data.spike || { isSpiking: false },
          newItem: data.data.newItem || { isNewItem: false },
          safetyStock: data.data.safetyStock || { recommendedDays: 14, safetyStockUnits: 0, serviceLevel: 0.95 },
        }
        setForecastData(transformedData)
      }
    } catch (error) {
      console.error('Failed to fetch forecast:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatPercent = (value: number) => `${(value * 100).toFixed(0)}%`

  if (!selectedSku) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
        <Brain className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400 mb-4">Select a product to view forecast model breakdown</p>
        <select
          className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
          onChange={(e) => onSelectSku?.(e.target.value)}
          value=""
        >
          <option value="">Select a SKU...</option>
          {skus.map((s) => (
            <option key={s.sku} value={s.sku}>{s.sku} - {s.title?.substring(0, 40)}</option>
          ))}
        </select>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  if (!forecastData) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <p className="text-gray-400">No forecast data available for this SKU</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* SKU Selector */}
      <div className="flex items-center gap-4">
        <select
          className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white"
          value={selectedSku}
          onChange={(e) => onSelectSku?.(e.target.value)}
        >
          {skus.map((s) => (
            <option key={s.sku} value={s.sku}>{s.sku}</option>
          ))}
        </select>
        <button
          onClick={() => fetchForecast(selectedSku)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Avg Daily Forecast</p>
          <p className="text-2xl font-bold text-white mt-1">
            {forecastData.summary.avgDailyForecast.toFixed(1)}
          </p>
          <p className="text-xs text-gray-500">units/day</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">30-Day Total</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">
            {Math.round(forecastData.summary.totalForecast)}
          </p>
          <p className="text-xs text-gray-500">units</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Confidence</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {(forecastData.summary.avgConfidence * 100).toFixed(0)}%
          </p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Safety Stock</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">
            {forecastData.safetyStock.safetyStockUnits}
          </p>
          <p className="text-xs text-gray-500">{forecastData.safetyStock.recommendedDays} days</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-sm text-gray-400">Status</p>
          <div className="flex items-center gap-2 mt-1">
            {forecastData.summary.hasSeasonality && (
              <span className="px-2 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-xs">Seasonal</span>
            )}
            {forecastData.summary.isSpiking && (
              <span className="px-2 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded text-xs">Spiking</span>
            )}
            {forecastData.summary.isNewItem && (
              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded text-xs">New Item</span>
            )}
            {!forecastData.summary.hasSeasonality && !forecastData.summary.isSpiking && !forecastData.summary.isNewItem && (
              <span className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs">Normal</span>
            )}
          </div>
        </div>
      </div>

      {/* Model Weights Breakdown */}
      <div className="grid grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-cyan-500" />
            Model Weight Distribution
          </h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={forecastData.modelWeights}
                  dataKey="weight"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {forecastData.modelWeights.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value: number) => formatPercent(value)}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {forecastData.modelWeights.map((model) => (
                <div key={model.model} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: model.color }} />
                  <span className="text-sm text-gray-300">{model.model}</span>
                  <span className="text-sm text-white font-medium">{formatPercent(model.weight)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Weights are automatically optimized weekly based on each model's accuracy for this SKU
          </p>
        </div>

        {/* Why These Weights */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-cyan-500" />
            Why These Weights?
          </h3>
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-slate-900/50 rounded-lg">
              <p className="text-gray-300">
                <span className="text-cyan-400 font-medium">Exponential Smoothing</span> captures recent trends
                {forecastData.summary.isSpiking ? ' and is weighted higher due to detected spike' : ''}
              </p>
            </div>
            <div className="p-3 bg-slate-900/50 rounded-lg">
              <p className="text-gray-300">
                <span className="text-purple-400 font-medium">Prophet</span> handles seasonality
                {forecastData.summary.hasSeasonality ? ' and is weighted higher due to seasonal patterns' : ''}
              </p>
            </div>
            <div className="p-3 bg-slate-900/50 rounded-lg">
              <p className="text-gray-300">
                <span className="text-amber-400 font-medium">LSTM</span> recognizes complex patterns
                {forecastData.summary.isNewItem ? ' (limited data for new items)' : ''}
              </p>
            </div>
            <div className="p-3 bg-slate-900/50 rounded-lg">
              <p className="text-gray-300">
                <span className="text-emerald-400 font-medium">ARIMA</span> provides statistical baseline
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Forecast Chart with Model Breakdown */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-500" />
            30-Day Forecast with Model Contributions
          </h3>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
          >
            {showDetails ? 'Hide' : 'Show'} Individual Models
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={forecastData.forecasts}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
            <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
              formatter={(value: number, name: string) => [value.toFixed(1), name]}
            />
            <Legend />

            {showDetails && (
              <>
                <Area
                  type="monotone"
                  dataKey="exponentialSmoothing"
                  name="Exp Smoothing"
                  stroke={MODEL_COLORS.exponentialSmoothing}
                  fill={MODEL_COLORS.exponentialSmoothing}
                  fillOpacity={0.1}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <Area
                  type="monotone"
                  dataKey="prophet"
                  name="Prophet"
                  stroke={MODEL_COLORS.prophet}
                  fill={MODEL_COLORS.prophet}
                  fillOpacity={0.1}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <Area
                  type="monotone"
                  dataKey="lstm"
                  name="LSTM"
                  stroke={MODEL_COLORS.lstm}
                  fill={MODEL_COLORS.lstm}
                  fillOpacity={0.1}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <Area
                  type="monotone"
                  dataKey="arima"
                  name="ARIMA"
                  stroke={MODEL_COLORS.arima}
                  fill={MODEL_COLORS.arima}
                  fillOpacity={0.1}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              </>
            )}

            <Area
              type="monotone"
              dataKey="finalForecast"
              name="Final Forecast"
              stroke={MODEL_COLORS.final}
              fill={MODEL_COLORS.final}
              fillOpacity={0.3}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Additional Insights */}
      {(forecastData.seasonality.upcomingEvents.length > 0 || forecastData.spike.isSpiking || forecastData.newItem.isNewItem) && (
        <div className="grid grid-cols-3 gap-4">
          {/* Upcoming Events */}
          {forecastData.seasonality.upcomingEvents.length > 0 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <h4 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400" />
                Upcoming Events
              </h4>
              <div className="space-y-2">
                {forecastData.seasonality.upcomingEvents.slice(0, 3).map((event, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-white">{event.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{event.daysUntil}d</span>
                      <span className="text-cyan-400">+{((event.multiplier - 1) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spike Info */}
          {forecastData.spike.isSpiking && (
            <div className="bg-slate-800 rounded-xl border border-orange-500/30 p-4">
              <h4 className="text-sm font-medium text-orange-400 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Spike Detected
              </h4>
              <p className="text-sm text-gray-300">
                Cause: <span className="text-white">{forecastData.spike.cause || 'Unknown'}</span>
              </p>
              {forecastData.spike.magnitude && (
                <p className="text-sm text-gray-300 mt-1">
                  Magnitude: <span className="text-orange-400">+{(forecastData.spike.magnitude * 100).toFixed(0)}%</span>
                </p>
              )}
            </div>
          )}

          {/* New Item Info */}
          {forecastData.newItem.isNewItem && (
            <div className="bg-slate-800 rounded-xl border border-purple-500/30 p-4">
              <h4 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                New Item
              </h4>
              <p className="text-sm text-gray-300">
                Days tracked: <span className="text-white">{forecastData.newItem.daysTracked || 0}</span>
              </p>
              {forecastData.newItem.analogSku && (
                <p className="text-sm text-gray-300 mt-1">
                  Analog: <span className="text-purple-400">{forecastData.newItem.analogSku}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
