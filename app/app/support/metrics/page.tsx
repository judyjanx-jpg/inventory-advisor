'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import {
  BarChart3,
  TrendingUp,
  Clock,
  MessageSquare,
  Shield,
  Bot,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Package,
} from 'lucide-react'

interface Metrics {
  period: { days: number; startDate: string }
  tickets: {
    total: number
    open: number
    pending: number
    resolved: number
    byCategory: Array<{ category: string; count: number }>
    byChannel: Array<{ channel: string; count: number }>
    byDay: Array<{ date: string; count: number }>
    avgResolutionHours: number | null
  }
  warrantyClaims: {
    total: number
    pending: number
    completed: number
    byType: Array<{ type: string; count: number }>
    byStatus: Array<{ status: string; count: number }>
  }
  chat: {
    totalSessions: number
    escalated: number
    escalationRate: number
  }
  recentActivity: {
    tickets: Array<{
      id: number
      ticketNumber: string
      subject: string
      status: string
      priority: string
      category: string
      customerName: string | null
      createdAt: string
    }>
    claims: Array<{
      id: number
      claimNumber: string
      customerName: string | null
      claimType: string
      status: string
      createdAt: string
    }>
  }
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)

  useEffect(() => {
    fetchMetrics()
  }, [period])

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/support/metrics?days=${period}`)
      const data = await res.json()
      if (res.ok) {
        setMetrics(data)
      }
    } catch (error) {
      console.error('Error fetching metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'text-blue-400'
      case 'PENDING': return 'text-amber-400'
      case 'RESOLVED': return 'text-emerald-400'
      case 'CLOSED': return 'text-slate-400'
      case 'COMPLETED': return 'text-emerald-400'
      case 'PENDING_RETURN': return 'text-amber-400'
      case 'RETURN_SHIPPED': return 'text-blue-400'
      case 'PROCESSING': return 'text-purple-400'
      default: return 'text-slate-400'
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'URGENT': return <ArrowUpRight className="w-4 h-4 text-red-400" />
      case 'HIGH': return <ArrowUpRight className="w-4 h-4 text-orange-400" />
      default: return null
    }
  }

  if (loading && !metrics) {
    return (
      <MainLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Support Metrics</h1>
            <p className="text-[var(--muted-foreground)]">
              Performance overview for the last {period} days
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(parseInt(e.target.value))}
              className="px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)]"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <Button onClick={fetchMetrics} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {metrics && (
          <>
            {/* Key Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">Total</span>
                  </div>
                  <p className="text-3xl font-bold text-[var(--foreground)]">{metrics.tickets.total}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">Support Tickets</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-amber-400" />
                    </div>
                    <span className="text-xs text-amber-400">{metrics.tickets.open + metrics.tickets.pending} active</span>
                  </div>
                  <p className="text-3xl font-bold text-[var(--foreground)]">{metrics.tickets.open}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">Open Tickets</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                    <span className="text-xs text-emerald-400">This period</span>
                  </div>
                  <p className="text-3xl font-bold text-[var(--foreground)]">{metrics.tickets.resolved}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">Resolved</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)]">Average</span>
                  </div>
                  <p className="text-3xl font-bold text-[var(--foreground)]">
                    {metrics.tickets.avgResolutionHours 
                      ? `${metrics.tickets.avgResolutionHours}h`
                      : '—'}
                  </p>
                  <p className="text-sm text-[var(--muted-foreground)]">Resolution Time</p>
                </CardContent>
              </Card>
            </div>

            {/* Secondary Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-teal-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--foreground)]">{metrics.warrantyClaims.total}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Warranty Claims</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <Package className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--foreground)]">{metrics.warrantyClaims.pending}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Pending Returns</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--foreground)]">{metrics.chat.totalSessions}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Chat Sessions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-rose-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--foreground)]">{metrics.chat.escalationRate}%</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Escalation Rate</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tickets by Category */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tickets by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {metrics.tickets.byCategory.map((cat) => {
                      const percentage = metrics.tickets.total > 0 
                        ? Math.round((cat.count / metrics.tickets.total) * 100) 
                        : 0
                      return (
                        <div key={cat.category}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-[var(--foreground)]">{cat.category}</span>
                            <span className="text-[var(--muted-foreground)]">
                              {cat.count} ({percentage}%)
                            </span>
                          </div>
                          <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                    {metrics.tickets.byCategory.length === 0 && (
                      <p className="text-sm text-[var(--muted-foreground)] text-center py-4">
                        No ticket data available
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Warranty Claims by Type */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Warranty Claims by Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {metrics.warrantyClaims.byType.map((type) => {
                      const percentage = metrics.warrantyClaims.total > 0 
                        ? Math.round((type.count / metrics.warrantyClaims.total) * 100) 
                        : 0
                      return (
                        <div key={type.type}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-[var(--foreground)]">
                              {type.type === 'REFUND' ? '💰 Refund' : '📦 Replacement'}
                            </span>
                            <span className="text-[var(--muted-foreground)]">
                              {type.count} ({percentage}%)
                            </span>
                          </div>
                          <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                type.type === 'REFUND' 
                                  ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                                  : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                    {metrics.warrantyClaims.byType.length === 0 && (
                      <p className="text-sm text-[var(--muted-foreground)] text-center py-4">
                        No warranty claims yet
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Tickets */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Recent Tickets</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {metrics.recentActivity.tickets.map((ticket) => (
                      <a 
                        key={ticket.id}
                        href={`/app/support/tickets/${ticket.id}`}
                        className="block p-3 bg-[var(--muted)]/50 rounded-lg hover:bg-[var(--muted)] transition-colors"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <span className="font-mono text-sm text-[var(--muted-foreground)]">
                            {ticket.ticketNumber}
                          </span>
                          <div className="flex items-center gap-2">
                            {getPriorityIcon(ticket.priority)}
                            <span className={`text-xs font-medium ${getStatusColor(ticket.status)}`}>
                              {ticket.status}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-[var(--foreground)] truncate mb-1">
                          {ticket.subject}
                        </p>
                        <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                          <span>{ticket.customerName || 'Anonymous'}</span>
                          <span>{formatDate(ticket.createdAt)}</span>
                        </div>
                      </a>
                    ))}
                    {metrics.recentActivity.tickets.length === 0 && (
                      <p className="text-sm text-[var(--muted-foreground)] text-center py-4">
                        No tickets yet
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Warranty Claims */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Recent Warranty Claims</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {metrics.recentActivity.claims.map((claim) => (
                      <a 
                        key={claim.id}
                        href={`/support/warranty/${claim.claimNumber}`}
                        className="block p-3 bg-[var(--muted)]/50 rounded-lg hover:bg-[var(--muted)] transition-colors"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <span className="font-mono text-sm text-[var(--muted-foreground)]">
                            {claim.claimNumber}
                          </span>
                          <span className={`text-xs font-medium ${getStatusColor(claim.status)}`}>
                            {claim.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[var(--foreground)]">
                            {claim.customerName || 'Anonymous'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            claim.claimType === 'REFUND'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {claim.claimType}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                          {formatDate(claim.createdAt)}
                        </p>
                      </a>
                    ))}
                    {metrics.recentActivity.claims.length === 0 && (
                      <p className="text-sm text-[var(--muted-foreground)] text-center py-4">
                        No warranty claims yet
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  )
}

