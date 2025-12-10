'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Zap, Loader2, Check, X, AlertCircle } from 'lucide-react'

interface ActionPreview {
  actionId: string
  action: string
  description: string
  changes?: Array<{ field: string; from: any; to: any }>
}

interface AiActionCardProps {
  onActionComplete?: () => void
}

export default function AiActionCard({ onActionComplete }: AiActionCardProps) {
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ActionPreview | null>(null)
  const [clarification, setClarification] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exampleCommands = [
    "Change warehouse qty for SKU-123 to 500",
    "Create a PO for low stock items",
    "Mark PO #1234 as received",
    "Update cost for KISPER-001 to $4.50",
  ]

  const handleSubmit = async () => {
    if (!command.trim() || loading) return

    setLoading(true)
    setError(null)
    setSuccess(null)
    setPreview(null)
    setClarification(null)

    try {
      const res = await fetch('/api/dashboard/ai/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })
      const data = await res.json()

      if (data.needsClarification) {
        setClarification(data.question)
      } else if (data.preview) {
        setPreview(data.preview)
      } else if (data.error) {
        setError(data.error)
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview?.actionId) return

    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/ai/action/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: preview.actionId }),
      })
      const data = await res.json()

      if (data.success) {
        setSuccess(data.message)
        setPreview(null)
        setCommand('')
        onActionComplete?.()
        // Clear success after 5 seconds
        setTimeout(() => setSuccess(null), 5000)
      } else {
        setError(data.error || 'Action failed.')
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setPreview(null)
    setClarification(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          What would you like to do?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input Area */}
        <div className="relative">
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="Tell me what you'd like to do..."
            rows={2}
            disabled={!!preview}
            className="w-full px-4 py-3 bg-[var(--input)] border border-[var(--border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50"
          />
          {!preview && (
            <button
              onClick={handleSubmit}
              disabled={loading || !command.trim()}
              className="absolute right-3 bottom-3 px-4 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Do It
                </>
              )}
            </button>
          )}
        </div>

        {/* Example Commands */}
        {!preview && !clarification && !success && !error && (
          <div className="flex flex-wrap gap-2">
            {exampleCommands.map((example, i) => (
              <button
                key={i}
                onClick={() => setCommand(example)}
                className="text-xs px-3 py-1.5 bg-[var(--muted)]/50 text-[var(--muted-foreground)] rounded-full hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {/* Clarification */}
        {clarification && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[var(--foreground)]">{clarification}</p>
                <input
                  type="text"
                  placeholder="Type your response..."
                  className="mt-2 w-full px-3 py-2 bg-[var(--input)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setCommand(command + ' ' + (e.target as HTMLInputElement).value)
                      setClarification(null)
                      handleSubmit()
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
            <h4 className="font-medium text-[var(--foreground)]">Confirm Action</h4>
            <p className="text-[var(--muted-foreground)]">{preview.description}</p>
            
            {preview.changes && preview.changes.length > 0 && (
              <div className="bg-[var(--muted)]/30 rounded-lg p-3 space-y-1">
                {preview.changes.map((change, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--muted-foreground)]">{change.field}:</span>
                    <span className="text-red-400 line-through">{change.from}</span>
                    <span className="text-[var(--muted-foreground)]">→</span>
                    <span className="text-emerald-400">{change.to}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Confirm
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="px-4 py-2 bg-[var(--muted)] text-[var(--foreground)] rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-400" />
            <span className="text-emerald-400">{success}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

