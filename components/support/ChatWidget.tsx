'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, Shield, Package, Ruler, User } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatWidgetProps {
  orderContext?: string
}

export default function ChatWidget({ orderContext }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [streamingMessage, setStreamingMessage] = useState('')
  const [escalatedTicket, setEscalatedTicket] = useState<string | null>(null)
  const [brandColor, setBrandColor] = useState('#10b981')
  const [brandName, setBrandName] = useState('Support')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch branding
  useEffect(() => {
    fetch('/api/settings/branding')
      .then(res => res.json())
      .then(data => {
        if (data.branding) {
          setBrandColor(data.branding.primaryColor || '#10b981')
          setBrandName(data.branding.brandName || 'Support')
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingMessage])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true)
    window.addEventListener('openChat', handleOpenChat)
    return () => window.removeEventListener('openChat', handleOpenChat)
  }, [])

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Hi there! 👋 I'm your ${brandName} support assistant. How can I help you today?`,
        timestamp: new Date(),
      }])
    }
  }, [isOpen, messages.length, brandName])

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
        body: JSON.stringify({ sessionId, message: userMessage.content, orderContext }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send message')
      }

      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('text/event-stream')) {
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
                  if (data.done && data.sessionId) {
                    setSessionId(data.sessionId)
                  }
                  if (data.error) throw new Error(data.error)
                } catch (e) {}
              }
            }
          }
        }

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
        const data = await response.json()
        if (data.sessionId) setSessionId(data.sessionId)
        if (data.escalated && data.ticketNumber) setEscalatedTicket(data.ticketNumber)
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
      case 'warranty': setInput("I need help with a warranty claim"); break
      case 'track': setInput("How do I track my order?"); break
      case 'sizing': setInput("I need help with sizing"); break
      case 'human': setInput("I'd like to speak with a human"); break
    }
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Parse markdown links [text](url) into clickable links
  const renderMessageContent = (content: string) => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    const parts: (string | JSX.Element)[] = []
    let lastIndex = 0
    let match

    while ((match = linkRegex.exec(content)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index))
      }
      
      // Add the link
      const [, linkText, linkUrl] = match
      parts.push(
        <a
          key={match.index}
          href={linkUrl}
          target={linkUrl.startsWith('http') ? '_blank' : '_self'}
          rel={linkUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="underline font-medium hover:opacity-80"
          style={{ color: 'inherit' }}
        >
          {linkText}
        </a>
      )
      
      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex))
    }

    return parts.length > 0 ? parts : content
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <div className="w-80 sm:w-96 h-[550px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 text-white flex-shrink-0" style={{ backgroundColor: brandColor }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">{brandName} Support</h4>
                <p className="text-xs opacity-80">
                  {isLoading ? 'Typing...' : 'We typically reply instantly'}
                </p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Escalation Notice */}
          {escalatedTicket && (
            <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 flex-shrink-0">
              <p className="text-xs text-purple-700">
                Ticket <span className="font-mono font-semibold">{escalatedTicket}</span> created. Our team will respond within 24 hours.
              </p>
            </div>
          )}
          
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'text-white rounded-tr-sm'
                    : 'bg-white text-gray-800 rounded-tl-sm shadow-sm border border-gray-100'
                }`} style={msg.role === 'user' ? { backgroundColor: brandColor } : undefined}>
                  <p className="text-sm whitespace-pre-wrap">{renderMessageContent(msg.content)}</p>
                  <p className={`text-xs mt-1 ${msg.role === 'user' ? 'opacity-70' : 'text-gray-400'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            
            {streamingMessage && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-white text-gray-800 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm border border-gray-100">
                  <p className="text-sm whitespace-pre-wrap">{renderMessageContent(streamingMessage)}</p>
                </div>
              </div>
            )}

            {isLoading && !streamingMessage && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {messages.length <= 1 && !isLoading && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-gray-500">Quick options:</p>
                <button onClick={() => handleQuickAction('warranty')} className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 transition-colors flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  Start a warranty claim
                </button>
                <button onClick={() => handleQuickAction('track')} className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 transition-colors flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-500" />
                  Track my order
                </button>
                <button onClick={() => handleQuickAction('sizing')} className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 transition-colors flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-amber-500" />
                  Help with sizing
                </button>
                <button onClick={() => handleQuickAction('human')} className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 transition-colors flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-500" />
                  Talk to a human
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
          
          {/* Input */}
          <div className="p-3 border-t border-gray-200 bg-white flex-shrink-0">
            <div className="flex gap-2">
              <input 
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50"
                style={{ ['--tw-ring-color' as any]: brandColor + '40' }}
              />
              <button 
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="px-4 py-2.5 text-white font-medium rounded-xl transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                style={{ backgroundColor: !input.trim() || isLoading ? undefined : brandColor }}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-3 px-5 py-3 text-white font-semibold rounded-full shadow-lg transition-all hover:scale-105"
          style={{ backgroundColor: brandColor }}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="hidden sm:inline">Chat with us</span>
        </button>
      )}
    </div>
  )
}
