'use client'

import { Card, CardHeader, CardTitle } from '@/components/ui/Card'

interface Tool {
  id: number
  title: string
  config: {
    source: string
    filters: Array<{ field: string; operator: string; value: any }>
    columns: string[]
    sort?: { field: string; order: string }
    limit?: number
  }
}

export default function FilteredListTool({ tool }: { tool: Tool }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tool.title}</CardTitle>
      </CardHeader>
      <div className="p-4">
        <p className="text-[var(--muted-foreground)] text-sm">
          Filtered list coming soon. Source: {tool.config.source}
        </p>
      </div>
    </Card>
  )
}

