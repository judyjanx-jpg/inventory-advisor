'use client'

import { useState, useEffect } from 'react'
import { useBranding } from '@/contexts/BrandingContext'
import { MessageCircle, Mail, Clock, Package, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'

interface AmazonMessage {
  id: number
  amazonMessageId: string
  amazonOrderId: string | null
  senderType: 'BUYER' | 'SELLER'
  senderEmail: string | null
  subject: string | null
  body: string
  requiresResponse: boolean
  isRead: boolean
  isReplied: boolean
  amazonCreatedAt: string
  supportTicket: {
    id: number
    ticketNumber: string
    status: string
  } | null
}

interface ChatSession {
  id: number
  sessionToken: string
  customerEmail: string | null
  customerName: string | null
  orderContextId: string | null
  createdAt: string
  escalatedToTicketId: number | null
  messages: {
    id: number
    role: 'user' | 'assistant'
    content: string
    createdAt: string
  }[]
}

export default function MessagesPage() {
  const branding = useBranding()
  const [activeTab, setActiveTab] = useState<'amazon' | 'chat'>('amazon')
  const [amazonMessages, setAmazonMessages] = useState<AmazonMessage[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetchMessages()
  }, [activeTab])

  const fetchMessages = async () => {
    setLoading(true)
    try {
      if (activeTab === 'amazon') {
        const res = await fetch('/api/amazon/sync/messages?limit=100')
        const data = await res.json()
        if (data.messages) {
          setAmazonMessages(data.messages)
        }
      } else {
        const res = await fetch('/api/support/chat/history')
        const data = await res.json()
        if (data.sessions) {
          setChatSessions(data.sessions)
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSyncAmazon = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/amazon/sync/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 30, createTickets: true }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`Synced ${data.messagesSynced} messages, created ${data.ticketsCreated} tickets`)
        fetchMessages()
      } else {
        alert('Failed to sync messages: ' + (data.error || 'Unknown error'))
      }
    } catch (error: any) {
      alert('Error syncing messages: ' + error.message)
    } finally {
      setSyncing(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Support Messages</h1>
        <p className="text-gray-500">View Amazon messages and AI chat history</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('amazon')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'amazon'
              ? 'border-emerald-500 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Mail className="w-4 h-4 inline mr-2" />
          Amazon Messages
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'chat'
              ? 'border-emerald-500 text-emerald-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageCircle className="w-4 h-4 inline mr-2" />
          Chat History
        </button>
      </div>

      {/* Amazon Messages Tab */}
      {activeTab === 'amazon' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {amazonMessages.length} message{amazonMessages.length !== 1 ? 's' : ''} found
            </p>
            <button
              onClick={handleSyncAmazon}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: branding.primaryColor }}
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Amazon'}
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading messages...</div>
          ) : amazonMessages.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No Amazon messages found</p>
              <p className="text-sm text-gray-400 mb-4">
                Click "Sync from Amazon" to fetch messages from your Amazon account
              </p>
              <button
                onClick={handleSyncAmazon}
                disabled={syncing}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                style={{ backgroundColor: branding.primaryColor }}
              >
                Sync from Amazon
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {amazonMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`bg-white rounded-lg border-2 p-6 ${
                    !msg.isRead ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            msg.senderType === 'BUYER'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {msg.senderType}
                        </span>
                        {msg.requiresResponse && !msg.isReplied && (
                          <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-700">
                            Requires Response
                          </span>
                        )}
                        {msg.supportTicket && (
                          <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-700">
                            Ticket: {msg.supportTicket.ticketNumber}
                          </span>
                        )}
                      </div>
                      {msg.subject && (
                        <h3 className="font-semibold text-gray-900 mb-1">{msg.subject}</h3>
                      )}
                      {msg.amazonOrderId && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                          <Package className="w-4 h-4" />
                          Order: {msg.amazonOrderId}
                        </div>
                      )}
                      {msg.senderEmail && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                          <Mail className="w-4 h-4" />
                          {msg.senderEmail}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatDate(msg.amazonCreatedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 mt-3">
                    <p className="text-gray-700 whitespace-pre-wrap">{msg.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chat History Tab */}
      {activeTab === 'chat' && (
        <div>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading chat history...</div>
          ) : chatSessions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No chat sessions found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {chatSessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-white rounded-lg border border-gray-200 p-6"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          Session: {session.sessionToken.substring(0, 8)}...
                        </span>
                        {session.escalatedToTicketId && (
                          <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-700">
                            Escalated to Ticket
                          </span>
                        )}
                      </div>
                      {session.customerEmail && (
                        <div className="text-sm text-gray-500 mb-1">
                          <Mail className="w-4 h-4 inline mr-1" />
                          {session.customerEmail}
                        </div>
                      )}
                      {session.customerName && (
                        <div className="text-sm text-gray-500 mb-1">
                          {session.customerName}
                        </div>
                      )}
                      <div className="text-xs text-gray-400">
                        <Clock className="w-3 h-3 inline mr-1" />
                        Started: {formatDate(session.createdAt)}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {session.messages.length} message{session.messages.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3 max-h-96 overflow-y-auto">
                    {session.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${
                            message.role === 'user'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white text-gray-800 border border-gray-200'
                          }`}
                          style={
                            message.role === 'user'
                              ? { backgroundColor: branding.primaryColor }
                              : undefined
                          }
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          <p
                            className={`text-xs mt-1 ${
                              message.role === 'user' ? 'opacity-70' : 'text-gray-400'
                            }`}
                          >
                            {formatDate(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}



