// components/profit/PeriodSelector.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, Check } from 'lucide-react'
import { CalendarDatePicker } from './CalendarDatePicker'
import { startOfDay, subDays } from 'date-fns'

interface PeriodSelectorProps {
  selectedPreset: string
  onPresetChange: (preset: string) => void
  compareMode: 'none' | 'previous' | 'lastYear'
  onCompareModeChange: (mode: 'none' | 'previous' | 'lastYear') => void
  customStartDate?: Date | null
  customEndDate?: Date | null
  onCustomDateChange?: (startDate: Date | null, endDate: Date | null) => void
}

const periodPresets = [
  { label: 'Today / Yesterday / Month to date / Forecast / Last month', value: 'default' },
  { label: 'Today / Yesterday / Month to date / Last month', value: 'simple' },
  { label: 'Today / Yesterday / 7 days / 14 days / 30 days', value: 'days' },
  { label: 'Today / Yesterday / 2 days ago / 3 days ago', value: 'recent' },
  { label: 'Month to date / Last month / 2 months ago / 3 months ago', value: 'months' },
  { label: 'Custom range', value: 'custom' },
]

const compareModes = [
  { label: 'Do not compare', value: 'none' },
  { label: 'Compare with previous period', value: 'previous' },
  { label: 'Compare with same period last year', value: 'lastYear' },
]

export function PeriodSelector({ 
  selectedPreset, 
  onPresetChange, 
  compareMode, 
  onCompareModeChange,
  customStartDate,
  customEndDate,
  onCustomDateChange
}: PeriodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  // Initialize custom dates if not provided
  const [localStartDate, setLocalStartDate] = useState<Date | null>(
    customStartDate || startOfDay(subDays(new Date(), 30))
  )
  const [localEndDate, setLocalEndDate] = useState<Date | null>(
    customEndDate || startOfDay(subDays(new Date(), 1))
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
      >
        <Calendar className="w-4 h-4 text-[var(--muted-foreground)]" />
        <span className="text-sm text-[var(--foreground)]">Period</span>
        <ChevronDown className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 bg-[var(--card)] rounded-lg shadow-xl border border-[var(--border)] z-50 flex">
          {/* Period Presets - Always visible */}
          <div className="w-80 border-r border-[var(--border)]">
            <div className="p-2 border-b border-[var(--border)]">
              <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 px-2">
                Period Presets
              </h3>
              {periodPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => {
                    onPresetChange(preset.value)
                    if (preset.value !== 'custom') {
                      setIsOpen(false)
                    }
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:bg-[var(--hover-bg)] ${
                    selectedPreset === preset.value ? 'text-cyan-400' : 'text-[var(--foreground)]'
                  }`}
                >
                  {selectedPreset === preset.value && (
                    <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  )}
                  <span className={selectedPreset !== preset.value ? 'ml-6' : ''}>
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Compare Mode */}
            <div className="p-2">
              <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2 px-2">
                Comparison
              </h3>
              {compareModes.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => onCompareModeChange(mode.value as any)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:bg-[var(--hover-bg)] ${
                    compareMode === mode.value ? 'text-cyan-400' : 'text-[var(--foreground)]'
                  }`}
                >
                  {compareMode === mode.value && (
                    <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  )}
                  <span className={compareMode !== mode.value ? 'ml-6' : ''}>
                    {mode.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Range Calendar - Only shown when custom is selected */}
          {selectedPreset === 'custom' && (
            <div className="w-[700px]">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Custom Date Range</h3>
                <CalendarDatePicker
                  startDate={localStartDate}
                  endDate={localEndDate}
                  onStartDateChange={(date) => {
                    setLocalStartDate(date)
                    if (onCustomDateChange) {
                      onCustomDateChange(date, localEndDate)
                    }
                  }}
                  onEndDateChange={(date) => {
                    setLocalEndDate(date)
                    if (onCustomDateChange) {
                      onCustomDateChange(localStartDate, date)
                    }
                  }}
                />
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-sm text-[var(--foreground)] hover:text-[var(--foreground)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (localStartDate && localEndDate && onCustomDateChange) {
                        onCustomDateChange(localStartDate, localEndDate)
                      }
                      setIsOpen(false)
                    }}
                    disabled={!localStartDate || !localEndDate}
                    className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-700 disabled:bg-[var(--muted)] disabled:text-[var(--muted-foreground)] text-[var(--foreground)] rounded-lg transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
