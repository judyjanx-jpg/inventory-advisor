'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  FileText, 
  Send, 
  CheckCircle, 
  Truck, 
  PackageCheck,
  ChevronDown 
} from 'lucide-react'

const STATUSES = [
  { value: 'draft', label: 'Draft', icon: FileText, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  { value: 'sent', label: 'Sent', icon: Send, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'confirmed', label: 'Confirmed', icon: CheckCircle, color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  { value: 'shipped', label: 'Shipped', icon: Truck, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { value: 'received', label: 'Received', icon: PackageCheck, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
]

interface StatusButtonProps {
  currentStatus: string
  onStatusChange: (newStatus: string) => void
  className?: string
}

export default function StatusButton({ currentStatus, onStatusChange, className = '' }: StatusButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const currentStatusConfig = STATUSES.find(s => s.value === currentStatus) || STATUSES[0]
  const currentIndex = STATUSES.findIndex(s => s.value === currentStatus)
  const CurrentIcon = currentStatusConfig.icon

  const handleStatusSelect = (status: string) => {
    if (status !== currentStatus) {
      onStatusChange(status)
    }
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${currentStatusConfig.color} hover:opacity-80 transition-opacity`}
      >
        <CurrentIcon className="w-4 h-4" />
        <span className="font-medium">{currentStatusConfig.label}</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl z-[9999] min-w-[200px]">
          {STATUSES.map((status, index) => {
            const StatusIcon = status.icon
            const isDisabled = index < currentIndex
            const isCurrent = status.value === currentStatus

            return (
              <button
                key={status.value}
                onClick={() => !isDisabled && handleStatusSelect(status.value)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--hover-bg)] transition-colors ${
                  isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${isCurrent ? 'bg-[var(--muted)]' : ''} ${
                  index === 0 ? 'rounded-t-lg' : ''
                } ${
                  index === STATUSES.length - 1 ? 'rounded-b-lg' : 'border-b border-[var(--border)]'
                }`}
              >
                <StatusIcon className="w-4 h-4" />
                <span className="flex-1 font-medium">{status.label}</span>
                {isCurrent && (
                  <span className="text-xs text-cyan-400 bg-cyan-500/20 px-2 py-1 rounded">
                    Current
                  </span>
                )}
                {isDisabled && (
                  <span className="text-xs text-[var(--muted-foreground)]">Locked</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

