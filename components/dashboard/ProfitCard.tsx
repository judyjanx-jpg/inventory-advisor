'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ProfitCardProps {
  initialData?: {
    periods: Array<{
      label: string
      date: string
      profit: number
      change: number | null
    }>
  }
  yesterdayProfit?: number
}

interface ProfitData {
  yesterday: {
    profit: number
    units: number
  }
  thirtyDay: {
    profit: number
    units: number
  }
  lastYear: {
    profit: number
    profitChangePercent: number | null
  }
}

export default function ProfitCard({ initialData, yesterdayProfit }: ProfitCardProps) {
  const [profitData, setProfitData] = useState<ProfitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProfitData()
  }, [])

  const fetchProfitData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/profit/30days')
      if (!res.ok) {
        const errorText = await res.text()
        console.error('Profit API error:', res.status, res.statusText, errorText)
        setError('Failed to load profit data')
        return
      }
      const data = await res.json()
      if (data.success && data.yesterday && data.thirtyDay) {
        setProfitData(data)
      } else {
        console.error('Profit API returned unexpected data:', data)
        setError('Invalid response from server')
      }
    } catch (error) {
      console.error('Error fetching profit data:', error)
      setError('Failed to fetch profit data')
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          Quick Profit
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-6 py-4">
            <div className="animate-pulse space-y-3">
              <div className="h-20 bg-[var(--muted)] rounded" />
              <div className="h-16 bg-[var(--muted)] rounded" />
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <p className="text-sm text-[var(--muted-foreground)]">{error}</p>
          </div>
        ) : profitData ? (
          <div className="space-y-6">
            {/* Yesterday's Profit - Motivational */}
            <div className="text-center py-4 px-2">
              <p className="text-sm text-[var(--muted-foreground)] mb-2">
                You made
              </p>
              <div className="flex items-center justify-center gap-2 mb-2">
                {profitData.yesterday.profit >= 0 && <Sparkles className="w-6 h-6 text-emerald-400" />}
                <p className={`text-4xl font-bold ${profitData.yesterday.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(profitData.yesterday.profit)}
                </p>
                {profitData.yesterday.profit >= 0 && <Sparkles className="w-6 h-6 text-emerald-400" />}
              </div>
              <p className="text-lg font-semibold text-[var(--foreground)] mb-1">
                yesterday!
              </p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {formatNumber(profitData.yesterday.units)} units sold
              </p>
              
              {/* Year over year change */}
              {profitData.lastYear.profitChangePercent !== null && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className={`flex items-center justify-center gap-1.5 text-sm ${
                    profitData.lastYear.profitChangePercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {profitData.lastYear.profitChangePercent >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span className="font-medium">
                      {profitData.lastYear.profitChangePercent >= 0 ? '+' : ''}
                      {profitData.lastYear.profitChangePercent.toFixed(1)}%
                    </span>
                    <span className="text-[var(--muted-foreground)]">
                      from same day last year
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 30 Day Profit */}
            <div className="pt-4 border-t border-[var(--border)]">
              <div className="text-center space-y-1">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Last 30 days net profit
                </p>
                <p className="text-2xl font-bold text-[var(--foreground)]">
                  {formatCurrency(profitData.thirtyDay.profit)}
                </p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {formatNumber(profitData.thirtyDay.units)} units sold
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-[var(--muted-foreground)]">No data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

