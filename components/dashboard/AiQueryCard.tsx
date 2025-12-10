'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Search, Loader2, BarChart3, Table, MessageSquare } from 'lucide-react'

interface QueryResult {
  answer: string
  visualization?: {
    type: 'table' | 'chart' | 'text'
    data?: any[]
    columns?: string[]
  }
  followUp?: string
}

export default function AiQueryCard() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exampleQueries = [
    "What are my top 5 selling SKUs this month?",
    "Which products have the lowest profit margin?",
    "Show me SKUs that haven't sold in 30 days",
    "How does this week compare to last week?",
  ]

  const handleSubmit = async () => {
    if (!query.trim() || loading) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/dashboard/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
      })
      const data = await res.json()

      if (data.success) {
        setResult(data)
      } else {
        setError(data.error || 'Unable to process your question.')
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const renderVisualization = () => {
    if (!result?.visualization) return null

    if (result.visualization.type === 'table' && result.visualization.data) {
      return (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {result.visualization.columns?.map((col, i) => (
                  <th key={i} className="text-left py-2 px-3 text-[var(--muted-foreground)] font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.visualization.data.map((row, i) => (
                <tr key={i} className="border-b border-[var(--border)]/50">
                  {Object.values(row).map((val: any, j) => (
                    <td key={j} className="py-2 px-3 text-[var(--foreground)]">
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5 text-[var(--primary)]" />
          What would you like to see?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input Area */}
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Ask me anything about your data..."
            rows={2}
            className="w-full px-4 py-3 bg-[var(--input)] border border-[var(--border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !query.trim()}
            className="absolute right-3 bottom-3 px-4 py-1.5 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Ask
              </>
            )}
          </button>
        </div>

        {/* Example Queries */}
        {!result && !error && (
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((example, i) => (
              <button
                key={i}
                onClick={() => setQuery(example)}
                className="text-xs px-3 py-1.5 bg-[var(--muted)]/50 text-[var(--muted-foreground)] rounded-full hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="p-4 bg-[var(--muted)]/30 rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-[var(--primary)] mt-0.5 flex-shrink-0" />
              <p className="text-[var(--foreground)] whitespace-pre-wrap">{result.answer}</p>
            </div>
            
            {renderVisualization()}

            {result.followUp && (
              <button
                onClick={() => setQuery(result.followUp!)}
                className="text-sm text-[var(--primary)] hover:underline"
              >
                {result.followUp}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

