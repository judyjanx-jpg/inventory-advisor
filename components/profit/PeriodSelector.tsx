// components/profit/PeriodSelector.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, Check } from 'lucide-react'

interface PeriodSelectorProps {
  compareMode: 'none' | 'previous' | 'lastYear'
  onCompareModeChange: (mode: 'none' | 'previous' | 'lastYear') => void
}

const periodPresets = [
  { label: 'Today / Yesterday / Month to date / This month (forecast) / Last month', value: 'default' },
  { label: 'Today / Yesterday / Month to date / Last month', value: 'simple' },
  { label: 'Today / Yesterday / 7 days / 14 days / 30 days', value: 'days' },
  { label: 'This week / Last week / 2 weeks ago / 3 weeks ago', value: 'weeks' },
  { label: 'Month to date / Last month / 2 months ago / 3 months ago', value: 'months' },
  { label: 'Today / Yesterday / 2 days ago / 3 days ago', value: 'recent' },
  { label: 'Today / Yesterday / 7 days ago / 8 days ago', value: 'weekAgo' },
  { label: 'This quarter / Last quarter / 2 quarters ago / 3 quarters ago', value: 'quarters' },
  { label: 'Custom range', value: 'custom' },
]

const compareModes = [
  { label: 'Do not compare', value: 'none' },
  { label: 'Compare with previous period', value: 'previous' },
  { label: 'Compare with same period last year', value: 'lastYear' },
]

export function PeriodSelector({ compareMode, onCompareModeChange }: PeriodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState('default')
  const dropdownRef = useRef<HTMLDivElement>(null)

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
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
      >
        <Calendar className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-white">Period</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-50">
          {/* Period Presets */}
          <div className="p-2 border-b border-slate-700">
            {periodPresets.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setSelectedPreset(preset.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:bg-slate-700 ${
                  selectedPreset === preset.value ? 'text-cyan-400' : 'text-slate-300'
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
            {compareModes.map((mode) => (
              <button
                key={mode.value}
                onClick={() => onCompareModeChange(mode.value as any)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded hover:bg-slate-700 ${
                  compareMode === mode.value ? 'text-cyan-400' : 'text-slate-300'
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
      )}
    </div>
  )
}
