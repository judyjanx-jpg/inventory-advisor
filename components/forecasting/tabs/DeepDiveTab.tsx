'use client'

import React, { useState, useEffect } from 'react'
import {
  ChevronDown, ChevronUp, BarChart3, Calendar, Zap, AlertTriangle,
  Truck, Package, Brain, Calculator, RefreshCw, TrendingUp, Search
} from 'lucide-react'
import { ForecastItem, ForecastSettings, ManualSpike, DeepDiveSection } from '@/types/forecasting'
import SeasonalityManager from '../SeasonalityManager'
import SupplierScorecard from '../SupplierScorecard'
import ModelBreakdown from '../ModelBreakdown'
import StockoutsTab from './StockoutsTab'

interface DeepDiveSectionConfig {
  id: DeepDiveSection
  title: string
  icon: React.ReactNode
  color: string
}

const SECTIONS: DeepDiveSectionConfig[] = [
  { id: 'factors', title: 'What We\'re Considering', icon: <BarChart3 className="w-5 h-5" />, color: 'cyan' },
  { id: 'seasonality', title: 'Seasonality Manager', icon: <Calendar className="w-5 h-5" />, color: 'blue' },
  { id: 'manual-spikes', title: 'Manual Spikes', icon: <Zap className="w-5 h-5" />, color: 'purple' },
  { id: 'anomalies', title: 'Product Anomalies', icon: <AlertTriangle className="w-5 h-5" />, color: 'orange' },
  { id: 'lead-times', title: 'Lead Time Actuals', icon: <Truck className="w-5 h-5" />, color: 'amber' },
  { id: 'stockouts', title: 'Stockout Log', icon: <Package className="w-5 h-5" />, color: 'red' },
  { id: 'model-performance', title: 'Model Performance', icon: <Brain className="w-5 h-5" />, color: 'green' },
  { id: 'calculation', title: 'Calculation Breakdown', icon: <Calculator className="w-5 h-5" />, color: 'indigo' },
]

interface DeepDiveTabProps {
  items: ForecastItem[]
  settings: ForecastSettings
  onRefresh: () => void
}

