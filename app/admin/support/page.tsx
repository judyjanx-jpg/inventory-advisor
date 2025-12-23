'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import {
  Headphones,
  Ticket,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Package,
  RefreshCw,
  ExternalLink,
  Search,
  Filter,
  ChevronRight,
  Inbox,
  Users,
  TrendingUp,
} from 'lucide-react'
import Link from 'next/link'

interface TicketSummary {
  id: number
  ticketNumber: string
  subject: string
  customerEmail: string
  customerName: string | null
  status: string
  priority: string
  category: string
  channel: string
  createdAt: string
  orderId: string | null
}

interface ClaimSummary {
  id: number
  claimNumber: string
  orderId: string
  customerName: string | null
  claimType: string
  status: string
  productName: string | null
  createdAt: string
}

interface DashboardStats {
  openTickets: number
  pendingClaims: number
  resolvedToday: number
  avgResponseTime: string
}

export default function SupportDashboardPage() {
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [claims, setClaims] = useState<ClaimSummary[]>([])
  const [stats, setStats] = useState<DashboardStats>({
    openTickets: 0,
    pendingClaims: 0,
    resolvedToday: 0,
    avgResponseTime: '-',
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'tickets' | 'claims' | 'chat'>('tickets')
  const [chatSessions, setChatSessions] = useState<any[]>([])
  const [syncingAmazon, setSyncingAmazon] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // Fetch tickets and claims in parallel
      const [ticketsRes, claimsRes, metricsRes, chatRes] = await Promise.all([
        fetch('/api/tickets?status=OPEN,PENDING&limit=10'),
        fetch('/api/warranty-claims?status=PENDING_RETURN,RETURN_SHIPPED,PROCESSING&limit=10'),
        fetch('/api/support/metrics'),
        fetch('/api/support/chat/history?limit=20'),
      ])

      let ticketsList: TicketSummary[] = []
      let claimsList: ClaimSummary[] = []
      let resolvedToday = 0
      let avgResponseTime = '< 4h'

      if (ticketsRes.ok) {
        const ticketsData = await ticketsRes.json()
        ticketsList = ticketsData.tickets || []
        setTickets(ticketsList)
      }

      if (claimsRes.ok) {
        const claimsData = await claimsRes.json()
        claimsList = claimsData.claims || []
        setClaims(claimsList)
      }

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json()
        resolvedToday = metricsData.resolvedToday || 0
        avgResponseTime = metricsData.avgResponseTime || '< 4h'
      }

      if (chatRes.ok) {
        const chatData = await chatRes.json()
        setChatSessions(chatData.sessions || [])
      }

      // Calculate stats using fetched data directly
      setStats({
        openTickets: ticketsList.length,
        pendingClaims: claimsList.length,
        resolvedToday,
        avgResponseTime,
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-blue-500/20 text-blue-400'
      case 'PENDING': return 'bg-amber-500/20 text-amber-400'
      case 'PENDING_RETURN': return 'bg-amber-500/20 text-amber-400'
      case 'RETURN_SHIPPED': return 'bg-purple-500/20 text-purple-400'
      case 'PROCESSING': return 'bg-cyan-500/20 text-cyan-400'
      case 'RESOLVED':
      case 'COMPLETED': return 'bg-emerald-500/20 text-emerald-400'
      case 'CLOSED': return 'bg-slate-500/20 text-slate-400'
      default: return 'bg-slate-500/20 text-slate-400'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'bg-red-500/20 text-red-400'
      case 'HIGH': return 'bg-orange-500/20 text-orange-400'
      case 'MEDIUM': return 'bg-amber-500/20 text-amber-400'
      case 'LOW': return 'bg-slate-500/20 text-slate-400'
      default: return 'bg-slate-500/20 text-slate-400'
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-3">
              <Headphones className="w-7 h-7 text-purple-400" />
              Customer Support
            </h1>
            <p className="text-[var(--muted-foreground)] mt-1">
              Manage tickets, warranty claims, and customer inquiries
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={async () => {
                setSyncingAmazon(true)
                try {
                  const res = await fetch('/api/amazon/sync/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ daysBack: 30, createTickets: true }),
                  })
                  const data = await res.json()
                  if (data.success) {
                    alert(`Synced ${data.messagesSynced} messages, created ${data.ticketsCreated} tickets`)
                    fetchDashboardData()
                  } else {
                    alert('Failed to sync: ' + (data.error || 'Unknown error'))
                  }
                } catch (error: any) {
                  alert('Error: ' + error.message)
                } finally {
                  setSyncingAmazon(false)
                }
              }}
              disabled={syncingAmazon}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncingAmazon ? 'animate-spin' : ''}`} />
              {syncingAmazon ? 'Syncing...' : 'Sync Amazon Messages'}
            </Button>
            <Link
              href="/support"
              target="_blank"
              className="flex items-center gap-2 px-4 py-2 bg-[var(--muted)] hover:bg-[var(--hover-bg)] text-[var(--foreground)] rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View Public Portal
            </Link>
            <Button onClick={fetchDashboardData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Open Tickets</p>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.openTickets}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Ticket className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Pending Claims</p>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.pendingClaims}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Resolved Today</p>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.resolvedToday}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Avg Response</p>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.avgResponseTime}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs & Search */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-[var(--muted)] p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('tickets')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'tickets'
                  ? 'bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Ticket className="w-4 h-4 inline mr-2" />
              Tickets
            </button>
            <button
              onClick={() => setActiveTab('claims')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'claims'
                  ? 'bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Shield className="w-4 h-4 inline mr-2" />
              Warranty Claims
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'chat'
                  ? 'bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <MessageSquare className="w-4 h-4 inline mr-2" />
              Chat History
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="pl-9 pr-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            <Button variant="outline" size="sm">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-purple-400 mx-auto mb-4" />
              <p className="text-[var(--muted-foreground)]">Loading...</p>
            </CardContent>
          </Card>
        ) : activeTab === 'tickets' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="w-5 h-5" />
                Support Tickets
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tickets.length === 0 ? (
                <div className="text-center py-12">
                  <Ticket className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4 opacity-50" />
                  <p className="text-[var(--muted-foreground)]">No open tickets</p>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">
                    New tickets will appear here when customers contact support
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tickets.map((ticket) => (
                    <Link
                      key={ticket.id}
                      href={`/admin/support/tickets/${ticket.id}`}
                      className="flex items-center gap-4 p-4 bg-[var(--muted)]/50 hover:bg-[var(--muted)] rounded-lg transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-[var(--muted-foreground)]">
                            {ticket.ticketNumber}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(ticket.status)}`}>
                            {ticket.status}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                            {ticket.priority}
                          </span>
                        </div>
                        <p className="font-medium text-[var(--foreground)] truncate">{ticket.subject}</p>
                        <p className="text-sm text-[var(--muted-foreground)]">
                          {ticket.customerName || ticket.customerEmail}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-[var(--muted-foreground)]">{formatDate(ticket.createdAt)}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{ticket.category}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)]" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : activeTab === 'claims' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Warranty Claims
              </CardTitle>
            </CardHeader>
            <CardContent>
              {claims.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4 opacity-50" />
                  <p className="text-[var(--muted-foreground)]">No pending warranty claims</p>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">
                    New warranty claims will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {claims.map((claim) => (
                    <Link
                      key={claim.id}
                      href={`/admin/support/claims/${claim.claimNumber}`}
                      className="flex items-center gap-4 p-4 bg-[var(--muted)]/50 hover:bg-[var(--muted)] rounded-lg transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-[var(--muted-foreground)]">
                            {claim.claimNumber}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(claim.status)}`}>
                            {claim.status.replace(/_/g, ' ')}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            claim.claimType === 'REFUND' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {claim.claimType}
                          </span>
                        </div>
                        <p className="font-medium text-[var(--foreground)] truncate">
                          {claim.productName || `Order ${claim.orderId}`}
                        </p>
                        <p className="text-sm text-[var(--muted-foreground)]">
                          {claim.customerName || claim.orderId}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-[var(--muted-foreground)]">{formatDate(claim.createdAt)}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)]" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Chat History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chatSessions.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4 opacity-50" />
                  <p className="text-[var(--muted-foreground)]">No chat sessions found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatSessions.map((session) => (
                    <div
                      key={session.id}
                      className="p-4 bg-[var(--muted)]/50 rounded-lg border border-[var(--border)]"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-[var(--foreground)]">
                              Session: {session.sessionToken.substring(0, 8)}...
                            </span>
                            {session.escalatedToTicketId && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                                Escalated
                              </span>
                            )}
                          </div>
                          {session.customerEmail && (
                            <p className="text-sm text-[var(--muted-foreground)]">{session.customerEmail}</p>
                          )}
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {new Date(session.createdAt).toLocaleString()} • {session.messages.length} messages
                          </p>
                        </div>
                      </div>
                      <div className="bg-[var(--card-bg)] rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                        {session.messages.slice(-5).map((msg: any) => (
                          <div
                            key={msg.id}
                            className={`text-sm ${
                              msg.role === 'user' ? 'text-right' : 'text-left'
                            }`}
                          >
                            <div
                              className={`inline-block px-3 py-1.5 rounded-lg max-w-[80%] ${
                                msg.role === 'user'
                                  ? 'bg-purple-500/20 text-purple-300'
                                  : 'bg-[var(--muted)] text-[var(--foreground)]'
                              }`}
                            >
                              {msg.content.substring(0, 200)}
                              {msg.content.length > 200 && '...'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/admin/support/knowledge"
            className="p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl hover:border-purple-500/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                <MessageSquare className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="font-medium text-[var(--foreground)]">Knowledge Base</p>
                <p className="text-sm text-[var(--muted-foreground)]">Edit FAQ articles</p>
              </div>
            </div>
          </Link>

          <Link
            href="/settings/shipstation"
            className="p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl hover:border-purple-500/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                <Package className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-[var(--foreground)]">Shipping Settings</p>
                <p className="text-sm text-[var(--muted-foreground)]">Configure ShipStation</p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/support/metrics"
            className="p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl hover:border-purple-500/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-[var(--foreground)]">Support Metrics</p>
                <p className="text-sm text-[var(--muted-foreground)]">Response times & stats</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </MainLayout>
  )
}

