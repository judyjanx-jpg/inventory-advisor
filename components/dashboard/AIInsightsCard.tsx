'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Loader2, ChevronRight, AlertCircle, AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Insight {
  id: string
  type: 'critical' | 'warning' | 'opportunity' | 'info'
  message: string
  urgency?: number
  sku?: string
  poNumber?: string
  shipmentId?: string
  metadata?: Record<string, any>
}

interface InsightsResponse {
  success: boolean
  insights: Insight[]
  total: number
}

const TYPE_CONFIG = {
  critical: {
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    glow: 'shadow-red-500/20',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/20',
  },
  opportunity: {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    glow: 'shadow-emerald-500/20',
  },
  info: {
    icon: Lightbulb,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
  },
}

export default function AIInsightsCard() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [totalInsights, setTotalInsights] = useState(0)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchInsights()
    const interval = setInterval(fetchInsights, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchInsights = async () => {
    try {
      const res = await fetch('/api/dashboard/insights')
      if (!res.ok) {
        setInsights([])
        setTotalInsights(0)
        setLoading(false)
        return
      }
      
      const data: InsightsResponse = await res.json()
      if (data.success) {
        setInsights(data.insights || [])
        setTotalInsights(data.total || 0)
      } else {
        setInsights([])
        setTotalInsights(0)
      }
    } catch (error) {
      console.error('Error fetching insights:', error)
      setInsights([])
      setTotalInsights(0)
    } finally {
      setLoading(false)
    }
  }

  const handleInsightClick = (insight: Insight) => {
    if (insight.sku) {
      router.push(`/inventory?sku=${insight.sku}`)
    } else if (insight.poNumber) {
      router.push(`/purchase-orders`)
    } else if (insight.shipmentId) {
      router.push(`/fba-shipments`)
    }
  }

  // Count by type
  const criticalCount = insights.filter(i => i.type === 'critical').length
  const warningCount = insights.filter(i => i.type === 'warning').length

  if (loading) {
    return (
      <div className="bg-[var(--card)]">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <div className="absolute inset-0 blur-md bg-violet-400/40" />
            </div>
            <span className="font-semibold text-[var(--foreground)]">AI Insights</span>
          </div>
        </div>
        <div className="px-5 py-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
        </div>
      </div>
    )
  }

  if (insights.length === 0) {
    return (
      <div className="bg-[var(--card)]">
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <div className="absolute inset-0 blur-md bg-violet-400/40" />
            </div>
            <span className="font-semibold text-[var(--foreground)]">AI Insights</span>
          </div>
        </div>
        <div className="px-5 py-8 flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">All clear — nothing needs attention</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--card)]">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Sparkles className="w-5 h-5 text-violet-400" />
            <div className="absolute inset-0 blur-md bg-violet-400/40" />
          </div>
          <span className="font-semibold text-[var(--foreground)]">AI Insights</span>
        </div>
        
        {/* Compact status badges */}
        <div className="flex items-center gap-1.5">
          {criticalCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
              {criticalCount} urgent
            </span>
          )}
          {warningCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
              {warningCount} warning
            </span>
          )}
        </div>
      </div>

      {/* Insights list */}
      <div className="px-3 pb-3">
        <div className="space-y-1.5">
          {insights.map((insight, index) => {
            const config = TYPE_CONFIG[insight.type]
            const Icon = config.icon
            const isClickable = !!(insight.sku || insight.poNumber || insight.shipmentId)

            return (
              <div
                key={insight.id || `insight-${index}`}
                onClick={() => isClickable && handleInsightClick(insight)}
                className={`
                  group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-200
                  ${config.bg} ${config.border}
                  ${isClickable ? 'cursor-pointer hover:shadow-lg hover:scale-[1.01]' : ''}
                  ${isClickable ? config.glow : ''}
                `}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${config.bg}`}>
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
                
                <span className="flex-1 text-sm text-[var(--foreground)] leading-snug line-clamp-2">
                  {insight.message}
                </span>
                
                {isClickable && (
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 ${config.color} opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      {totalInsights > insights.length && (
        <div className="px-5 py-3 border-t border-[var(--border)]">
          <button
            onClick={() => router.push('/dashboard?tab=insights')}
            className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors group"
          >
            <span>View all {totalInsights} insights</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}
    </div>
  )
}
