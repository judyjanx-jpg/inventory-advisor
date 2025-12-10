'use client'

import { Card, CardHeader, CardTitle } from '@/components/ui/Card'

interface Tool {
  id: number
  title: string
  config: {
    queryType: string
    days?: number
    chartType?: string
  }
}

export default function ChartTool({ tool }: { tool: Tool }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tool.title}</CardTitle>
      </CardHeader>
      <div className="p-4">
        <p className="text-[var(--muted-foreground)] text-sm">
          Chart visualization coming soon. Type: {tool.config.chartType || 'bar'}
        </p>
      </div>
    </Card>
  )
}

