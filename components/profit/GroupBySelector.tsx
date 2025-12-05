// components/profit/GroupBySelector.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { GroupByType } from '@/app/profit/page'

interface GroupBySelectorProps {
  value: GroupByType
  onChange: (value: GroupByType) => void
}

const groupOptions: { value: GroupByType; label: string }[] = [
  { value: 'sku', label: '—' },
  { value: 'asin', label: 'ASIN' },
  { value: 'parent', label: 'Parent' },
  { value: 'brand', label: 'Brand' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'channel', label: 'Channel' },
]

export function GroupBySelector({ value, onChange }: GroupBySelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
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

  const selectedOption = groupOptions.find(opt => opt.value === value)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded hover:bg-slate-600 transition-colors"
      >
        <span className="text-slate-300">Group by {selectedOption?.label || 'parent'}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-slate-800 rounded-lg shadow-xl border border-slate-700 z-50 py-1">
          {groupOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-700 ${
                value === option.value ? 'text-cyan-400 bg-slate-700/50' : 'text-slate-300'
              }`}
            >
              {value === option.value && (
                <Check className="w-4 h-4 text-cyan-400" />
              )}
              <span className={value !== option.value ? 'ml-6' : ''}>
                {option.label}
              </span>
            </button>
          ))}
          
          <div className="border-t border-slate-700 mt-1 pt-1 px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" className="rounded border-slate-600 bg-slate-700 text-cyan-500" />
              Split SKUs by marketplace
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
