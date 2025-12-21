// components/profit/ColumnSelector.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings2 } from 'lucide-react'

interface ColumnSelectorProps {
  visibleColumns: string[]
  onChange: (columns: string[]) => void
}

const allColumns = [
  { key: 'unitsSold', label: 'Units sold', group: 'sales' },
  { key: 'refunds', label: 'Refunds', group: 'sales' },
  { key: 'sales', label: 'Sales', group: 'sales' },
  { key: 'promo', label: 'Promo', group: 'sales' },
  { key: 'adSpend', label: 'Ads', group: 'costs' },
  { key: 'refundRate', label: '% Refunds', group: 'metrics' },
  { key: 'sellableReturns', label: 'Sellable returns', group: 'metrics' },
  { key: 'refundCost', label: 'Refund cost', group: 'costs' },
  { key: 'amazonFees', label: 'Amazon fees', group: 'costs' },
  { key: 'cogs', label: 'Cost of goods', group: 'costs' },
  { key: 'grossProfit', label: 'Gross profit', group: 'profit' },
  { key: 'netProfit', label: 'Net profit', group: 'profit' },
  { key: 'estPayout', label: 'Estimated payout', group: 'profit' },
  { key: 'roi', label: 'ROI', group: 'metrics' },
  { key: 'realAcos', label: 'Real ACOS', group: 'metrics' },
  { key: 'sessions', label: 'Sessions', group: 'traffic' },
  { key: 'unitSessionPct', label: 'Unit session %', group: 'traffic' },
  { key: 'bsr', label: 'BSR', group: 'traffic' },
  { key: 'shippingCosts', label: 'Shipping costs', group: 'costs' },
]

export function ColumnSelector({ visibleColumns, onChange }: ColumnSelectorProps) {
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

  const toggleColumn = (key: string) => {
    if (visibleColumns.includes(key)) {
      onChange(visibleColumns.filter(k => k !== key))
    } else {
      onChange([...visibleColumns, key])
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded transition-colors"
        title="Select columns"
      >
        <Settings2 className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-64 bg-[var(--card)] rounded-lg shadow-xl border border-[var(--border)] z-50 py-2 max-h-96 overflow-y-auto">
          <div className="px-3 pb-2 mb-2 border-b border-[var(--border)]">
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input type="checkbox" className="rounded border-[var(--border)] bg-[var(--muted)] text-cyan-500" />
              Vertical lines
            </label>
          </div>

          <div className="px-3 pb-1">
            <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase">Columns</span>
          </div>

          {allColumns.map((column) => (
            <button
              key={column.key}
              onClick={() => toggleColumn(column.key)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--muted)]"
            >
              <input
                type="checkbox"
                checked={visibleColumns.includes(column.key)}
                onChange={() => {}}
                className="rounded border-[var(--border)] bg-[var(--muted)] text-cyan-500"
              />
              <span className="text-[var(--foreground)]">{column.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
