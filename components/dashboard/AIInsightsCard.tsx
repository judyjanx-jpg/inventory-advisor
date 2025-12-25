'use client'

import { useState, useEffect } from 'react'
import { Zap, Loader2, ChevronRight, AlertCircle, AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react'
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
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    glow: 'shadow-cyan-500/20',
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

  const handleInsightClick = () => {
    router.push('/insights')
  }

  const handleViewAllClick = () => {
    router.push('/insights')
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
              <Zap className="w-5 h-5 text-cyan-400" />
              <div className="absolute inset-0 blur-md bg-cyan-400/30" />
            </div>
            <span className="font-semibold text-[var(--foreground)]">AI Insights</span>
          </div>
        </div>
        <div className="px-5 py-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
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
              <Zap className="w-5 h-5 text-cyan-400" />
              <div className="absolute inset-0 blur-md bg-cyan-400/30" />
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
            <Zap className="w-5 h-5 text-cyan-400" />
            <div className="absolute inset-0 blur-md bg-cyan-400/30" />
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

            return (
              <div
                key={insight.id || `insight-${index}`}
                onClick={handleInsightClick}
                className={`
                  group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-200 cursor-pointer
                  ${config.bg} ${config.border}
                  hover:shadow-lg hover:scale-[1.01]
                  ${config.glow}
                `}
              >
                <div className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${config.bg}`}>
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
                
                <span className="flex-1 text-sm text-[var(--foreground)] leading-snug line-clamp-2">
                  {insight.message}
                </span>
                
                <ChevronRight className={`w-4 h-4 flex-shrink-0 ${config.color} opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all`} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      {totalInsights > 0 && (
        <div className="px-5 py-3 border-t border-[var(--border)]">
          <button
            onClick={handleViewAllClick}
            className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors group"
          >
            <span>View all {totalInsights} insights</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}
    </div>
  )
}
