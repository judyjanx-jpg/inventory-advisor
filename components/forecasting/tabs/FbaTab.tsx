'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Truck, ChevronDown, Filter, RefreshCw, EyeOff
} from 'lucide-react'
import {
  ForecastItem, ForecastSettings, IncomingPO, FbaShipmentItemExtended, FbaSortColumn
} from '@/types/forecasting'

interface FbaTabProps {
  items: ForecastItem[]
  settings: ForecastSettings
  setSettings: (s: ForecastSettings) => void
  getUrgencyColor: (urgency: string) => string
  onHideProduct: (sku: string) => void
}

export default function FbaTab({ items, settings, setSettings, getUrgencyColor, onHideProduct }: FbaTabProps) {
  const router = useRouter()
  const [shipmentItems, setShipmentItems] = useState<FbaShipmentItemExtended[]>([])
  const [incomingData, setIncomingData] = useState<Record<string, { totalQuantity: number; items: IncomingPO[] }>>({})
  const [roundFbaTo5, setRoundFbaTo5] = useState(true)
  const [isCreatingShipment, setIsCreatingShipment] = useState(false)
  const hasAutoSelectedRef = useRef(false)

  // Sorting state
  const [sortColumn, setSortColumn] = useState<FbaSortColumn>('status')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'all' | 'outOfStock' | 'critical' | 'warning' | 'ok'>('all')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)

  // Fetch incoming PO data
  useEffect(() => {
    const fetchIncoming = async () => {
      try {
        const response = await fetch('/api/purchase-orders/incoming')
        const data = await response.json()
        if (data.success) {
          setIncomingData(data.incoming || {})
        }
      } catch (error) {
        console.error('Failed to fetch incoming POs:', error)
      }
    }
    fetchIncoming()
  }, [])

  // Smart rounding to 5s:
  // - Round UP if we have enough stock to cover it
  // - Round DOWN if we don't have enough stock
  const roundTo5 = (needed: number, available: number): number => {
    if (!roundFbaTo5) return Math.min(needed, available)

    const roundedUp = Math.ceil(needed / 5) * 5
    const roundedDown = Math.floor(needed / 5) * 5

    // If we have enough stock to cover rounding up, round up
    if (available >= roundedUp) {
      return roundedUp
    }
    // Otherwise round down what we can send
    return Math.floor(Math.min(needed, available) / 5) * 5
  }

  // Calculate ship by date based on days of supply (including inbound)
  const getShipByDate = (daysOfSupply: number, fbaTotal: number): { date: Date; label: string; urgency: 'critical' | 'urgent' | 'soon' | 'normal' } => {
    const today = new Date()

    if (fbaTotal === 0) {
      return { date: today, label: 'Today', urgency: 'critical' }
    }
    if (daysOfSupply < 3) {
      return { date: today, label: 'Today', urgency: 'critical' }
    }
    if (daysOfSupply < 7) {
      const date = new Date(today)
      date.setDate(date.getDate() + 1)
      return { date, label: 'Tomorrow', urgency: 'urgent' }
    }
    if (daysOfSupply < 14) {
      const date = new Date(today)
      date.setDate(date.getDate() + 3)
      return { date, label: 'In 3 days', urgency: 'soon' }
    }
    if (daysOfSupply < 21) {
      const date = new Date(today)
      date.setDate(date.getDate() + 7)
      return { date, label: 'This week', urgency: 'soon' }
    }
    const date = new Date(today)
    date.setDate(date.getDate() + 14)
    return { date, label: 'In 2 weeks', urgency: 'normal' }
  }

  // Get status category for filtering (including inbound)
  const getStatusCategory = (daysOfSupply: number, fbaTotal: number): 'outOfStock' | 'critical' | 'warning' | 'ok' => {
    if (fbaTotal === 0) return 'outOfStock'
    if (daysOfSupply < 7) return 'critical'
    if (daysOfSupply < 14) return 'warning'
    return 'ok'
  }

  // Get status label for display (based on total FBA + inbound days of supply)
  const getStatusDisplay = (fbaAvailable: number, fbaInbound: number, daysOfSupply: number): { label: string; color: string } => {
    const fbaTotal = fbaAvailable + fbaInbound

    if (fbaTotal === 0) {
      return { label: 'NO STOCK', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    }
    if (daysOfSupply < 7) {
      return { label: `${Math.round(daysOfSupply)}d left`, color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    }
    if (daysOfSupply < 14) {
      return { label: `${Math.round(daysOfSupply)}d left`, color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' }
    }
    if (daysOfSupply < 30) {
      return { label: `${Math.round(daysOfSupply)}d left`, color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
    }
    return { label: `${Math.round(daysOfSupply)}d left`, color: 'bg-green-500/20 text-green-400 border-green-500/30' }
  }

  useEffect(() => {
    const fbaItems = items
      .filter(item => item.fbaDaysOfSupply < settings.fbaTargetDays + 10 && item.warehouseAvailable > 0)
      .map(item => {
        const idealFbaStock = Math.ceil(settings.fbaTargetDays * item.velocity30d)
        const currentFbaTotal = item.fbaAvailable + item.fbaInbound
        const replenishmentNeeded = Math.max(0, idealFbaStock - currentFbaTotal)

        // Calculate days of supply including inbound
        const totalDaysOfSupply = item.velocity30d > 0
          ? currentFbaTotal / item.velocity30d
          : 999

        // Use smart rounding for sendQty
        const sendQty = roundTo5(replenishmentNeeded, item.warehouseAvailable)
        const shipBy = getShipByDate(totalDaysOfSupply, currentFbaTotal)
        const statusCategory = getStatusCategory(totalDaysOfSupply, currentFbaTotal)
        const statusDisplay = getStatusDisplay(item.fbaAvailable, item.fbaInbound, totalDaysOfSupply)

        // Get incoming data for this SKU
        const skuIncoming = incomingData[item.sku]
        const incomingItems: IncomingPO[] = skuIncoming?.items || []

        return {
          ...item,
          replenishmentNeeded,
          sendQty: sendQty,
          selected: false,
          incoming: incomingItems,
          shipBy,
          statusCategory,
          statusDisplay,
          totalDaysOfSupply,
        }
      })

    setShipmentItems(fbaItems)
  }, [items, settings.fbaTargetDays, roundFbaTo5, incomingData])

  // Auto-select on initial load - separate effect
  useEffect(() => {
    if (hasAutoSelectedRef.current || shipmentItems.length === 0) return

    // Sort by urgency (most urgent first) for auto-selection
    const sortedForSelection = [...shipmentItems].sort((a, b) => {
      const statusOrder = { outOfStock: 0, critical: 1, warning: 2, ok: 3 }
      const statusDiff = statusOrder[a.statusCategory] - statusOrder[b.statusCategory]
      if (statusDiff !== 0) return statusDiff
      return a.totalDaysOfSupply - b.totalDaysOfSupply
    })

    // Auto-select items to fill capacity, skipping items with 0 sendQty
    let capacityRemaining = settings.fbaCapacity
    const selectedSkus = new Set<string>()

    for (const item of sortedForSelection) {
      if (item.sendQty === 0) continue // Skip items with no qty to send
      if (item.sendQty <= capacityRemaining) {
        selectedSkus.add(item.sku)
        capacityRemaining -= item.sendQty
      }
      if (capacityRemaining <= 0) break
    }

    setShipmentItems(prev => prev.map(item => ({
      ...item,
      selected: selectedSkus.has(item.sku)
    })))
    hasAutoSelectedRef.current = true
  }, [shipmentItems.length, settings.fbaCapacity])

  // Sort and filter items
  const sortedAndFilteredItems = useMemo(() => {
    let filtered = [...shipmentItems]

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.statusCategory === statusFilter)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0

      switch (sortColumn) {
        case 'sku':
          comparison = a.sku.localeCompare(b.sku)
          break
        case 'status':
          const statusOrder = { outOfStock: 0, critical: 1, warning: 2, ok: 3 }
          comparison = statusOrder[a.statusCategory] - statusOrder[b.statusCategory]
          if (comparison === 0) comparison = a.totalDaysOfSupply - b.totalDaysOfSupply
          break
        case 'velocity':
          comparison = a.velocity30d - b.velocity30d
          break
        case 'fba':
          comparison = a.fbaAvailable - b.fbaAvailable
          break
        case 'inbound':
          comparison = a.fbaInbound - b.fbaInbound
          break
        case 'replenishment':
          comparison = a.replenishmentNeeded - b.replenishmentNeeded
          break
        case 'whAvail':
          comparison = a.warehouseAvailable - b.warehouseAvailable
          break
        case 'shipBy':
          comparison = a.shipBy.date.getTime() - b.shipBy.date.getTime()
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [shipmentItems, sortColumn, sortDirection, statusFilter])

  const handleSort = (column: FbaSortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection(column === 'sku' ? 'asc' : 'desc')
    }
  }

  const SortHeader = ({ column, label, className = '' }: { column: FbaSortColumn; label: string; className?: string }) => (
    <th
      className={`p-3 cursor-pointer hover:bg-[var(--secondary)]/50 select-none ${className}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center justify-center gap-1">
        <span>{label}</span>
        {sortColumn === column && (
          <span className="text-cyan-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  )

  const selectedItems = shipmentItems.filter(i => i.selected)
  const totalSelectedUnits = selectedItems.reduce((sum, i) => sum + i.sendQty, 0)
  const capacityUsed = (totalSelectedUnits / settings.fbaCapacity) * 100

  const toggleSelect = (sku: string) => {
    setShipmentItems(prev => prev.map(item => item.sku === sku ? { ...item, selected: !item.selected } : item))
  }

  const toggleSelectAll = () => {
    const allSelected = sortedAndFilteredItems.every(i => i.selected)
    const filteredSkus = new Set(sortedAndFilteredItems.map(i => i.sku))
    setShipmentItems(prev => prev.map(item =>
      filteredSkus.has(item.sku) ? { ...item, selected: !allSelected } : item
    ))
  }

  // Track which SKU is being edited (to allow free typing)
  const [editingQty, setEditingQty] = useState<{ sku: string; value: string } | null>(null)

  const updateQty = (sku: string, qty: number) => {
    setShipmentItems(prev => prev.map(item => {
      if (item.sku !== sku) return item
      // Use smart rounding when manually adjusting
      const newQty = roundTo5(qty, item.warehouseAvailable)
      return { ...item, sendQty: newQty }
    }))
  }

  const handleQtyChange = (sku: string, value: string) => {
    // Allow free typing without rounding
    setEditingQty({ sku, value })
  }

  const handleQtyBlur = (sku: string) => {
    if (editingQty && editingQty.sku === sku) {
      const qty = parseInt(editingQty.value) || 0
      updateQty(sku, qty)
      setEditingQty(null)
    }
  }

  const handleQtyKeyDown = (e: React.KeyboardEvent, sku: string) => {
    if (e.key === 'Enter') {
      handleQtyBlur(sku)
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setEditingQty(null)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const createFbaShipment = async () => {
    const itemsToShip = selectedItems.filter(i => i.sendQty > 0)
    if (itemsToShip.length === 0) return

    setIsCreatingShipment(true)
    try {
      const response = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: 'fba_us',
          items: itemsToShip.map(i => ({
            sku: i.sku,
            productName: i.title,
            requestedQty: i.sendQty,
            adjustedQty: i.sendQty,
          })),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        // Navigate to the shipment page
        if (data.shipment?.id) {
          router.push(`/shipments/${data.shipment.id}`)
        } else if (data.id) {
          router.push(`/shipments/${data.id}`)
        } else {
          // Fallback to shipments list
          router.push('/shipments')
        }
      } else {
        const error = await response.json()
        alert(`Failed to create shipment: ${error.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to create shipment:', error)
      alert('Failed to create shipment. Please try again.')
    } finally {
      setIsCreatingShipment(false)
    }
  }

  // Format incoming PO data with days until/overdue
  const formatIncoming = (incoming?: IncomingPO[]) => {
    if (!incoming || incoming.length === 0) return null

    // Return formatted data for display
    return {
      items: incoming,
      totalQty: incoming.reduce((sum, po) => sum + po.quantity, 0),
    }
  }

  // Render incoming PO cell with proper formatting
  const renderIncomingCell = (incoming?: IncomingPO[]) => {
    const data = formatIncoming(incoming)
    if (!data) {
      return <span className="text-gray-600">—</span>
    }

    return (
      <div className="text-xs space-y-0.5">
        {data.items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1 justify-center">
            <span className="text-cyan-400 font-medium">{item.quantity}</span>
            {item.daysUntil !== null ? (
              item.daysUntil < 0 ? (
                // Overdue - show in red
                <span className="text-red-400">{Math.abs(item.daysUntil)}d overdue</span>
              ) : item.daysUntil === 0 ? (
                // Arriving today
                <span className="text-green-400">today</span>
              ) : (
                // Coming soon
                <span className="text-[var(--muted-foreground)]">in {item.daysUntil}d</span>
              )
            ) : (
              // No date set - show date if available
              item.expectedDate ? (
                <span className="text-[var(--muted-foreground)]">
                  {new Date(item.expectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              ) : (
                <span className="text-[var(--muted-foreground)]">(no ETA)</span>
              )
            )}
          </div>
        ))}
      </div>
    )
  }

  const getShipByBadge = (shipBy: { label: string; urgency: string }) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-500/20 text-red-400 border-red-500/30',
      urgent: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      soon: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      normal: 'bg-green-500/20 text-green-400 border-green-500/30',
    }
    return (
      <span className={`inline-flex items-center justify-center min-w-[5rem] px-2 py-1 rounded text-xs font-medium border ${colors[shipBy.urgency]}`}>
        {shipBy.label}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Capacity Bar & Controls */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Daily Capacity:</label>
            <input
              type="number"
              value={settings.fbaCapacity}
              onChange={(e) => setSettings({ ...settings, fbaCapacity: parseInt(e.target.value) || 0 })}
              className="w-24 bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-[var(--foreground)]"
            />
            <span className="text-gray-400">units</span>
          </div>

          <div className="flex-1 min-w-48">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[var(--secondary)] rounded-full h-3">
                {selectedItems.length > 0 && (
                  <div
                    className={`h-3 rounded-full transition-all ${capacityUsed > 100 ? 'bg-red-500' : capacityUsed > 80 ? 'bg-orange-500' : 'bg-purple-500'}`}
                    style={{ width: `${Math.min(100, capacityUsed)}%` }}
                  />
                )}
              </div>
              <span className={`text-sm font-medium ${capacityUsed > 100 ? 'text-red-400' : 'text-[var(--foreground)]'}`}>
                {totalSelectedUnits} / {settings.fbaCapacity}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="roundFbaTo5"
              checked={roundFbaTo5}
              onChange={(e) => setRoundFbaTo5(e.target.checked)}
              className="rounded bg-[var(--background)] border-[var(--border)]"
            />
            <label htmlFor="roundFbaTo5" className="text-sm text-gray-300">Round to 5s</label>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)] hover:bg-[var(--card)]"
            >
              <Filter className="w-4 h-4" />
              {statusFilter === 'all' ? 'All Status' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
              <ChevronDown className="w-4 h-4" />
            </button>

            {showFilterDropdown && (
              <div className="absolute z-10 mt-1 w-40 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl">
                {['all', 'outOfStock', 'critical', 'warning', 'ok'].map((status) => (
                  <button
                    key={status}
                    onClick={() => { setStatusFilter(status as typeof statusFilter); setShowFilterDropdown(false) }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--card)] ${statusFilter === status ? 'text-cyan-400' : 'text-[var(--foreground)]'}`}
                  >
                    {status === 'all' ? 'All Status' : status === 'outOfStock' ? 'Out of Stock' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={createFbaShipment}
            disabled={selectedItems.length === 0 || isCreatingShipment}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-[var(--foreground)]"
          >
            {isCreatingShipment ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Truck className="w-4 h-4" />
            )}
            Create Shipment ({selectedItems.length})
          </button>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4 mt-3 pt-3 border-t border-[var(--border)]">
          <div className="text-sm">
            <span className="text-gray-400">Selected:</span>
            <span className="ml-1 text-[var(--foreground)] font-medium">{selectedItems.length} items</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-400">Total Units:</span>
            <span className="ml-1 text-purple-400 font-medium">{totalSelectedUnits.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {sortedAndFilteredItems.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl p-8 text-center">
          <Truck className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">
            {shipmentItems.length === 0 ? 'No FBA replenishment needed right now' : 'No items match your filter'}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-sm text-gray-400">
                  <th className="p-3 w-10 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={sortedAndFilteredItems.length > 0 && sortedAndFilteredItems.every(i => i.selected)}
                      onChange={toggleSelectAll}
                      className="rounded bg-[var(--background)] border-[var(--border)]"
                    />
                  </th>
                  <SortHeader column="sku" label="SKU" className="text-left" />
                  <SortHeader column="status" label="Status" />
                  <SortHeader column="shipBy" label="Ship By" />
                  <SortHeader column="velocity" label="Velocity" />
                  <SortHeader column="fba" label="FBA" />
                  <SortHeader column="inbound" label="Inbound" />
                  <SortHeader column="replenishment" label="Replenishment" />
                  <SortHeader column="whAvail" label="WH Avail" />
                  <th className="p-3 text-center">Incoming PO</th>
                  <th className="p-3 text-center w-32">Send Qty</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredItems.map((item) => {
                  // Show what we can actually send with smart rounding
                  const smartRounded = roundTo5(item.replenishmentNeeded, item.warehouseAvailable)
                  const cantFulfill = item.replenishmentNeeded > item.warehouseAvailable

                  return (
                    <tr key={item.sku} className={`border-b border-[var(--border)]/50 hover:bg-slate-750 ${item.selected ? 'bg-purple-900/10' : ''}`}>
                      <td className="p-3 w-10 text-center align-middle">
                        <input type="checkbox" checked={item.selected} onChange={() => toggleSelect(item.sku)} className="rounded bg-[var(--background)] border-[var(--border)]" />
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-[var(--foreground)]">{item.sku}</p>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[5.5rem] px-2 py-1 rounded text-xs font-medium border ${item.statusDisplay.color}`}>
                          {item.statusDisplay.label}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {getShipByBadge(item.shipBy)}
                      </td>
                      <td className="p-3 text-center text-[var(--foreground)]">{item.velocity30d.toFixed(1)}/day</td>
                      <td className="p-3 text-center text-[var(--foreground)]">{item.fbaAvailable}</td>
                      <td className="p-3 text-center text-cyan-400">{item.fbaInbound || 0}</td>
                      <td className="p-3 text-center">
                        <span className={`font-medium ${cantFulfill ? 'text-orange-400' : 'text-cyan-400'}`}>
                          {item.replenishmentNeeded}
                        </span>
                        {cantFulfill && (
                          <p className="text-xs text-orange-400">Need more</p>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[var(--foreground)]">{item.warehouseAvailable}</span>
                      </td>
                      <td className="p-3 text-center">
                        {renderIncomingCell(item.incoming)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            value={editingQty?.sku === item.sku ? editingQty.value : item.sendQty}
                            onChange={(e) => handleQtyChange(item.sku, e.target.value)}
                            onBlur={() => handleQtyBlur(item.sku)}
                            onKeyDown={(e) => handleQtyKeyDown(e, item.sku)}
                            onFocus={(e) => setEditingQty({ sku: item.sku, value: String(item.sendQty) })}
                            className="w-20 bg-[var(--background)] border border-slate-600 rounded px-2 py-1 text-[var(--foreground)] text-center"
                            min={0}
                            max={item.warehouseAvailable}
                          />
                          <button onClick={() => updateQty(item.sku, item.replenishmentNeeded)} className="p-1 hover:bg-[var(--secondary)] rounded text-gray-400 hover:text-[var(--foreground)]" title="Set to replenishment needed">
                            <RefreshCw className="w-3 h-3" />
                          </button>
                          <button onClick={() => onHideProduct(item.sku)} className="p-1 hover:bg-[var(--secondary)] rounded text-gray-500 hover:text-red-400" title="Hide from forecasting">
                            <EyeOff className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
