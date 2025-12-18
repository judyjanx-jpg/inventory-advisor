'use client'

import { useState, useEffect, useRef } from 'react'
import { use } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import {
  ArrowLeft,
  Send,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Bot,
  Package,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  MessageSquare,
  Tag,
  Flag,
} from 'lucide-react'
import Link from 'next/link'

interface Message {
  id: number
  senderType: string
  senderName: string | null
  content: string
  createdAt: string
}

interface Ticket {
  id: number
  ticketNumber: string
  subject: string
  customerEmail: string
  customerName: string | null
  status: string
  priority: string
  category: string
  channel: string
  orderId: string | null
  aiSummary: string | null
  resolutionNotes: string | null
  assignedTo: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  messages: Message[]
}

interface OrderInfo {
  id: string
  purchaseDate: string
  status: string
  items: Array<{
    sku: string
    name: string
    quantity: number
    price: number
  }>
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [order, setOrder] = useState<OrderInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyContent, setReplyContent] = useState('')
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showResolution, setShowResolution] = useState(false)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchTicket()
  }, [id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ticket?.messages])

  const fetchTicket = async () => {
    try {
      const res = await fetch(`/api/tickets/${id}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error)
      }

      setTicket(data.ticket)
      setOrder(data.order)
      setResolutionNotes(data.ticket.resolutionNotes || '')
    } catch (error) {
      console.error('Error fetching ticket:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendReply = async () => {
    if (!replyContent.trim() || sending) return

    setSending(true)
    try {
      const res = await fetch(`/api/tickets/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyContent,
          senderType: 'AGENT',
          senderName: 'Support Agent',
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to send reply')
      }

      setReplyContent('')
      fetchTicket() // Refresh ticket
    } catch (error) {
      console.error('Error sending reply:', error)
      alert('Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  const generateSuggestion = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/tickets/${id}/ai-suggest`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error)
      }

      setReplyContent(data.suggestion)
    } catch (error) {
      console.error('Error generating suggestion:', error)
      alert('Failed to generate suggestion')
    } finally {
      setGenerating(false)
    }
  }

  const updateTicket = async (updates: Partial<Ticket>) => {
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!res.ok) {
        throw new Error('Failed to update ticket')
      }

      fetchTicket()
    } catch (error) {
      console.error('Error updating ticket:', error)
      alert('Failed to update ticket')
    }
  }

  const resolveTicket = async () => {
    await updateTicket({
      status: 'RESOLVED',
      resolutionNotes,
    })
    setShowResolution(false)
  }

  const copyEmail = () => {
    if (ticket?.customerEmail) {
      navigator.clipboard.writeText(ticket.customerEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'PENDING': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      case 'RESOLVED': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      case 'CLOSED': return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
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

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      </MainLayout>
    )
  }

  if (!ticket) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Ticket not found</h2>
            <Link href="/admin/support" className="text-purple-400 hover:underline mt-4 inline-block">
              Back to Support Dashboard
            </Link>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link 
              href="/admin/support"
              className="inline-flex items-center gap-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Tickets
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--foreground)]">
                {ticket.ticketNumber}
              </h1>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(ticket.status)}`}>
                {ticket.status}
              </span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                {ticket.priority}
              </span>
            </div>
            <p className="text-lg text-[var(--foreground)] mt-1">{ticket.subject}</p>
          </div>

          <div className="flex items-center gap-2">
            {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
              <Button 
                variant="outline" 
                onClick={() => setShowResolution(true)}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Resolve
              </Button>
            )}
            <Button onClick={fetchTicket}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Conversation */}
          <div className="lg:col-span-2 space-y-4">
            {/* Messages */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Conversation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {ticket.messages.map((msg) => (
                    <div 
                      key={msg.id}
                      className={`flex gap-3 ${msg.senderType === 'AGENT' ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.senderType === 'CUSTOMER' 
                          ? 'bg-blue-500/20' 
                          : msg.senderType === 'AI'
                          ? 'bg-purple-500/20'
                          : 'bg-emerald-500/20'
                      }`}>
                        {msg.senderType === 'CUSTOMER' ? (
                          <User className="w-4 h-4 text-blue-400" />
                        ) : msg.senderType === 'AI' ? (
                          <Bot className="w-4 h-4 text-purple-400" />
                        ) : (
                          <User className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>
                      <div className={`flex-1 ${msg.senderType === 'AGENT' ? 'text-right' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-[var(--foreground)]">
                            {msg.senderName || msg.senderType}
                          </span>
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {formatDate(msg.createdAt)}
                          </span>
                        </div>
                        <div className={`inline-block max-w-[90%] p-3 rounded-lg ${
                          msg.senderType === 'AGENT'
                            ? 'bg-emerald-500/10 text-[var(--foreground)]'
                            : 'bg-[var(--muted)] text-[var(--foreground)]'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </CardContent>
            </Card>

            {/* Reply Box */}
            {ticket.status !== 'CLOSED' && (
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--foreground)]">Reply</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={generateSuggestion}
                        disabled={generating}
                      >
                        {generating ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                        )}
                        AI Suggest
                      </Button>
                    </div>
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Type your response..."
                      rows={4}
                      className="w-full px-4 py-3 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={sendReply}
                        disabled={!replyContent.trim() || sending}
                      >
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Send className="w-4 h-4 mr-2" />
                        )}
                        Send Reply
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Customer Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Name</p>
                  <p className="text-[var(--foreground)]">{ticket.customerName || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Email</p>
                  <div className="flex items-center gap-2">
                    <p className="text-[var(--foreground)] truncate">{ticket.customerEmail}</p>
                    <button onClick={copyEmail} className="p-1 hover:bg-[var(--muted)] rounded">
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Channel</p>
                  <p className="text-[var(--foreground)]">{ticket.channel}</p>
                </div>
              </CardContent>
            </Card>

            {/* Ticket Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Category</p>
                  <select
                    value={ticket.category}
                    onChange={(e) => updateTicket({ category: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm"
                  >
                    <option value="WARRANTY">Warranty</option>
                    <option value="ORDER">Order</option>
                    <option value="SHIPPING">Shipping</option>
                    <option value="PRODUCT">Product</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Priority</p>
                  <select
                    value={ticket.priority}
                    onChange={(e) => updateTicket({ priority: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Created</p>
                  <p className="text-[var(--foreground)]">{formatDate(ticket.createdAt)}</p>
                </div>
                {ticket.resolvedAt && (
                  <div>
                    <p className="text-sm text-[var(--muted-foreground)]">Resolved</p>
                    <p className="text-[var(--foreground)]">{formatDate(ticket.resolvedAt)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Info */}
            {order && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Related Order
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-[var(--muted-foreground)]">Order ID</p>
                    <p className="text-[var(--foreground)] font-mono text-sm">{order.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--muted-foreground)]">Date</p>
                    <p className="text-[var(--foreground)]">{new Date(order.purchaseDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--muted-foreground)]">Items</p>
                    <div className="mt-1 space-y-1">
                      {order.items.map((item, i) => (
                        <div key={i} className="text-sm text-[var(--foreground)]">
                          {item.name} x{item.quantity}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Summary */}
            {ticket.aiSummary && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    AI Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--muted-foreground)]">{ticket.aiSummary}</p>
                </CardContent>
              </Card>
            )}

            {/* Resolution Notes */}
            {ticket.resolutionNotes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Resolution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--foreground)]">{ticket.resolutionNotes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Resolution Modal */}
        {showResolution && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">
                Resolve Ticket
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Add resolution notes to help the AI learn from this ticket.
              </p>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="How was this issue resolved?"
                rows={4}
                className="w-full px-4 py-3 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none mb-4"
              />
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setShowResolution(false)}>
                  Cancel
                </Button>
                <Button onClick={resolveTicket}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Mark Resolved
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

