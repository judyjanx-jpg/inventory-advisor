// components/profit/GroupBySelector.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { GroupByType } from '@/types/profit'

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
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[var(--muted)] border border-[var(--border)] rounded hover:bg-[var(--hover-bg)] transition-colors"
      >
        <span className="text-[var(--foreground)]">Group by {selectedOption?.label || 'parent'}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-[var(--card)] rounded-lg shadow-xl border border-[var(--border)] z-50 py-1">
          {groupOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--muted)] ${
                value === option.value ? 'text-cyan-400 bg-[var(--muted)]/50' : 'text-[var(--foreground)]'
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
          
          <div className="border-t border-[var(--border)] mt-1 pt-1 px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input type="checkbox" className="rounded border-[var(--border)] bg-[var(--muted)] text-cyan-500" />
              Split SKUs by marketplace
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
