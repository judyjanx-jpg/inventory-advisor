'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, ExternalLink, Shield, Package, Ruler, User } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatWidgetProps {
  orderContext?: string // Optional order ID for context
}

export default function ChatWidget({ orderContext }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [escalatedTicket, setEscalatedTicket] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingMessage])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  // Listen for custom event to open chat
  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true)
    window.addEventListener('openChat', handleOpenChat)
    return () => window.removeEventListener('openChat', handleOpenChat)
  }, [])

  // Add welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: "Hi there! 👋 I'm your support assistant. How can I help you today?",
        timestamp: new Date(),
      }])
    }
  }, [isOpen, messages.length])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setStreamingMessage('')

    try {
      const response = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: userMessage.content,
          orderContext,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send message')
      }

      // Check if it's a streaming response
      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('text/event-stream')) {
        // Handle SSE stream
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let fullText = ''

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  
                  if (data.text) {
                    fullText += data.text
                    setStreamingMessage(fullText)
                  }
                  
                  if (data.done) {
                    if (data.sessionId) {
                      setSessionId(data.sessionId)
                    }
                  }
                  
                  if (data.error) {
                    throw new Error(data.error)
                  }
                } catch (e) {
                  // Ignore JSON parse errors for incomplete chunks
                }
              }
            }
          }
        }

        // Add the complete message
        if (fullText) {
          setMessages(prev => [...prev, {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: fullText,
            timestamp: new Date(),
          }])
        }
        setStreamingMessage('')
      } else {
        // Handle JSON response (escalation, etc.)
        const data = await response.json()
        
        if (data.sessionId) {
          setSessionId(data.sessionId)
        }

        if (data.escalated && data.ticketNumber) {
          setEscalatedTicket(data.ticketNumber)
        }

        if (data.message) {
          setMessages(prev => [...prev, {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: data.message,
            timestamp: new Date(),
          }])
        }
      }
    } catch (error: any) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again or contact us directly.",
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'warranty':
        setInput("I need help with a warranty claim")
        break
      case 'track':
        setInput("How do I track my order?")
        break
      case 'sizing':
        setInput("I need help with sizing")
        break
      case 'human':
        setInput("I'd like to speak with a human")
        break
    }
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <div className="w-80 sm:w-96 h-[550px] bg-slate-900 rounded-2xl shadow-2xl shadow-black/50 border border-slate-700 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Support Chat</h4>
                <p className="text-xs text-slate-700">
                  {isLoading ? 'Typing...' : 'We typically reply instantly'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-900" />
            </button>
          </div>

          {/* Escalation Notice */}
          {escalatedTicket && (
            <div className="px-4 py-2 bg-purple-500/20 border-b border-purple-500/30 flex-shrink-0">
              <p className="text-xs text-purple-300">
                Ticket <span className="font-mono font-semibold">{escalatedTicket}</span> created. 
                Our team will respond within 24 hours.
              </p>
            </div>
          )}
          
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-amber-500 text-slate-900 rounded-tr-sm'
                    : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-slate-700' : 'text-slate-500'
                  }`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            
            {/* Streaming message */}
            {streamingMessage && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-slate-800 text-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5">
                  <p className="text-sm whitespace-pre-wrap">{streamingMessage}</p>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && !streamingMessage && (
              <div className="flex justify-start">
                <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions (show only at start) */}
            {messages.length <= 1 && !isLoading && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-slate-500">Quick options:</p>
                <button 
                  onClick={() => handleQuickAction('warranty')}
                  className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors flex items-center gap-2"
                >
                  <Shield className="w-4 h-4 text-amber-400" />
                  Start a warranty claim
                </button>
                <button 
                  onClick={() => handleQuickAction('track')}
                  className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors flex items-center gap-2"
                >
                  <Package className="w-4 h-4 text-blue-400" />
                  Track my order
                </button>
                <button 
                  onClick={() => handleQuickAction('sizing')}
                  className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors flex items-center gap-2"
                >
                  <Ruler className="w-4 h-4 text-emerald-400" />
                  Help with sizing
                </button>
                <button 
                  onClick={() => handleQuickAction('human')}
                  className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors flex items-center gap-2"
                >
                  <User className="w-4 h-4 text-purple-400" />
                  Talk to a human
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
          
          {/* Input */}
          <div className="p-3 border-t border-slate-700 flex-shrink-0">
            <div className="flex gap-2">
              <input 
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 disabled:opacity-50"
              />
              <button 
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 font-medium rounded-xl transition-colors"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 font-semibold rounded-full shadow-lg shadow-amber-500/30 transition-all hover:shadow-amber-500/50 hover:scale-105"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="hidden sm:inline">Chat with us</span>
        </button>
      )}
    </div>
  )
}

