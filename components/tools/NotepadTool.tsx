'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Save } from 'lucide-react'

interface Tool {
  id: number
  title: string
  config: {
    content: string
    autoSave?: boolean
  }
}

export default function NotepadTool({ tool }: { tool: Tool }) {
  const [content, setContent] = useState(tool.config.content || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setContent(tool.config.content || '')
  }, [tool.config.content])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch(`/api/user-tools/${tool.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...tool.config,
            content
          }
        })
      })
    } catch (error) {
      console.error('Error saving notepad:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{tool.title}</CardTitle>
          <button
            onClick={handleSave}
            disabled={saving}
            className="p-1.5 hover:bg-[var(--hover-bg)] rounded-lg transition-colors disabled:opacity-50"
            title="Save"
          >
            <Save className="w-4 h-4 text-[var(--muted-foreground)]" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            if (tool.config.autoSave) {
              // Debounce auto-save
              clearTimeout((window as any).notepadSaveTimeout)
              ;(window as any).notepadSaveTimeout = setTimeout(handleSave, 1000)
            }
          }}
          placeholder="Write your notes here..."
          className="w-full h-48 px-3 py-2 bg-[var(--input)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
      </CardContent>
    </Card>
  )
}

