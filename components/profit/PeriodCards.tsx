// components/profit/PeriodCards.tsx
'use client'

import { useState } from 'react'
import { PeriodData, PeriodType } from '@/app/profit/page'
import { PeriodDetailsModal } from './PeriodDetailsModal'

interface PeriodCardsProps {
  data: PeriodData[]
  loading: boolean
  selectedPeriod: PeriodType
  onPeriodSelect: (period: PeriodType) => void
}

const periodConfig: { key: PeriodType; label: string; gradient: string }[] = [
  { key: 'today', label: 'Today', gradient: 'from-cyan-500 to-cyan-600' },
  { key: 'yesterday', label: 'Yesterday', gradient: 'from-cyan-600 to-cyan-700' },
  { key: 'mtd', label: 'Month to date', gradient: 'from-blue-500 to-blue-600' },
  { key: 'forecast', label: 'This month (forecast)', gradient: 'from-blue-600 to-blue-700' },
  { key: 'lastMonth', label: 'Last month', gradient: 'from-emerald-500 to-emerald-600' },
]

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function ChangeIndicator({ value }: { value?: number }) {
  if (value === undefined || value === null) return null
  const isPositive = value > 0
  const color = isPositive ? 'text-emerald-300' : 'text-red-300'
  return <span className={`text-sm ${color} ml-2`}>{formatPercent(value)}</span>
}

function PeriodCardSkeleton({ gradient }: { gradient: string }) {
  return (
    <div className="flex-1 min-w-0">
      <div className={`bg-gradient-to-br ${gradient} rounded-xl p-5 text-white h-full animate-pulse`}>
        <div className="h-5 bg-white/20 rounded w-28 mb-1"></div>
        <div className="h-4 bg-white/20 rounded w-36 mb-4"></div>
        <div className="h-3 bg-white/20 rounded w-12 mb-1"></div>
        <div className="h-8 bg-white/20 rounded w-32 mb-4"></div>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-3 bg-white/20 rounded w-20"></div>
              <div className="h-3 bg-white/20 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PeriodCard({ 
  data, 
  config, 
  isSelected,
  onClick 
}: { 
  data?: PeriodData
  config: typeof periodConfig[0]
  isSelected: boolean
  onClick: () => void
}) {
  const [showDetails, setShowDetails] = useState(false)

  if (!data) {
    return <PeriodCardSkeleton gradient={config.gradient} />
  }

  return (
    <div className="relative flex-1 min-w-0">
      <div 
        className={`bg-gradient-to-br ${config.gradient} rounded-xl p-5 text-white h-full cursor-pointer transition-all ${
          isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:brightness-110'
        }`}
        onClick={onClick}
      >
        {/* Header */}
        <div className="mb-3">
          <h3 className="font-semibold text-lg">{config.label}</h3>
          <p className="text-sm text-white/70">{data.dateRange}</p>
        </div>

        {/* Sales */}
        <div className="mb-4">
          <p className="text-sm text-white/70">Sales</p>
          <div className="flex items-baseline">
            <p className="text-3xl font-bold">{formatCurrency(data.sales)}</p>
            <ChangeIndicator value={data.salesChange} />
          </div>
        </div>

        {/* Stats Grid - 2 columns */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-3">
          <div>
            <p className="text-white/60">Orders / Units</p>
            <p className="font-medium">{formatNumber(data.orders)} / {formatNumber(data.units)}</p>
          </div>
          <div>
            <p className="text-white/60">Refunds</p>
            <p className={`font-medium ${data.refundCount > 0 ? 'text-red-300' : ''}`}>
              {data.refundCount > 0 ? formatNumber(data.refundCount) : '-'}
            </p>
          </div>
          <div>
            <p className="text-white/60">Adv. cost</p>
            <p className="font-medium text-red-300">-{formatCurrency(data.adCost)}</p>
          </div>
          <div>
            <p className="text-white/60">Est. payout</p>
            <p className="font-medium">{formatCurrency(data.estPayout)}</p>
          </div>
        </div>

        {/* Profit Summary */}
        <div className="border-t border-white/20 pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-white/70">Gross profit</span>
            <span className={data.grossProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}>
              {formatCurrency(data.grossProfit)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/70">Net profit</span>
            <div className="flex items-center">
              <span className={`font-semibold ${data.netProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {formatCurrency(data.netProfit)}
              </span>
              <ChangeIndicator value={data.netProfitChange} />
            </div>
          </div>
        </div>

        {/* More Button */}
        <button 
          onClick={(e) => {
            e.stopPropagation()
            setShowDetails(true)
          }}
          className="mt-3 text-sm text-white/70 hover:text-white transition-colors"
        >
          More
        </button>
      </div>

      {/* Period Details Modal */}
      <PeriodDetailsModal 
        data={data} 
        isOpen={showDetails} 
        onClose={() => setShowDetails(false)} 
      />
    </div>
  )
}

export function PeriodCards({ data, loading, selectedPeriod, onPeriodSelect }: PeriodCardsProps) {
  const getPeriodData = (key: PeriodType): PeriodData | undefined => {
    return data.find(d => d.period === key)
  }

  return (
    <div className="flex gap-4">
      {periodConfig.map((config) => (
        <PeriodCard
          key={config.key}
          config={config}
          data={loading ? undefined : getPeriodData(config.key)}
          isSelected={selectedPeriod === config.key}
          onClick={() => onPeriodSelect(config.key)}
        />
      ))}
    </div>
  )
}
