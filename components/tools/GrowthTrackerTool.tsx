'use client'

import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { TrendingUp, ThumbsUp, ThumbsDown } from 'lucide-react'

interface Tool {
  id: number
  title: string
  config: {
    description?: string
    skus: string[]
    readyThreshold: {
      velocityMultiplier: number
      daysOfStock: number
    }
    display: {
      readyIcon: string
      readyLabel: string
      notReadyIcon: string
      notReadyLabel: string
      showPoButton: boolean
    }
  }
}

export default function GrowthTrackerTool({ tool }: { tool: Tool }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          {tool.title}
        </CardTitle>
      </CardHeader>
      <div className="p-4 space-y-3">
        {tool.config.description && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {tool.config.description}
          </p>
        )}
        {tool.config.skus.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No SKUs added yet. Ask the AI to add SKUs to track.
          </p>
        ) : (
          <div className="space-y-2">
            {tool.config.skus.map((sku, i) => (
              <div
                key={i}
                className="p-3 bg-[var(--muted)]/30 rounded-lg border border-[var(--border)]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--foreground)]">{sku}</span>
                  <div className="flex items-center gap-2">
                    <ThumbsUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-emerald-400">
                      {tool.config.display.readyLabel}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  67 days of stock at {tool.config.readyThreshold.velocityMultiplier}x velocity
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

