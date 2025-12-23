'use client'

import React, { useState, useMemo } from 'react'
import { Rocket, Check, AlertTriangle, X, Plus, Search } from 'lucide-react'
import { ForecastItem, PushReadinessResult, ForecastSettings } from '@/types/forecasting'

interface PushReadinessTabProps {
  items: ForecastItem[]
  settings: ForecastSettings
  onFlagSpike?: (sku: string, multiplier: number, durationDays: number) => void
}

export default function PushReadinessTab({ items, settings, onFlagSpike }: PushReadinessTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSku, setSelectedSku] = useState<string>('')
  const [pushMultiplier, setPushMultiplier] = useState<number>(2) // +100%
  const [durationDays, setDurationDays] = useState<number>(7)
  const [checkResult, setCheckResult] = useState<{
    ready: boolean
    daysOfBuffer: number
    message: string
  } | null>(null)

  // Calculate push readiness for all items
  const pushReadinessData: PushReadinessResult[] = useMemo(() => {
    return items.map(item => {
      const currentVelocity = item.velocity30d
      const totalInventory = item.fbaAvailable + item.fbaInbound + item.warehouseAvailable + item.incomingFromPO
      const totalTargetDays = settings.fbaTargetDays + settings.warehouseTargetDays

      // Calculate max sustainable push multiplier
      // Based on how much inventory we have vs current burn rate
      const currentDaysOfSupply = currentVelocity > 0 ? totalInventory / currentVelocity : 999
      const leadTimeDays = item.leadTimeDays || 14

      // Max push = how much more velocity we can sustain given inventory and lead time
      // We need at least leadTimeDays worth of stock as safety buffer
      const availableForPush = currentDaysOfSupply - leadTimeDays
      const maxSustainablePush = availableForPush > 0 ? Math.min(5, availableForPush / 30) : 0

      let status: 'ready' | 'limited' | 'not_ready'
      let limitingFactor: string | undefined

      if (maxSustainablePush >= 3) {
        status = 'ready'
      } else if (maxSustainablePush >= 1.5) {
        status = 'limited'
        if (item.warehouseAvailable < item.velocity30d * 30) {
          limitingFactor = 'warehouse stock'
        } else if (item.leadTimeDays > 21) {
          limitingFactor = 'lead time'
        }
      } else {
        status = 'not_ready'
        if (totalInventory < item.velocity30d * leadTimeDays) {
          limitingFactor = 'insufficient inventory'
        } else {
          limitingFactor = 'low buffer'
        }
      }

      return {
        sku: item.sku,
        currentVelocity,
        maxSustainablePush: Math.max(1, Math.round(maxSustainablePush * 10) / 10),
        daysOfBuffer: Math.round(currentDaysOfSupply - leadTimeDays),
        status,
        limitingFactor,
      }
    })
  }, [items, settings])

  // Filter items by search
  const filteredData = useMemo(() => {
    if (!searchQuery) return pushReadinessData
    const query = searchQuery.toLowerCase()
    return pushReadinessData.filter(item => item.sku.toLowerCase().includes(query))
  }, [pushReadinessData, searchQuery])

  // Perform push check for selected SKU
  const performPushCheck = () => {
    if (!selectedSku) return

    const item = items.find(i => i.sku === selectedSku)
    if (!item) return

    const currentVelocity = item.velocity30d
    const pushedVelocity = currentVelocity * pushMultiplier
    const totalInventory = item.fbaAvailable + item.fbaInbound + item.warehouseAvailable + item.incomingFromPO

    // Calculate inventory needed for the push period
    const inventoryNeededForPush = pushedVelocity * durationDays
    // Calculate remaining inventory after push
    const remainingAfterPush = totalInventory - inventoryNeededForPush
    // Calculate days of buffer after push (at normal velocity)
    const daysOfBuffer = currentVelocity > 0 ? remainingAfterPush / currentVelocity : 999
    // Account for lead time
    const bufferAfterLeadTime = daysOfBuffer - (item.leadTimeDays || 14)

    const ready = bufferAfterLeadTime > 0
    let message = ''

    if (ready) {
      message = `Ready — you have ${Math.round(bufferAfterLeadTime)} days of buffer after the push`
    } else {
      message = `Not ready — would run out ${Math.abs(Math.round(bufferAfterLeadTime))} days before restock`
    }

    setCheckResult({ ready, daysOfBuffer: Math.round(bufferAfterLeadTime), message })
  }

  const getStatusBadge = (status: 'ready' | 'limited' | 'not_ready', maxPush: number) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
            <Check className="w-3 h-3" />
            Ready
          </span>
        )
      case 'limited':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            <AlertTriangle className="w-3 h-3" />
            Limited
          </span>
        )
      case 'not_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
            <X className="w-3 h-3" />
            Not Ready
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Check Section */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-cyan-400" />
          Quick Push Check
        </h3>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-sm text-gray-400 mb-1">SKU</label>
            <select
              value={selectedSku}
              onChange={(e) => { setSelectedSku(e.target.value); setCheckResult(null) }}
              className="bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 text-[var(--foreground)] min-w-48"
            >
              <option value="">Select SKU...</option>
              {items.map(item => (
                <option key={item.sku} value={item.sku}>{item.sku}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Push</label>
            <div className="flex gap-1">
              {[2, 3, 4].map(mult => (
                <button
                  key={mult}
                  onClick={() => { setPushMultiplier(mult); setCheckResult(null) }}
                  className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                    pushMultiplier === mult
                      ? 'bg-cyan-600 border-cyan-500 text-white'
                      : 'bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--secondary)]'
                  }`}
                >
                  +{(mult - 1) * 100}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Duration</label>
            <select
              value={durationDays}
              onChange={(e) => { setDurationDays(parseInt(e.target.value)); setCheckResult(null) }}
              className="bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 text-[var(--foreground)]"
            >
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          <button
            onClick={performPushCheck}
            disabled={!selectedSku}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white font-medium"
          >
            CHECK
          </button>
        </div>

        {/* Check Result */}
        {checkResult && (
          <div className={`mt-4 p-4 rounded-lg border ${
            checkResult.ready
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {checkResult.ready ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : (
                  <X className="w-5 h-5 text-red-400" />
                )}
                <span className={checkResult.ready ? 'text-green-400' : 'text-red-400'}>
                  {checkResult.message}
                </span>
              </div>
              {checkResult.ready && onFlagSpike && (
                <button
                  onClick={() => onFlagSpike(selectedSku, pushMultiplier, durationDays)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm text-white"
                >
                  <Plus className="w-4 h-4" />
                  Flag as Upcoming Spike
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* All SKUs Push Readiness Table */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-medium text-[var(--foreground)]">All Products Push Readiness</h3>
            <div className="flex-1" />
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded text-sm text-[var(--foreground)]"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] text-sm text-gray-400 bg-[var(--background)]">
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-center">Current Velocity</th>
                <th className="px-4 py-3 text-center">Max Sustainable Push</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredData.map((item) => (
                <tr key={item.sku} className="border-b border-[var(--border)]/50 hover:bg-slate-750">
                  <td className="px-4 py-3">
                    <span className="font-medium text-[var(--foreground)]">{item.sku}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-[var(--foreground)]">
                    {item.currentVelocity.toFixed(1)}/day
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold ${
                      item.maxSustainablePush >= 3 ? 'text-green-400' :
                      item.maxSustainablePush >= 1.5 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {item.maxSustainablePush}x
                    </span>
                    {item.limitingFactor && (
                      <span className="ml-2 text-xs text-gray-500">({item.limitingFactor})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {getStatusBadge(item.status, item.maxSustainablePush)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredData.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-gray-400">No products found</p>
          </div>
        )}
      </div>
    </div>
  )
}
