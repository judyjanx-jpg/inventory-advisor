'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { RefreshCw, ChevronDown, Check, X, BarChart3 } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from 'recharts'
import { ForecastItem, TrendData, LINE_COLORS } from '@/types/forecasting'

interface TrendsTabProps {
  items: ForecastItem[]
  selectedSkus: string[]
  setSelectedSkus: (skus: string[]) => void
}

export default function TrendsTab({ items, selectedSkus, setSelectedSkus }: TrendsTabProps) {
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
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray-400">Select Products to Compare (max 10)</label>
          <div className="flex gap-2">
            <button
              onClick={selectTop10}
              className="px-3 py-1 text-xs bg-cyan-600 hover:bg-cyan-700 text-[var(--foreground)] rounded-lg transition-colors"
            >
              Top 10 Sellers
            </button>
            {selectedSkus.length > 0 && (
              <button
                onClick={clearSelection}
                className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 text-[var(--foreground)] rounded-lg transition-colors"
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
            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-left text-[var(--foreground)] flex items-center justify-between"
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
            <div className="absolute z-50 w-full mt-1 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl max-h-80 overflow-y-auto">
              {sortedItems.map((item, index) => {
                const isSelected = selectedSkus.includes(item.sku)
                const isDisabled = !isSelected && selectedSkus.length >= 10

                return (
                  <button
                    key={item.sku}
                    onClick={() => !isDisabled && toggleSku(item.sku)}
                    disabled={isDisabled}
                    className={`w-full px-3 py-2 text-left flex items-center gap-3 hover:bg-[var(--card)] transition-colors ${
                      isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                    } ${isSelected ? 'bg-[var(--card)]' : ''}`}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                      isSelected ? 'bg-cyan-600 border-cyan-600' : 'border-slate-600'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-[var(--foreground)]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--foreground)] font-medium">{item.sku}</span>
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
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-4">Sales Trend Comparison (Units/Month)</h3>

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
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-lg font-medium text-[var(--foreground)]">Velocity Comparison</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--background)]">
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
                    <tr key={item.sku} className="hover:bg-[var(--secondary)]/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: LINE_COLORS[index % LINE_COLORS.length] }} />
                          <span className="font-medium text-[var(--foreground)]">{item.sku}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--foreground)]">{item.velocity7d.toFixed(2)}/day</td>
                      <td className="px-4 py-3 text-right text-[var(--foreground)]">{item.velocity30d.toFixed(2)}/day</td>
                      <td className="px-4 py-3 text-right text-[var(--foreground)]">{item.velocity90d.toFixed(2)}/day</td>
                      <td className="px-4 py-3 text-right">
                        <span className={item.velocityChange7d >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {item.velocityChange7d >= 0 ? '+' : ''}{item.velocityChange7d?.toFixed(1) || 0}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--foreground)]">{Math.round(item.totalDaysOfSupply)} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedSkus.length === 0 && (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Select products above to compare trends</p>
          <button
            onClick={selectTop10}
            className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-[var(--foreground)] rounded-lg transition-colors"
          >
            Quick Start: Compare Top 10 Sellers
          </button>
        </div>
      )}
    </div>
  )
}