export default function DeepDiveTab({ items, settings, onRefresh }: DeepDiveTabProps) {
  const [expandedSections, setExpandedSections] = useState<Set<DeepDiveSection>>(new Set(['factors']))
  const [manualSpikes, setManualSpikes] = useState<ManualSpike[]>([])
  const [selectedSkuForCalc, setSelectedSkuForCalc] = useState<string>('')
  const [skuSearch, setSkuSearch] = useState('')

  useEffect(() => {
    fetchManualSpikes()
  }, [])

  const fetchManualSpikes = async () => {
    try {
      const response = await fetch('/api/forecasting/manual-spikes')
      const data = await response.json()
      if (data.success) {
        setManualSpikes(data.spikes || [])
      }
    } catch (error) {
      console.error('Failed to fetch manual spikes:', error)
    }
  }

  const toggleSection = (sectionId: DeepDiveSection) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId)
    } else {
      newExpanded.add(sectionId)
    }
    setExpandedSections(newExpanded)
  }

  const getColorClass = (color: string, type: 'bg' | 'text' | 'border') => {
    const colors: Record<string, Record<string, string>> = {
      cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
      blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
      purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
      orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
      amber: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
      red: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
      green: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
      indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30' },
    }
    return colors[color]?.[type] || ''
  }

  // Calculate current factors summary
  const factorsSummary = {
    seasonality: items.filter(i => i.seasonalityFactor > 1.1).length,
    activeSpikes: manualSpikes.filter(s => s.status === 'active').length,
    scheduledSpikes: manualSpikes.filter(s => s.status === 'scheduled').length,
    yoyGrowth: 19, // Placeholder - would come from API
    avgLeadTime: items.length > 0 ? Math.round(items.reduce((sum, i) => sum + i.leadTimeDays, 0) / items.length) : 0,
    recentStockouts: 2, // Placeholder - would come from API
    modelAccuracy: 87, // Placeholder - would come from API
    lowConfidenceSkus: items.filter(i => i.confidence < 0.7).length,
  }

  // Product anomalies - items selling ±20% different than predicted
  const anomalies = items.filter(i => Math.abs(i.velocityChange7d) > 20).slice(0, 10)

  // Get selected item for calculation breakdown
  const selectedItemForCalc = items.find(i => i.sku === selectedSkuForCalc)

  // Filter items for calculation search
  const filteredItemsForCalc = skuSearch
    ? items.filter(i => i.sku.toLowerCase().includes(skuSearch.toLowerCase()))
    : items.slice(0, 20)

  return (
    <div className="space-y-4">
      {SECTIONS.map((section) => (
        <div
          key={section.id}
          className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden"
        >
          {/* Section Header */}
          <button
            onClick={() => toggleSection(section.id)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--secondary)]/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${getColorClass(section.color, 'bg')}`}>
                <span className={getColorClass(section.color, 'text')}>{section.icon}</span>
              </div>
              <span className="font-medium text-[var(--foreground)]">{section.title}</span>
            </div>
            {expandedSections.has(section.id) ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {/* Section Content */}
          {expandedSections.has(section.id) && (
            <div className="px-4 pb-4 border-t border-[var(--border)]">
              {/* What We're Considering */}
              {section.id === 'factors' && (
                <div className="pt-4">
                  <div className="font-mono text-sm space-y-4">
                    {/* Seasonality */}
                    <div>
                      <p className="text-gray-400 mb-2">Seasonality</p>
                      {factorsSummary.seasonality > 0 ? (
                        <p className="text-[var(--foreground)] pl-4">
                          {factorsSummary.seasonality} SKUs with active seasonal multipliers
                        </p>
                      ) : (
                        <p className="text-gray-500 pl-4">No active seasonal events</p>
                      )}
                    </div>

                    {/* Growth */}
                    <div>
                      <p className="text-gray-400 mb-2">Growth</p>
                      <p className="text-[var(--foreground)] pl-4">
                        Year-over-year: <span className="text-green-400">+{factorsSummary.yoyGrowth}%</span> (auto-calculated)
                      </p>
                    </div>

                    {/* Lead Times */}
                    <div>
                      <p className="text-gray-400 mb-2">Lead Times</p>
                      <p className="text-[var(--foreground)] pl-4">
                        Average supplier lead time: <span className="text-cyan-400">{factorsSummary.avgLeadTime} days</span>
                      </p>
                    </div>

                    {/* Active Spikes */}
                    <div>
                      <p className="text-gray-400 mb-2">Active Spikes</p>
                      {factorsSummary.activeSpikes > 0 || factorsSummary.scheduledSpikes > 0 ? (
                        <p className="text-[var(--foreground)] pl-4">
                          {factorsSummary.activeSpikes} active, {factorsSummary.scheduledSpikes} scheduled
                        </p>
                      ) : (
                        <p className="text-gray-500 pl-4">No manual spikes flagged</p>
                      )}
                    </div>

                    {/* Recent Stockouts */}
                    <div>
                      <p className="text-gray-400 mb-2">Recent Stockouts</p>
                      {factorsSummary.recentStockouts > 0 ? (
                        <p className="text-[var(--foreground)] pl-4">
                          <span className="text-orange-400">{factorsSummary.recentStockouts} events</span> last 30 days
                        </p>
                      ) : (
                        <p className="text-green-400 pl-4">No stockouts in last 30 days</p>
                      )}
                    </div>

                    {/* Model Confidence */}
                    <div>
                      <p className="text-gray-400 mb-2">Model Confidence</p>
                      <p className="text-[var(--foreground)] pl-4">
                        Overall: <span className="text-green-400">{factorsSummary.modelAccuracy}% accuracy</span>
                      </p>
                      {factorsSummary.lowConfidenceSkus > 0 && (
                        <p className="text-orange-400 pl-4 text-xs">
                          {factorsSummary.lowConfidenceSkus} SKUs flagged low confidence (new products)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Seasonality Manager */}
              {section.id === 'seasonality' && (
                <div className="pt-4">
                  <SeasonalityManager />
                </div>
              )}

              {/* Manual Spikes */}
              {section.id === 'manual-spikes' && (
                <div className="pt-4">
                  {manualSpikes.length === 0 ? (
                    <div className="text-center py-8">
                      <Zap className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">No manual spikes flagged</p>
                      <p className="text-gray-500 text-sm mt-2">
                        Use the Push Readiness tab to flag upcoming spikes
                      </p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-sm text-gray-400">
                          <th className="px-4 py-3 text-left">SKU</th>
                          <th className="px-4 py-3 text-center">Type</th>
                          <th className="px-4 py-3 text-center">Lift</th>
                          <th className="px-4 py-3 text-center">Dates</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {manualSpikes.map((spike) => (
                          <tr key={spike.id} className="border-b border-[var(--border)]/50">
                            <td className="px-4 py-3 text-[var(--foreground)]">{spike.masterSku}</td>
                            <td className="px-4 py-3 text-center capitalize text-[var(--foreground)]">{spike.spikeType}</td>
                            <td className="px-4 py-3 text-center text-cyan-400">+{((spike.liftMultiplier - 1) * 100).toFixed(0)}%</td>
                            <td className="px-4 py-3 text-center text-gray-400">
                              {new Date(spike.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(spike.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                spike.status === 'active' ? 'bg-green-500/20 text-green-400' :
                                spike.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-gray-500/20 text-gray-400'
                              }`}>
                                {spike.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Product Anomalies */}
              {section.id === 'anomalies' && (
                <div className="pt-4">
                  <p className="text-sm text-gray-400 mb-4">SKUs selling ±20% different than predicted:</p>
                  {anomalies.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">No significant anomalies detected</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-sm text-gray-400">
                          <th className="px-4 py-3 text-left">SKU</th>
                          <th className="px-4 py-3 text-center">Expected</th>
                          <th className="px-4 py-3 text-center">Actual</th>
                          <th className="px-4 py-3 text-center">Variance</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {anomalies.map((item) => {
                          const expected = item.velocity30d / (1 + item.velocityChange7d / 100)
                          return (
                            <tr key={item.sku} className="border-b border-[var(--border)]/50">
                              <td className="px-4 py-3 text-[var(--foreground)]">{item.sku}</td>
                              <td className="px-4 py-3 text-center text-gray-400">{expected.toFixed(1)}/day</td>
                              <td className="px-4 py-3 text-center text-[var(--foreground)]">{item.velocity7d.toFixed(1)}/day</td>
                              <td className="px-4 py-3 text-center">
                                <span className={item.velocityChange7d > 0 ? 'text-green-400' : 'text-red-400'}>
                                  {item.velocityChange7d > 0 ? '+' : ''}{item.velocityChange7d.toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Lead Time Actuals */}
              {section.id === 'lead-times' && (
                <div className="pt-4">
                  <SupplierScorecard />
                </div>
              )}

              {/* Stockout Log */}
              {section.id === 'stockouts' && (
                <div className="pt-4">
                  <StockoutsTab stockouts={[]} onRefresh={onRefresh} />
                </div>
              )}

              {/* Model Performance */}
              {section.id === 'model-performance' && (
                <div className="pt-4">
                  <ModelBreakdown />
                </div>
              )}

              {/* Calculation Breakdown */}
              {section.id === 'calculation' && (
                <div className="pt-4">
                  <p className="text-sm text-gray-400 mb-4">Click any SKU to see full calculation:</p>

                  <div className="mb-4">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search SKU..."
                        value={skuSearch}
                        onChange={(e) => setSkuSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* SKU List */}
                    <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] max-h-96 overflow-y-auto">
                      {filteredItemsForCalc.map((item) => (
                        <button
                          key={item.sku}
                          onClick={() => setSelectedSkuForCalc(item.sku)}
                          className={`w-full px-4 py-3 text-left border-b border-[var(--border)]/50 hover:bg-[var(--secondary)] transition-colors ${
                            selectedSkuForCalc === item.sku ? 'bg-cyan-900/20' : ''
                          }`}
                        >
                          <p className="font-medium text-[var(--foreground)]">{item.sku}</p>
                          <p className="text-xs text-gray-400 truncate">{item.velocity30d.toFixed(1)}/day</p>
                        </button>
                      ))}
                    </div>

                    {/* Calculation Details */}
                    <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] p-4">
                      {selectedItemForCalc ? (
                        <div className="font-mono text-sm space-y-3">
                          <h4 className="text-[var(--foreground)] font-bold mb-4">
                            {selectedItemForCalc.sku} - How we got {selectedItemForCalc.velocity30d.toFixed(1)} units/day
                          </h4>

                          <div className="border-b border-[var(--border)] pb-3">
                            <p className="text-gray-400">Baseline (same period last year):</p>
                            <p className="text-[var(--foreground)] pl-4">
                              {(selectedItemForCalc.velocity30d / (1 + factorsSummary.yoyGrowth / 100)).toFixed(1)}/day
                            </p>
                          </div>

                          <div className="border-b border-[var(--border)] pb-3">
                            <p className="text-gray-400">× YoY Growth (+{factorsSummary.yoyGrowth}%):</p>
                            <p className="text-[var(--foreground)] pl-4">
                              {((selectedItemForCalc.velocity30d / (1 + factorsSummary.yoyGrowth / 100)) * (1 + factorsSummary.yoyGrowth / 100)).toFixed(1)}/day
                            </p>
                          </div>

                          {selectedItemForCalc.seasonalityFactor !== 1 && (
                            <div className="border-b border-[var(--border)] pb-3">
                              <p className="text-gray-400">× Seasonal ({((selectedItemForCalc.seasonalityFactor - 1) * 100).toFixed(0)}%):</p>
                              <p className="text-[var(--foreground)] pl-4">
                                {(selectedItemForCalc.velocity30d * selectedItemForCalc.seasonalityFactor).toFixed(1)}/day
                              </p>
                            </div>
                          )}

                          <div className="border-b border-[var(--border)] pb-3">
                            <p className="text-gray-400">Reality Check (70/30 blend):</p>
                            <p className="text-[var(--foreground)] pl-4">
                              Forecast: {selectedItemForCalc.velocity30d.toFixed(1)}/day
                            </p>
                            <p className="text-[var(--foreground)] pl-4">
                              Actual 7-day: {selectedItemForCalc.velocity7d.toFixed(1)}/day
                            </p>
                          </div>

                          <div className="pt-2">
                            <p className="text-cyan-400 font-bold">
                              FINAL: {selectedItemForCalc.velocity30d.toFixed(1)}/day
                            </p>
                            <p className="text-sm mt-2">
                              Confidence: <span className={selectedItemForCalc.confidence >= 0.8 ? 'text-green-400' : selectedItemForCalc.confidence >= 0.6 ? 'text-yellow-400' : 'text-red-400'}>
                                {selectedItemForCalc.confidence >= 0.8 ? 'HIGH' : selectedItemForCalc.confidence >= 0.6 ? 'MEDIUM' : 'LOW'}
                              </span>
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-48 text-gray-500">
                          Select a SKU to view calculation
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
