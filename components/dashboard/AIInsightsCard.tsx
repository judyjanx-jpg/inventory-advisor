'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Loader2, ExternalLink } from 'lucide-react'
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

const PRIORITY_EMOJIS = {
  critical: '🔴',
  warning: '🟡',
  opportunity: '🟢',
  info: '💡',
}

export default function AIInsightsCard() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [totalInsights, setTotalInsights] = useState(0)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchInsights()
    // Refresh every 15 minutes if dashboard is open
    const interval = setInterval(fetchInsights, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchInsights = async () => {
    try {
      const res = await fetch('/api/dashboard/insights')
      if (!res.ok) {
        console.error('Insights API error:', res.status, res.statusText)
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
        console.error('❌ Insights API returned success: false', data)
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

  if (loading) {
    return (
      <div className="bg-[var(--card)]">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            AI Insights
          </h3>
        </div>
        <div className="px-6 py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
        </div>
      </div>
    )
  }

  if (insights.length === 0) {
    return (
      <div className="bg-[var(--card)]">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            AI Insights
          </h3>
        </div>
        <div className="px-6 py-8 flex items-center justify-center">
          <div className="text-center text-[var(--muted-foreground)]">
            <p className="flex items-center justify-center gap-2">
              <span className="text-lg">✓</span>
              <span>All clear — nothing needs attention</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--card)]">
      <div className="px-6 py-4 border-b border-[var(--border)]">
        <h3 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          AI Insights
        </h3>
      </div>
      <div className="px-6 py-4">
        <div className="space-y-2">
          {insights.map((insight, index) => {
            const emoji = PRIORITY_EMOJIS[insight.type]
            const isClickable = !!(insight.sku || insight.poNumber || insight.shipmentId)

            return (
              <div
                key={insight.id || `insight-${index}`}
                onClick={() => isClickable && handleInsightClick(insight)}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${isClickable ? 'cursor-pointer hover:bg-[var(--muted)]/50' : ''}`}
                style={{ 
                  minHeight: '48px',
                  backgroundColor: insight.type === 'critical' ? 'rgba(239, 68, 68, 0.1)' : 
                                  insight.type === 'warning' ? 'rgba(234, 179, 8, 0.1)' :
                                  insight.type === 'opportunity' ? 'rgba(34, 197, 94, 0.1)' :
                                  'rgba(59, 130, 246, 0.1)',
                  borderLeftWidth: '4px',
                  borderLeftColor: insight.type === 'critical' ? '#ef4444' :
                                  insight.type === 'warning' ? '#eab308' :
                                  insight.type === 'opportunity' ? '#22c55e' :
                                  '#3b82f6'
                }}
              >
                <span className="flex-shrink-0 mt-0.5 text-lg">{emoji}</span>
                <span
                  className="flex-1 text-sm leading-relaxed text-[var(--foreground)]"
                  title={insight.message}
                >
                  {insight.message}
                </span>
                {isClickable && (
                  <ExternalLink className="w-4 h-4 text-[var(--muted-foreground)] flex-shrink-0 mt-1" />
                )}
              </div>
            )
          })}
        </div>
      </div>
      {totalInsights > insights.length && (
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--muted)]/30">
          <button
            onClick={() => router.push('/dashboard?tab=insights')}
            className="text-sm text-[var(--primary)] hover:underline w-full text-left"
          >
            See all ({totalInsights - insights.length} more) →
          </button>
        </div>
      )}
    </div>
  )
}
