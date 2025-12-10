'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { GripVertical, Pencil, Trash2, Plus } from 'lucide-react'
import UserToolRenderer from '@/components/tools/UserToolRenderer'

interface UserTool {
  id: number
  toolType: string
  title: string
  config: any
  size: string
  isActive: boolean
  position: number
}

export default function UserToolsSection() {
  const [tools, setTools] = useState<UserTool[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTools()
  }, [])

  const fetchTools = async () => {
    try {
      const res = await fetch('/api/user-tools')
      const data = await res.json()
      if (data.success) {
        setTools(data.tools)
      }
    } catch (error) {
      console.error('Error fetching tools:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (toolId: number) => {
    if (!confirm('Delete this tool?')) return

    try {
      const res = await fetch(`/api/user-tools/${toolId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        fetchTools()
      }
    } catch (error) {
      console.error('Error deleting tool:', error)
    }
  }

  if (loading) {
    return null
  }

  if (tools.length === 0) {
    return (
      <div className="mt-8">
        <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <span>🧰</span> My Tools
        </h2>
        <Card className="p-8 text-center">
          <p className="text-[var(--muted-foreground)] mb-2">
            No custom tools yet.
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">
            Ask the AI orb to create one! Try: "Create a Growth SKUs tracker" or "Add a notepad"
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
        <span>🧰</span> My Tools
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool) => (
          <div key={tool.id} className="relative group">
            <div className="absolute -left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
              <button
                className="p-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:bg-[var(--hover-bg)] transition-colors"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
              </button>
              <button
                onClick={() => handleDelete(tool.id)}
                className="p-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:bg-red-500/20 hover:border-red-500/50 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
            <UserToolRenderer tool={tool} />
          </div>
        ))}
      </div>
    </div>
  )
}

