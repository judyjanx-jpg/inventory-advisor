'use client'

import React, { useState, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  Filter, Download, Plus, Package, EyeOff
} from 'lucide-react'
import {
  ForecastItem, Supplier, ForecastSettings, PurchasingSortColumn
} from '@/types/forecasting'

interface PurchasingTabProps {
  items: ForecastItem[]
  selectedSkus: Set<string>
  toggleSelection: (sku: string) => void
  selectAll: () => void
  createPurchaseOrder: () => void
  suppliers: Supplier[]
  selectedSupplier: number | 'all'
  setSelectedSupplier: (value: number | 'all') => void
  filter: 'all' | 'critical' | 'high' | 'medium'
  setFilter: (value: 'all' | 'critical' | 'high' | 'medium') => void
  sortBy: 'urgency' | 'daysOfSupply' | 'value'
  setSortBy: (value: 'urgency' | 'daysOfSupply' | 'value') => void
  settings: ForecastSettings
  applyRounding: (qty: number) => number
  getUrgencyColor: (urgency: string) => string
  formatCurrency: (value: number) => string
  formatPercent: (value: number) => string
  viewSkuTrend: (sku: string) => void
  onHideProduct: (sku: string) => void
}

export default function PurchasingTab({
  items, selectedSkus, toggleSelection, selectAll, createPurchaseOrder,
  suppliers, selectedSupplier, setSelectedSupplier, filter, setFilter,
  sortBy, setSortBy, settings, applyRounding, getUrgencyColor,
  formatCurrency, formatPercent, viewSkuTrend, onHideProduct,
}: PurchasingTabProps) {
  const [expandedSku, setExpandedSku] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<PurchasingSortColumn>('orderByDate')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const totalValue = items.reduce((sum: number, i: ForecastItem) =>
    sum + (applyRounding(i.recommendedOrderQty) * i.cost), 0)

  // Sort items based on current sort column and direction
  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a: ForecastItem, b: ForecastItem) => {
      let comparison = 0

      switch (sortColumn) {
        case 'sku':
          comparison = a.sku.localeCompare(b.sku)
          break
        case 'velocity':
          comparison = a.velocity30d - b.velocity30d
          break
        case 'daysOfStock':
          comparison = a.totalDaysOfSupply - b.totalDaysOfSupply
          break
        case 'incomingPO':
          comparison = (a.incomingFromPO || 0) - (b.incomingFromPO || 0)
          break
        case 'orderQty':
          comparison = a.recommendedOrderQty - b.recommendedOrderQty
          break
        case 'orderByDate':
          // Sort by daysToPurchase (null/undefined = no order needed = sort to end)
          const aDays = a.daysToPurchase ?? 9999
          const bDays = b.daysToPurchase ?? 9999
          comparison = aDays - bDays
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
    return sorted
  }, [items, sortColumn, sortDirection])

  const handleSort = (column: PurchasingSortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const SortHeader = ({ column, label, className = '' }: { column: PurchasingSortColumn; label: string; className?: string }) => (
    <th
      className={`px-2 py-2 cursor-pointer hover:bg-[var(--secondary)]/50 select-none transition-colors text-xs whitespace-nowrap ${className}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1 justify-center">
        <span>{label}</span>
        {sortColumn === column && (
          <span className="text-cyan-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  )

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--foreground)]"
          >
            <option value="all">All Suppliers</option>
            {suppliers.map((s: Supplier) => (
              <option key={s.id} value={s.id}>{s.name} ({s.productCount})</option>
            ))}
          </select>
        </div>

        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--foreground)]">
          <option value="all">All Urgency</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>

        <div className="flex-1" />

        {selectedSkus.size > 0 && (
          <button onClick={createPurchaseOrder} className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 rounded text-sm">
            <Plus className="w-4 h-4" />
            Create PO ({selectedSkus.size})
          </button>
        )}

        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card)] hover:bg-[var(--secondary)] rounded border border-[var(--border)] text-sm">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Table */}
      {sortedItems.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl p-8 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No items need purchasing right now</p>
        </div>
      ) : (
        <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] overflow-hidden">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-[var(--border)] text-gray-400 bg-[var(--background)]">
                <th className="w-10 px-3 py-2 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={selectedSkus.size === sortedItems.length && sortedItems.length > 0}
                    onChange={selectAll}
                    className="rounded bg-[var(--card)] border-[var(--border)]"
                  />
                </th>
                <SortHeader column="sku" label="SKU" className="text-left w-[22%]" />
                <SortHeader column="velocity" label="Vel." className="w-[12%]" />
                <SortHeader column="daysOfStock" label="Days" className="w-[10%]" />
                <SortHeader column="incomingPO" label="PO" className="w-[10%]" />
                <SortHeader column="orderQty" label="Order" className="w-[14%]" />
                <SortHeader column="orderByDate" label="Order By" className="w-[14%]" />
                <th className="w-[10%] px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedItems.map((item: ForecastItem) => {
                const orderQty = applyRounding(item.recommendedOrderQty)

                return (
                  <React.Fragment key={item.sku}>
                    <tr className={`border-b border-[var(--border)]/50 hover:bg-slate-750 transition-colors ${selectedSkus.has(item.sku) ? 'bg-cyan-900/10' : ''}`}>
                      <td className="w-10 px-3 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={selectedSkus.has(item.sku)}
                          onChange={() => toggleSelection(item.sku)}
                          className="rounded bg-[var(--background)] border-[var(--border)]"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div
                          className="cursor-pointer truncate"
                          onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}
                        >
                          <p className="font-medium text-[var(--foreground)] truncate">{item.sku}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {(item.displayName || item.title)?.substring(0, 30)}
                          </p>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className="text-[var(--foreground)]">{item.velocity30d.toFixed(1)}</span>
                        {item.velocityChange7d !== 0 && (
                          <span className={`ml-0.5 ${item.velocityChange7d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {item.velocityChange7d >= 0 ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`font-medium ${
                          item.totalDaysOfSupply < 30 ? 'text-red-400' :
                          item.totalDaysOfSupply < 60 ? 'text-orange-400' :
                          item.totalDaysOfSupply < 90 ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                          {Math.round(item.totalDaysOfSupply)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {item.incomingFromPO > 0 ? (
                          <span className="text-green-400">+{item.incomingFromPO}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {orderQty > 0 ? (
                          <div>
                            <span className="text-cyan-400 font-bold">{orderQty}</span>
                            <p className="text-xs text-gray-500">{formatCurrency(orderQty * item.cost)}</p>
                          </div>
                        ) : (
                          <span className="text-green-400">OK</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {item.purchaseByDate && orderQty > 0 ? (
                          <div>
                            <span className={`font-medium ${
                              (item.daysToPurchase || 0) <= 0 ? 'text-red-400' :
                              (item.daysToPurchase || 0) <= 7 ? 'text-orange-400' :
                              (item.daysToPurchase || 0) <= 14 ? 'text-yellow-400' : 'text-[var(--foreground)]'
                            }`}>
                              {new Date(item.purchaseByDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                            <p className="text-xs text-gray-500">
                              {(item.daysToPurchase || 0) <= 0 ? 'Now!' : `${item.daysToPurchase}d`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); onHideProduct(item.sku); }}
                            className="p-1 hover:bg-[var(--secondary)] rounded"
                            title="Hide from forecasting"
                          >
                            <EyeOff className="w-3.5 h-3.5 text-gray-500 hover:text-red-400" />
                          </button>
                          <button
                            onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}
                            className="p-1 hover:bg-[var(--secondary)] rounded"
                          >
                            {expandedSku === item.sku ?
                              <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> :
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            }
                          </button>
                        </div>
                      </td>
                    </tr>

                      {/* Expanded Details Row */}
                      {expandedSku === item.sku && (
                        <tr className="bg-[var(--background)]/50">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid grid-cols-5 gap-6">
                              <div>
                                <h4 className="text-sm font-medium text-gray-400 mb-2">Inventory Breakdown</h4>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between"><span className="text-gray-500">FBA</span><span className="text-[var(--foreground)]">{item.fbaAvailable || 0}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">FBA Inbound</span><span className="text-cyan-400">{item.fbaInbound || 0}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Warehouse</span><span className="text-[var(--foreground)]">{item.warehouseAvailable || 0}</span></div>
                                  <div className="flex justify-between border-t border-[var(--border)] pt-1"><span className="text-gray-400 font-medium">On Hand</span><span className="text-[var(--foreground)] font-medium">{item.currentInventory || 0}</span></div>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-sm font-medium text-gray-400 mb-2">Incoming POs</h4>
                                {item.incomingFromPO > 0 && item.incomingPODetails ? (
                                  <div className="space-y-1 text-sm">
                                    {item.incomingPODetails.map((po, idx) => (
                                      <div key={idx} className="flex justify-between">
                                        <span className="text-gray-500">{po.poNumber}</span>
                                        <span className="text-green-400">+{po.qty}</span>
                                      </div>
                                    ))}
                                    <div className="flex justify-between border-t border-[var(--border)] pt-1">
                                      <span className="text-gray-400 font-medium">Total PO</span>
                                      <span className="text-green-400 font-medium">+{item.incomingFromPO}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500">No pending POs</p>
                                )}
                              </div>

                              <div>
                                <h4 className="text-sm font-medium text-gray-400 mb-2">Supplier</h4>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="text-[var(--foreground)]">{item.supplierName || 'Not set'}</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Lead Time</span><span className="text-[var(--foreground)]">{item.leadTimeDays} days</span></div>
                                  <div className="flex justify-between"><span className="text-gray-500">Unit Cost</span><span className="text-[var(--foreground)]">{formatCurrency(item.cost)}</span></div>
                                  {item.moq && <div className="flex justify-between"><span className="text-gray-500">MOQ</span><span className="text-[var(--foreground)]">{item.moq}</span></div>}
                                </div>
                              </div>

                              <div>
                                <h4 className="text-sm font-medium text-gray-400 mb-2">Order Timeline</h4>
                                <div className="space-y-1 text-sm">
                                  {item.purchaseByDate ? (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-gray-500">Order By</span>
                                        <span className={`font-medium ${
                                          (item.daysToPurchase || 0) <= 0 ? 'text-red-400' :
                                          (item.daysToPurchase || 0) <= 7 ? 'text-orange-400' :
                                          (item.daysToPurchase || 0) <= 14 ? 'text-yellow-400' : 'text-[var(--foreground)]'
                                        }`}>
                                          {new Date(item.purchaseByDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-gray-500">Days Left</span>
                                        <span className="text-[var(--foreground)]">{item.daysToPurchase || 0}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-gray-500">No order needed</p>
                                  )}
                                  <div className="flex justify-between"><span className="text-gray-500">Reorder Point</span><span className="text-[var(--foreground)]">{item.reorderPoint}</span></div>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-sm font-medium text-gray-400 mb-2">Calculation</h4>
                                <div className="space-y-1 text-sm text-gray-300">
                                  <p>• {item.velocity30d.toFixed(1)}/day × 180d = {Math.round(item.velocity30d * 180)}</p>
                                  <p>• On hand: {item.currentInventory || 0}</p>
                                  {item.incomingFromPO > 0 && <p>• On PO: +{item.incomingFromPO}</p>}
                                  <p>• Gap: {Math.max(0, Math.round(item.velocity30d * 180) - item.totalInventory)}</p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>

          {/* Summary Footer */}
          <div className="px-3 py-2 bg-[var(--background)] border-t border-[var(--border)] flex items-center justify-between text-xs">
            <span className="text-gray-400">
              {sortedItems.length} items{selectedSkus.size > 0 && <span className="text-cyan-400 ml-2">({selectedSkus.size} selected)</span>}
            </span>
            <span className="text-gray-400">
              Total: <span className="text-[var(--foreground)] font-medium">{formatCurrency(sortedItems.reduce((sum: number, i: ForecastItem) => sum + (applyRounding(i.recommendedOrderQty) * i.cost), 0))}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
