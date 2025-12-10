'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Target, Plus, Check, Trash2, Loader2, X } from 'lucide-react'

interface Goal {
  id: number
  title: string
  goalType: string
  targetValue: number | null
  currentValue: number | null
  unit: string | null
  periodType: string
  isCompleted: boolean
  color: string
}

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444']

export default function GoalsCard() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', targetValue: '', color: '#0ea5e9' })

  useEffect(() => {
    fetchGoals()
  }, [])

  const fetchGoals = async () => {
    try {
      const res = await fetch('/api/dashboard/goals')
      const data = await res.json()
      if (data.success) setGoals(data.goals || [])
    } catch (error) {
      console.error('Error fetching goals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          targetValue: form.targetValue ? parseFloat(form.targetValue) : null,
          color: form.color
        })
      })
      const data = await res.json()
      if (data.success) {
        setGoals(prev => [...prev, data.goal])
        setForm({ title: '', targetValue: '', color: '#0ea5e9' })
        setShowForm(false)
      }
    } catch (error) {
      console.error('Error creating goal:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (goal: Goal) => {
    try {
      const res = await fetch(`/api/dashboard/goals/${goal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !goal.isCompleted })
      })
      if ((await res.json()).success) {
        setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, isCompleted: !g.isCompleted } : g))
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      if ((await (await fetch(`/api/dashboard/goals/${id}`, { method: 'DELETE' })).json()).success) {
        setGoals(prev => prev.filter(g => g.id !== id))
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-[var(--primary)]" />
            My List
          </CardTitle>
          <button onClick={() => setShowForm(!showForm)} className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--muted-foreground)]">
            {showForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-2 p-3 bg-[var(--muted)]/30 rounded-xl">
            <input
              type="text"
              placeholder="Add item (e.g., Research new supplier, Hit $50k revenue)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--input)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Target (optional)"
                value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                className="flex-1 px-3 py-2 bg-[var(--input)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm"
              />
              <div className="flex gap-1">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                    className={`w-6 h-6 rounded-full ${form.color === c ? 'ring-2 ring-white/50 scale-110' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <button type="submit" disabled={saving || !form.title.trim()}
              className="w-full px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Item
            </button>
          </form>
        )}
        {loading ? (
          <div className="animate-pulse space-y-2">{[1, 2].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-lg" />)}</div>
        ) : goals.length === 0 ? (
          <div className="text-center py-4 text-[var(--muted-foreground)] text-sm">No items yet. Click + to add one!</div>
        ) : (
          goals.map(goal => (
            <div key={goal.id} className={`p-3 rounded-lg border ${goal.isCompleted ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[var(--card)] border-[var(--border)]'}`}>
              <div className="flex items-center gap-3">
                <button onClick={() => handleToggle(goal)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${goal.isCompleted ? 'bg-emerald-500 border-emerald-500' : 'border-[var(--border)]'}`}>
                  {goal.isCompleted && <Check className="w-3 h-3 text-white" />}
                </button>
                <div className="flex-1">
                  <span className={`text-sm font-medium ${goal.isCompleted ? 'line-through text-[var(--muted-foreground)]' : 'text-[var(--foreground)]'}`}>
                    {goal.title}
                  </span>
                </div>
                <button onClick={() => handleDelete(goal.id)} className="p-1 text-[var(--muted-foreground)] hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

