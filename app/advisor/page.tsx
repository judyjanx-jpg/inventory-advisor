'use client'

import { useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { MessageSquare, Send, Sparkles, Lightbulb, Package, TrendingUp, AlertTriangle } from 'lucide-react'

const QUICK_ACTIONS = [
  {
    icon: AlertTriangle,
    label: 'Check low stock',
    prompt: 'Which products are running low on stock and need to be reordered?',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
  },
  {
    icon: TrendingUp,
    label: 'Sales analysis',
    prompt: 'Analyze my sales performance for the last 30 days.',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
  },
  {
    icon: Package,
    label: 'Create PO',
    prompt: 'Help me create a purchase order for products that need restocking.',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
  },
  {
    icon: Lightbulb,
    label: 'Recommendations',
    prompt: 'What are your top recommendations to improve my inventory management?',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
]

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function AdvisorPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const sendMessage = async (prompt?: string) => {
    const messageText = prompt || input
    if (!messageText.trim()) return

    const userMessage: Message = { role: 'user', content: messageText }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    // Simulate AI response - in production this would call your AI API
    setTimeout(() => {
      const assistantMessage: Message = {
        role: 'assistant',
        content: getSimulatedResponse(messageText),
      }
      setMessages(prev => [...prev, assistantMessage])
      setLoading(false)
    }, 1500)
  }

  const getSimulatedResponse = (prompt: string): string => {
    const lower = prompt.toLowerCase()
    
    if (lower.includes('low stock') || lower.includes('reorder')) {
      return "I've analyzed your inventory levels. Currently, you have 3 products that need attention:\n\n1. **MJBC116** - 18K Gold Chain (15 days of stock remaining)\n2. **MJBC118** - Silver Pendant (12 days of stock remaining)\n3. **MJBC122** - Pearl Earrings (18 days of stock remaining)\n\nWould you like me to create a purchase order for these items?"
    }
    
    if (lower.includes('sales') || lower.includes('performance')) {
      return "Here's your sales analysis for the last 30 days:\n\n📈 **Total Revenue:** $45,230\n📦 **Units Sold:** 892\n💰 **Profit Margin:** 34%\n\nTop performing products:\n1. MJBC116 - 245 units ($12,400)\n2. MJBC120 - 189 units ($8,900)\n3. MJBC115 - 156 units ($7,200)\n\nYour sales are up 12% compared to last month!"
    }
    
    if (lower.includes('purchase order') || lower.includes('po')) {
      return "I can help you create a purchase order. Based on your current stock levels and sales velocity, I recommend ordering:\n\n• MJBC116: 500 units (45-day supply)\n• MJBC118: 300 units (45-day supply)\n• MJBC122: 200 units (45-day supply)\n\nEstimated total: $3,500\n\nShall I create this PO for your primary supplier?"
    }
    
    if (lower.includes('recommend')) {
      return "Here are my top recommendations:\n\n1. **Increase safety stock** for MJBC116 - it's your best seller but often runs low\n\n2. **Review pricing** on MJBC119 - competitor analysis shows you could increase price by 10%\n\n3. **Bundle opportunity** - MJBC116 and MJBC118 are often bought together, consider creating a bundle\n\n4. **Supplier diversification** - 80% of your products come from one supplier, consider adding a backup\n\nWould you like me to elaborate on any of these?"
    }
    
    return "I'm your inventory advisor. I can help you with:\n\n• Analyzing stock levels and reorder needs\n• Creating purchase orders\n• Sales performance analysis\n• Inventory optimization recommendations\n• Forecasting and planning\n\nWhat would you like to know?"
  }

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">AI Advisor</h1>
            <p className="text-slate-400">Your intelligent inventory assistant</p>
          </div>
        </div>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center mb-6">
                  <MessageSquare className="w-10 h-10 text-cyan-400" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">How can I help you today?</h2>
                <p className="text-slate-400 max-w-md mb-8">
                  Ask me about your inventory, sales, or get recommendations to optimize your business.
                </p>
                
                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                  {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.label}
                        onClick={() => sendMessage(action.prompt)}
                        className="flex items-center gap-3 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-xl text-left transition-all"
                      >
                        <div className={`w-10 h-10 ${action.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-5 h-5 ${action.color}`} />
                        </div>
                        <span className="text-sm text-slate-300">{action.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                          : 'bg-slate-800 text-slate-200 border border-slate-700/50'
                      }`}
                    >
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 text-slate-400 rounded-2xl px-5 py-3 border border-slate-700/50">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          {/* Input Area */}
          <div className="border-t border-slate-700/50 p-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask me anything about your inventory..."
                className="flex-1 px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <Button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="px-4 py-3"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </MainLayout>
  )
}
