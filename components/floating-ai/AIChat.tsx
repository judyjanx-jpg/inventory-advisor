'use client'

import { useState, useRef, useEffect } from 'react'
import AIMessage from './AIMessage'
import AIInput from './AIInput'
import AIThinking from './AIThinking'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  data?: any
  visualization?: any
  actionPreview?: any
  toolCreated?: any
  featureRequest?: any
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isThinking])

  const handleSend = async (input: string) => {
    if (!input.trim() || isThinking) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setIsThinking(true)

    try {
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input })
      })

      const data = await res.json()

      if (data.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.answer || data.message || 'Done!',
          timestamp: new Date(),
          data: data.data,
          visualization: data.visualization,
          actionPreview: data.preview,
          toolCreated: data.toolCreated,
          featureRequest: data.featureRequest
        }

        setMessages(prev => [...prev, assistantMessage])
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.error || 'Sorry, something went wrong. Please try again.',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsThinking(false)
    }
  }

  const handleActionConfirm = async (actionId: string) => {
    setIsThinking(true)
    try {
      const res = await fetch('/api/ai/assist/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId })
      })

      const data = await res.json()

      if (data.success) {
        const confirmMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.message || 'Done! ✓',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, confirmMessage])
      }
    } catch (error) {
      // Handle error
    } finally {
      setIsThinking(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 scroll-smooth [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:bg-indigo-500/30 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-indigo-500/50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-5 py-10">
            <p className="text-white/70 text-sm mb-5">
              Ask me anything about your inventory, sales, or business!
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => handleSend("What are my top 5 sellers?")}
                className="px-4 py-2 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-white/80 text-xs hover:bg-indigo-500/30 hover:border-indigo-500/50 transition-all hover:-translate-y-0.5"
              >
                Top sellers
              </button>
              <button
                onClick={() => handleSend("Create a PO for low stock items")}
                className="px-4 py-2 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-white/80 text-xs hover:bg-indigo-500/30 hover:border-indigo-500/50 transition-all hover:-translate-y-0.5"
              >
                Create PO
              </button>
              <button
                onClick={() => handleSend("Check inventory levels")}
                className="px-4 py-2 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-white/80 text-xs hover:bg-indigo-500/30 hover:border-indigo-500/50 transition-all hover:-translate-y-0.5"
              >
                Check inventory
              </button>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <AIMessage
            key={message.id}
            message={message}
            onActionConfirm={handleActionConfirm}
          />
        ))}

        {isThinking && <AIThinking />}
        <div ref={messagesEndRef} />
      </div>

      <AIInput onSend={handleSend} disabled={isThinking} />
    </div>
  )
}
