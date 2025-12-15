'use client'

import { useState, useEffect } from 'react'
import {
  Truck, Award, Clock, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, RefreshCw, ChevronDown
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line
} from 'recharts'

interface SupplierScorecard {
  id: number
  name: string
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  metrics: {
    reliabilityScore: string
    onTimeRate: string
    avgLeadTime: string | number
    statedLeadTime: number
    leadTimeVariance: string
  }
  poCount: number
}

interface LeadTimeData {
  supplierId: number
  supplierName: string
  statedDays: number
  actualAvgDays: number
  percentile95Days: number
}

const GRADE_CONFIG = {
  A: { color: 'text-green-400', bgColor: 'bg-green-500/20', borderColor: 'border-green-500/30', label: 'Excellent' },
  B: { color: 'text-cyan-400', bgColor: 'bg-cyan-500/20', borderColor: 'border-cyan-500/30', label: 'Good' },
  C: { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', borderColor: 'border-yellow-500/30', label: 'Average' },
  D: { color: 'text-orange-400', bgColor: 'bg-orange-500/20', borderColor: 'border-orange-500/30', label: 'Below Average' },
  F: { color: 'text-red-400', bgColor: 'bg-red-500/20', borderColor: 'border-red-500/30', label: 'Poor' },
}

export default function SupplierScorecard() {
  const [scorecards, setScorecards] = useState<SupplierScorecard[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSupplier, setExpandedSupplier] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'grade' | 'leadTime' | 'onTime'>('grade')

  useEffect(() => {
    fetchScorecards()
  }, [])

  const fetchScorecards = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/forecasting/reports?action=supplier-scorecards')
      const data = await response.json()
      if (data.success) {
        setScorecards(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch scorecards:', error)
      // Mock data for demo
      setScorecards([
        {
          id: 1,
          name: 'ABC Manufacturing',
          grade: 'A',
          metrics: {
            reliabilityScore: '95',
            onTimeRate: '98',
            avgLeadTime: '28',
            statedLeadTime: 30,
            leadTimeVariance: '2.1',
          },
          poCount: 45,
        },
        {
          id: 2,
          name: 'XYZ Suppliers',
          grade: 'B',
          metrics: {
            reliabilityScore: '82',
            onTimeRate: '85',
            avgLeadTime: '35',
            statedLeadTime: 30,
            leadTimeVariance: '5.3',
          },
          poCount: 32,
        },
        {
          id: 3,
          name: 'Global Trade Co',
          grade: 'C',
          metrics: {
            reliabilityScore: '71',
            onTimeRate: '72',
            avgLeadTime: '42',
            statedLeadTime: 35,
            leadTimeVariance: '8.5',
          },
          poCount: 28,
        },
        {
          id: 4,
          name: 'Quick Ship Inc',
          grade: 'D',
          metrics: {
            reliabilityScore: '62',
            onTimeRate: '58',
            avgLeadTime: '52',
            statedLeadTime: 40,
            leadTimeVariance: '12.2',
          },
          poCount: 15,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const sortedScorecards = [...scorecards].sort((a, b) => {
    if (sortBy === 'grade') {
      const gradeOrder = { A: 1, B: 2, C: 3, D: 4, F: 5 }
      return gradeOrder[a.grade] - gradeOrder[b.grade]
    }
    if (sortBy === 'leadTime') {
      return Number(a.metrics.avgLeadTime) - Number(b.metrics.avgLeadTime)
    }
    if (sortBy === 'onTime') {
      return Number(b.metrics.onTimeRate) - Number(a.metrics.onTimeRate)
    }
    return 0
  })

  // Chart data for lead time comparison
  const leadTimeChartData = scorecards.map(s => ({
    name: s.name.substring(0, 15),
    stated: s.metrics.statedLeadTime,
    actual: Number(s.metrics.avgLeadTime),
  }))

  // Summary stats
  const avgReliability = scorecards.length > 0
    ? (scorecards.reduce((sum, s) => sum + Number(s.metrics.reliabilityScore), 0) / scorecards.length).toFixed(0)
    : 0
  const avgOnTime = scorecards.length > 0
    ? (scorecards.reduce((sum, s) => sum + Number(s.metrics.onTimeRate === 'N/A' ? 0 : s.metrics.onTimeRate), 0) / scorecards.length).toFixed(0)
    : 0
  const suppliersWithIssues = scorecards.filter(s => s.grade === 'D' || s.grade === 'F').length

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
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Total Suppliers</p>
            <Truck className="w-5 h-5 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-1">{scorecards.length}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Avg Reliability</p>
            <Award className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-2xl font-bold text-green-400 mt-1">{avgReliability}%</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Avg On-Time Rate</p>
            <Clock className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-purple-400 mt-1">{avgOnTime}%</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Suppliers with Issues</p>
            <AlertTriangle className="w-5 h-5 text-orange-400" />
          </div>
          <p className="text-2xl font-bold text-orange-400 mt-1">{suppliersWithIssues}</p>
        </div>
      </div>

      {/* Lead Time Comparison Chart */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-medium text-white mb-4">Lead Time: Stated vs Actual</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={leadTimeChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
            <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} label={{ value: 'Days', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }} />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }} />
            <Legend />
            <Bar dataKey="stated" name="Stated Lead Time" fill="#6366F1" />
            <Bar dataKey="actual" name="Actual Lead Time" fill="#F59E0B" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400">Sort by:</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="grade">Grade</option>
          <option value="leadTime">Lead Time (fastest)</option>
          <option value="onTime">On-Time Rate (highest)</option>
        </select>
        <button
          onClick={fetchScorecards}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-gray-400 hover:text-white ml-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Scorecards List */}
      <div className="space-y-3">
        {sortedScorecards.map(supplier => {
          const gradeConfig = GRADE_CONFIG[supplier.grade]
          const leadTimeDiff = Number(supplier.metrics.avgLeadTime) - supplier.metrics.statedLeadTime
          const isExpanded = expandedSupplier === supplier.id

          return (
            <div
              key={supplier.id}
              className={`bg-slate-800 rounded-xl border transition-all ${
                isExpanded ? 'border-cyan-500/50' : 'border-slate-700'
              }`}
            >
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedSupplier(isExpanded ? null : supplier.id)}
              >
                <div className="flex items-center gap-4">
                  {/* Grade Badge */}
                  <div className={`w-16 h-16 rounded-xl ${gradeConfig.bgColor} ${gradeConfig.borderColor} border flex flex-col items-center justify-center`}>
                    <span className={`text-2xl font-bold ${gradeConfig.color}`}>{supplier.grade}</span>
                    <span className="text-xs text-gray-400">{gradeConfig.label}</span>
                  </div>

                  {/* Supplier Info */}
                  <div className="flex-1">
                    <h4 className="font-medium text-white">{supplier.name}</h4>
                    <p className="text-sm text-gray-400">{supplier.poCount} POs tracked</p>
                  </div>

                  {/* Key Metrics */}
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase">Reliability</p>
                      <p className={`text-lg font-bold ${Number(supplier.metrics.reliabilityScore) >= 80 ? 'text-green-400' : Number(supplier.metrics.reliabilityScore) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {supplier.metrics.reliabilityScore}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase">On-Time</p>
                      <p className={`text-lg font-bold ${Number(supplier.metrics.onTimeRate) >= 90 ? 'text-green-400' : Number(supplier.metrics.onTimeRate) >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {supplier.metrics.onTimeRate}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase">Avg Lead Time</p>
                      <div className="flex items-center gap-1 justify-center">
                        <p className="text-lg font-bold text-white">{supplier.metrics.avgLeadTime}d</p>
                        {leadTimeDiff > 0 ? (
                          <span className="text-xs text-red-400 flex items-center">
                            <TrendingUp className="w-3 h-3" />+{leadTimeDiff}d
                          </span>
                        ) : leadTimeDiff < 0 ? (
                          <span className="text-xs text-green-400 flex items-center">
                            <TrendingDown className="w-3 h-3" />{leadTimeDiff}d
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-slate-700">
                  <div className="grid grid-cols-4 gap-6">
                    <div>
                      <h5 className="text-sm font-medium text-gray-400 mb-3">Lead Time Metrics</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Stated</span>
                          <span className="text-white">{supplier.metrics.statedLeadTime} days</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Actual Avg</span>
                          <span className="text-white">{supplier.metrics.avgLeadTime} days</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Variance</span>
                          <span className={`${Number(supplier.metrics.leadTimeVariance) > 5 ? 'text-red-400' : 'text-green-400'}`}>
                            {supplier.metrics.leadTimeVariance === 'N/A' ? 'N/A' : `${supplier.metrics.leadTimeVariance} days`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-sm font-medium text-gray-400 mb-3">Performance</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Reliability Score</span>
                          <span className="text-white">{supplier.metrics.reliabilityScore}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">On-Time Rate</span>
                          <span className="text-white">{supplier.metrics.onTimeRate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total POs</span>
                          <span className="text-white">{supplier.poCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <h5 className="text-sm font-medium text-gray-400 mb-3">Recommendations</h5>
                      <div className="space-y-2">
                        {supplier.grade === 'A' && (
                          <div className="flex items-start gap-2 text-sm">
                            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                            <span className="text-gray-300">Excellent supplier. Consider increasing order volume.</span>
                          </div>
                        )}
                        {supplier.grade === 'B' && (
                          <div className="flex items-start gap-2 text-sm">
                            <CheckCircle className="w-4 h-4 text-cyan-400 mt-0.5" />
                            <span className="text-gray-300">Good performance. Monitor for potential improvements.</span>
                          </div>
                        )}
                        {supplier.grade === 'C' && (
                          <div className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
                            <span className="text-gray-300">Average performance. Add buffer to stated lead times.</span>
                          </div>
                        )}
                        {(supplier.grade === 'D' || supplier.grade === 'F') && (
                          <>
                            <div className="flex items-start gap-2 text-sm">
                              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
                              <span className="text-gray-300">Consider using 95th percentile lead time for ordering.</span>
                            </div>
                            <div className="flex items-start gap-2 text-sm">
                              <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5" />
                              <span className="text-gray-300">Evaluate alternative suppliers or increase safety stock.</span>
                            </div>
                          </>
                        )}
                        {leadTimeDiff > 5 && (
                          <div className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5" />
                            <span className="text-gray-300">Actual lead time significantly exceeds stated. System will use actual data.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {scorecards.length === 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
          <Truck className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No supplier data available yet</p>
          <p className="text-sm text-gray-500 mt-2">Supplier performance is tracked automatically as POs are fulfilled</p>
        </div>
      )}
    </div>
  )
}
