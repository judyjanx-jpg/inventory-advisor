'use client'

import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Zap } from 'lucide-react'

interface Tool {
  id: number
  title: string
  config: {
    action: string
    params: any
    confirmFirst?: boolean
    buttonLabel?: string
  }
}

export default function QuickActionTool({ tool }: { tool: Tool }) {
  const handleAction = async () => {
    if (tool.config.confirmFirst) {
      if (!confirm(`Execute: ${tool.title}?`)) return
    }

    // TODO: Execute the action via API
    console.log('Executing action:', tool.config.action, tool.config.params)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          {tool.title}
        </CardTitle>
      </CardHeader>
      <div className="p-4">
        <button
          onClick={handleAction}
          className="w-full px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          {tool.config.buttonLabel || 'Execute'}
        </button>
      </div>
    </Card>
  )
}

