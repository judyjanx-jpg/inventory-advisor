'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Loader2 } from 'lucide-react'

interface Tool {
  id: number
  title: string
  config: {
    queryType: string
    limit?: number
    display?: string
    columns?: string[]
    refreshMinutes?: number
  }
}

export default function DataCardTool({ tool }: { tool: Tool }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [tool.config.queryType])

  const fetchData = async () => {
    setLoading(true)
    try {
      // TODO: Implement query execution based on queryType
      // This would call a backend service that executes predefined queries
      await new Promise(resolve => setTimeout(resolve, 500)) // Simulate API call
      setData([])
    } catch (error) {
      console.error('Error fetching tool data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{tool.title}</CardTitle>
        </CardHeader>
        <div className="p-4 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--muted-foreground)]" />
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tool.title}</CardTitle>
      </CardHeader>
      <div className="p-4">
        {data.length === 0 ? (
          <p className="text-[var(--muted-foreground)] text-sm">No data available</p>
        ) : (
          <div className="space-y-2">
            {/* Render data based on display type */}
            {tool.config.display === 'list' && (
              <ul className="space-y-1">
                {data.map((item, i) => (
                  <li key={i} className="text-sm text-[var(--foreground)]">
                    {JSON.stringify(item)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

