'use client'

import React from 'react'
import { X } from 'lucide-react'
import { ForecastSettings } from '@/types/forecasting'

interface SettingsPanelProps {
  settings: ForecastSettings
  setSettings: (s: ForecastSettings) => void
  onClose: () => void
}

export default function SettingsPanel({ settings, setSettings, onClose }: SettingsPanelProps) {
  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-[var(--foreground)]">Forecast Settings</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-[var(--foreground)]">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <h4 className="font-medium text-gray-300">Purchasing</h4>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Purchase Interval</label>
            <select
              value={settings.purchaseInterval}
              onChange={(e) => setSettings({ ...settings, purchaseInterval: e.target.value as ForecastSettings['purchaseInterval'] })}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
            >
              <option value="as_needed">As Needed</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="roundTo5"
              checked={settings.roundToNearest5}
              onChange={(e) => setSettings({ ...settings, roundToNearest5: e.target.checked })}
              className="rounded bg-[var(--background)] border-[var(--border)]"
            />
            <label htmlFor="roundTo5" className="text-sm text-gray-300">Round quantities to nearest 5</label>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-medium text-gray-300">FBA Replenishment</h4>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Daily Capacity (units)</label>
            <input
              type="number"
              value={settings.fbaCapacity}
              onChange={(e) => setSettings({ ...settings, fbaCapacity: parseInt(e.target.value) || 0 })}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">FBA Target Days</label>
            <input
              type="number"
              value={settings.fbaTargetDays}
              onChange={(e) => setSettings({ ...settings, fbaTargetDays: parseInt(e.target.value) || 45 })}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-medium text-gray-300">Inventory Targets</h4>
          <div>
            <label className="text-sm text-gray-400 block mb-1">Warehouse Target Days</label>
            <input
              type="number"
              value={settings.warehouseTargetDays}
              onChange={(e) => setSettings({ ...settings, warehouseTargetDays: parseInt(e.target.value) || 135 })}
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--foreground)]"
            />
          </div>
          <div className="pt-2 text-sm text-gray-400">
            <p>Total Target: {settings.fbaTargetDays + settings.warehouseTargetDays} days</p>
          </div>
        </div>
      </div>
    </div>
  )
}
