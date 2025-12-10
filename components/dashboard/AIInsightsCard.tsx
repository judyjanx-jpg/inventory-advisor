'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Brain, X, MessageSquare, CheckCircle, Clock } from 'lucide-react'
import { Loader2 } from 'lucide-react'

interface Insight {
  id: number
  observationType: string
  title: string
  description: string | null
  data: any
  status: string
  priority: string
  conversations: Array<{
    id: number
    role: string
    content: string
    quickResponse: string | null
    createdAt: string
  }>
  createdAt: string
}

interface AIInsightsCardProps {
  limit?: number
}

export default function AIInsightsCard({ limit = 3 }: AIInsightsCardProps) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [newCount, setNewCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [respondingTo, setRespondingTo] = useState<number | null>(null)
  const [responseText, setResponseText] = useState('')
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null)

  useEffect(() => {
    fetchInsights()
  }, [])

  const fetchInsights = async () => {
    try {
      const res = await fetch('/api/ai/insights?status=all')
      const data = await res.json()
      if (data.success) {
        setInsights(data.insights.slice(0, limit))
        setNewCount(data.newCount)
      }
    } catch (error) {
      console.error('Error fetching insights:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRespond = async (insightId: number) => {
    if (!responseText.trim()) return

    setRespondingTo(insightId)
    try {
      const res = await fetch(`/api/ai/insights/${insightId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: responseText })
      })

      const data = await res.json()
      if (data.success) {
        setResponseText('')
        fetchInsights() // Refresh to get new conversation
      }
    } catch (error) {
      console.error('Error responding to insight:', error)
    } finally {
      setRespondingTo(null)
    }
  }

  const handleDismiss = async (insightId: number) => {
    try {
      const res = await fetch(`/api/ai/insights/${insightId}/dismiss`, {
        method: 'POST'
      })

      if (res.ok) {
        fetchInsights()
      }
    } catch (error) {
      console.error('Error dismissing insight:', error)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'out_of_stock':
        return '📦'
      case 'sales_spike':
        return '📈'
      case 'late_shipment':
        return '🚚'
      default:
        return '💡'
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (insights.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-[var(--muted-foreground)]">
            <p>No insights yet. I'm watching your data and will notify you when I notice something interesting!</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            AI Insights
            {newCount > 0 && (
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs font-medium">
                {newCount} new
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={`p-4 rounded-xl border transition-all ${
              insight.status === 'new'
                ? 'bg-purple-500/10 border-purple-500/30'
                : 'bg-[var(--muted)]/30 border-[var(--border)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3 flex-1">
                <span className="text-2xl">{getIcon(insight.observationType)}</span>
                <div className="flex-1">
                  <h4 className="font-medium text-[var(--foreground)] mb-1">
                    {insight.title}
                  </h4>
                  {insight.description && (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {insight.description}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDismiss(insight.id)}
                className="p-1.5 hover:bg-[var(--hover-bg)] rounded-lg transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4 text-[var(--muted-foreground)]" />
              </button>
            </div>

            {/* Conversation */}
            {insight.conversations.length > 0 && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {insight.conversations.map((conv, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg text-sm ${
                      conv.role === 'user'
                        ? 'bg-indigo-500/20 text-indigo-300 ml-4'
                        : 'bg-[var(--muted)]/50 text-[var(--foreground)] mr-4'
                    }`}
                  >
                    {conv.content}
                  </div>
                ))}
              </div>
            )}

            {/* Response Input */}
            {expandedInsight === insight.id && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Type your response..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[var(--input)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond(insight.id)}
                    disabled={!responseText.trim() || respondingTo === insight.id}
                    className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                  >
                    {respondingTo === insight.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4" />
                        Send
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setExpandedInsight(null)
                      setResponseText('')
                    }}
                    className="px-3 py-1.5 bg-[var(--muted)] text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-[var(--hover-bg)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {expandedInsight !== insight.id && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setExpandedInsight(insight.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Respond
                </button>
              </div>
            )}
          </div>
        ))}

        {insights.length >= limit && (
          <div className="text-center pt-2">
            <button className="text-sm text-[var(--primary)] hover:underline">
              View all insights →
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

