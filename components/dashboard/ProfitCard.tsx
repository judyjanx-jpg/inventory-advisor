'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ProfitPeriod {
  label: string
  date: string
  profit: number
  change: number | null
}

interface ProfitCardProps {
  initialData?: {
    periods: ProfitPeriod[]
  }
}

type PeriodType = '4days' | '7days' | 'week' | 'month'

export default function ProfitCard({ initialData }: ProfitCardProps) {
  const [periods, setPeriods] = useState<ProfitPeriod[]>(initialData?.periods || [])
  const [periodType, setPeriodType] = useState<PeriodType>('4days')
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const periodOptions: { value: PeriodType; label: string }[] = [
    { value: '4days', label: 'Last 4 days' },
    { value: '7days', label: 'Last 7 days' },
    { value: 'week', label: 'This week vs last' },
    { value: 'month', label: 'This month vs last' },
  ]

  useEffect(() => {
    if (periodType !== '4days' || !initialData?.periods.length) {
      fetchProfit()
    }
  }, [periodType])

  const fetchProfit = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dashboard/profit?type=${periodType}`)
      const data = await res.json()
      if (data.success) {
        setPeriods(data.periods)
      }
    } catch (error) {
      console.error('Error fetching profit:', error)
    } finally {
      setLoading(false)
    }
  }

  const getChangeIcon = (change: number | null) => {
    if (change === null) return null
    if (change > 0) return <TrendingUp className="w-4 h-4 text-emerald-400" />
    if (change < 0) return <TrendingDown className="w-4 h-4 text-red-400" />
    return <Minus className="w-4 h-4 text-[var(--muted-foreground)]" />
  }

  const getChangeColor = (change: number | null) => {
    if (change === null) return 'text-[var(--muted-foreground)]'
    if (change > 0) return 'text-emerald-400'
    if (change < 0) return 'text-red-400'
    return 'text-[var(--muted-foreground)]'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Quick Profit
          </CardTitle>
          
          {/* Period Selector */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--hover-bg)]"
            >
              {periodOptions.find(p => p.value === periodType)?.label}
              <ChevronDown className="w-4 h-4" />
            </button>
            
            {showDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowDropdown(false)} 
                />
                <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[160px]">
                  {periodOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setPeriodType(option.value)
                        setShowDropdown(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--hover-bg)] transition-colors ${
                        periodType === option.value 
                          ? 'text-[var(--primary)] font-medium' 
                          : 'text-[var(--foreground)]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between p-2">
                <div className="h-4 bg-[var(--muted)] rounded w-24" />
                <div className="h-5 bg-[var(--muted)] rounded w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {periods.map((period, idx) => (
              <div 
                key={idx}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  idx === 0 ? 'bg-[var(--primary)]/10 border border-[var(--primary)]/20' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${idx === 0 ? 'font-medium text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
                    {period.label}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${
                    period.profit >= 0 ? 'text-[var(--foreground)]' : 'text-red-400'
                  }`}>
                    {formatCurrency(period.profit)}
                  </span>
                  {period.change !== null && (
                    <div className={`flex items-center gap-1 text-sm ${getChangeColor(period.change)}`}>
                      {getChangeIcon(period.change)}
                      <span>{Math.abs(period.change).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {periods.length === 0 && !loading && (
          <div className="text-center py-6 text-[var(--muted-foreground)]">
            No profit data available yet
          </div>
        )}
      </CardContent>
    </Card>
  )
}

