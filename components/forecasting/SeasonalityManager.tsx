'use client'

import { useState, useEffect } from 'react'
import {
  Calendar, Plus, Edit3, Trash2, RefreshCw, Zap,
  ChevronDown, ChevronUp, X, Check, Info
} from 'lucide-react'

interface SeasonalEvent {
  id: number
  name: string
  eventType: string
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
  baseMultiplier: number
  learnedMultiplier: number | null
  isActive: boolean
  skuMultipliers: Record<string, number>
  // Computed
  eventDate?: Date
  daysUntil?: number
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const EVENT_TYPES = [
  { value: 'holiday', label: 'Holiday', color: 'text-red-400' },
  { value: 'promo', label: 'Promotion', color: 'text-orange-400' },
  { value: 'seasonal', label: 'Seasonal', color: 'text-blue-400' },
  { value: 'custom', label: 'Custom', color: 'text-purple-400' },
]

const DEFAULT_EVENTS = [
  { name: "Valentine's Day", startMonth: 2, startDay: 14, endMonth: 2, endDay: 14, baseMultiplier: 1.5, eventType: 'holiday' },
  { name: "Mother's Day", startMonth: 5, startDay: 12, endMonth: 5, endDay: 12, baseMultiplier: 1.8, eventType: 'holiday' },
  { name: "Father's Day", startMonth: 6, startDay: 16, endMonth: 6, endDay: 16, baseMultiplier: 1.4, eventType: 'holiday' },
  { name: "Prime Day", startMonth: 7, startDay: 16, endMonth: 7, endDay: 17, baseMultiplier: 2.5, eventType: 'promo' },
  { name: "Back to School", startMonth: 8, startDay: 1, endMonth: 9, endDay: 15, baseMultiplier: 1.3, eventType: 'seasonal' },
  { name: "Halloween", startMonth: 10, startDay: 15, endMonth: 10, endDay: 31, baseMultiplier: 1.4, eventType: 'holiday' },
  { name: "Black Friday", startMonth: 11, startDay: 29, endMonth: 11, endDay: 29, baseMultiplier: 3.0, eventType: 'promo' },
  { name: "Cyber Monday", startMonth: 12, startDay: 2, endMonth: 12, endDay: 2, baseMultiplier: 2.5, eventType: 'promo' },
  { name: "Christmas", startMonth: 12, startDay: 1, endMonth: 12, endDay: 25, baseMultiplier: 2.0, eventType: 'holiday' },
]

export default function SeasonalityManager() {
  const [events, setEvents] = useState<SeasonalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<SeasonalEvent | null>(null)
  const [newEvent, setNewEvent] = useState({
    name: '',
    eventType: 'custom',
    startMonth: 1,
    startDay: 1,
    endMonth: 1,
    endDay: 1,
    baseMultiplier: 1.5,
  })

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/forecasting/seasonality?action=events')
      const data = await response.json()
      if (data.success && data.data.length > 0) {
        setEvents(enrichEvents(data.data))
      } else {
        // Use default events if none exist
        setEvents(enrichEvents(DEFAULT_EVENTS.map((e, i) => ({
          id: i + 1,
          ...e,
          learnedMultiplier: null,
          isActive: true,
          skuMultipliers: {},
        }))))
      }
    } catch (error) {
      console.error('Failed to fetch events:', error)
      // Fallback to defaults
      setEvents(enrichEvents(DEFAULT_EVENTS.map((e, i) => ({
        id: i + 1,
        ...e,
        learnedMultiplier: null,
        isActive: true,
        skuMultipliers: {},
      }))))
    } finally {
      setLoading(false)
    }
  }

  const enrichEvents = (eventList: SeasonalEvent[]): SeasonalEvent[] => {
    const today = new Date()
    return eventList.map(event => {
      let eventDate = new Date(today.getFullYear(), event.startMonth - 1, event.startDay)
      if (eventDate < today) {
        eventDate = new Date(today.getFullYear() + 1, event.startMonth - 1, event.startDay)
      }
      const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return { ...event, eventDate, daysUntil }
    }).sort((a, b) => (a.daysUntil || 999) - (b.daysUntil || 999))
  }

  const createEvent = async () => {
    try {
      const response = await fetch('/api/forecasting/seasonality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-event', ...newEvent }),
      })
      const data = await response.json()
      if (data.success) {
        fetchEvents()
        setShowAddForm(false)
        setNewEvent({
          name: '',
          eventType: 'custom',
          startMonth: 1,
          startDay: 1,
          endMonth: 1,
          endDay: 1,
          baseMultiplier: 1.5,
        })
      }
    } catch (error) {
      console.error('Failed to create event:', error)
    }
  }

  const updateEvent = async (eventId: number, updates: Partial<SeasonalEvent>) => {
    try {
      const response = await fetch('/api/forecasting/seasonality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-event', eventId, ...updates }),
      })
      const data = await response.json()
      if (data.success) {
        fetchEvents()
        setEditingEvent(null)
      }
    } catch (error) {
      console.error('Failed to update event:', error)
    }
  }

  const deleteEvent = async (eventId: number) => {
    if (!confirm('Are you sure you want to delete this event?')) return
    try {
      const response = await fetch('/api/forecasting/seasonality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-event', eventId }),
      })
      const data = await response.json()
      if (data.success) {
        fetchEvents()
      }
    } catch (error) {
      console.error('Failed to delete event:', error)
    }
  }

  const toggleEventActive = async (eventId: number, isActive: boolean) => {
    await updateEvent(eventId, { isActive: !isActive })
  }

  const getEventTypeConfig = (type: string) => {
    return EVENT_TYPES.find(t => t.value === type) || EVENT_TYPES[3]
  }

  const formatDateRange = (event: SeasonalEvent) => {
    const startMonth = MONTHS[event.startMonth - 1]?.substring(0, 3)
    const endMonth = MONTHS[event.endMonth - 1]?.substring(0, 3)
    if (event.startMonth === event.endMonth && event.startDay === event.endDay) {
      return `${startMonth} ${event.startDay}`
    }
    return `${startMonth} ${event.startDay} - ${endMonth} ${event.endDay}`
  }

  const upcomingEvents = events.filter(e => e.isActive && (e.daysUntil || 999) <= 90)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Upcoming Events Banner */}
      {upcomingEvents.length > 0 && (
        <div className="bg-gradient-to-r from-cyan-900/30 to-purple-900/30 rounded-xl border border-cyan-500/30 p-4">
          <h3 className="text-sm font-medium text-cyan-400 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Upcoming Events (Next 90 Days)
          </h3>
          <div className="flex flex-wrap gap-3">
            {upcomingEvents.map(event => (
              <div
                key={event.id}
                className="flex items-center gap-3 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div>
                  <p className="text-sm font-medium text-white">{event.name}</p>
                  <p className="text-xs text-gray-400">{event.daysUntil} days away</p>
                </div>
                <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs font-medium">
                  +{((event.learnedMultiplier || event.baseMultiplier) - 1) * 100}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-cyan-500" />
            Seasonal Events
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Manage seasonal events and their demand multipliers
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white"
        >
          <Plus className="w-4 h-4" />
          Add Event
        </button>
      </div>

      {/* Add Event Form */}
      {showAddForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-white">New Seasonal Event</h4>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="text-sm text-gray-400 block mb-1">Event Name</label>
              <input
                type="text"
                value={newEvent.name}
                onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                placeholder="e.g., Summer Sale"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Type</label>
              <select
                value={newEvent.eventType}
                onChange={(e) => setNewEvent({ ...newEvent, eventType: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              >
                {EVENT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Multiplier</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="5"
                value={newEvent.baseMultiplier}
                onChange={(e) => setNewEvent({ ...newEvent, baseMultiplier: parseFloat(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Start Month</label>
              <select
                value={newEvent.startMonth}
                onChange={(e) => setNewEvent({ ...newEvent, startMonth: parseInt(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Start Day</label>
              <input
                type="number"
                min="1"
                max="31"
                value={newEvent.startDay}
                onChange={(e) => setNewEvent({ ...newEvent, startDay: parseInt(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">End Month</label>
              <select
                value={newEvent.endMonth}
                onChange={(e) => setNewEvent({ ...newEvent, endMonth: parseInt(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">End Day</label>
              <input
                type="number"
                min="1"
                max="31"
                value={newEvent.endDay}
                onChange={(e) => setNewEvent({ ...newEvent, endDay: parseInt(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"
            >
              Cancel
            </button>
            <button
              onClick={createEvent}
              disabled={!newEvent.name}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded-lg text-white"
            >
              Create Event
            </button>
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900">
            <tr className="text-xs font-medium text-gray-400 uppercase">
              <th className="px-4 py-3 text-left">Event</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-center">Date Range</th>
              <th className="px-4 py-3 text-center">Days Until</th>
              <th className="px-4 py-3 text-center">Base Multiplier</th>
              <th className="px-4 py-3 text-center">Learned Multiplier</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {events.map(event => {
              const typeConfig = getEventTypeConfig(event.eventType)
              const isUpcoming = (event.daysUntil || 999) <= 30

              return (
                <tr key={event.id} className={`hover:bg-slate-700/50 ${!event.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{event.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm ${typeConfig.color}`}>{typeConfig.label}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-300">
                    {formatDateRange(event)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isUpcoming ? (
                      <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-sm font-medium">
                        {event.daysUntil}d
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">{event.daysUntil}d</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-white font-medium">
                      +{((event.baseMultiplier - 1) * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {event.learnedMultiplier ? (
                      <span className="text-green-400 font-medium">
                        +{((event.learnedMultiplier - 1) * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleEventActive(event.id, event.isActive)}
                      className={`px-2 py-1 rounded text-xs font-medium border ${
                        event.isActive
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : 'bg-slate-700 text-gray-400 border-slate-600'
                      }`}
                    >
                      {event.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setEditingEvent(event)}
                        className="p-1.5 hover:bg-slate-600 rounded text-gray-400 hover:text-white"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteEvent(event.id)}
                        className="p-1.5 hover:bg-slate-600 rounded text-gray-400 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Info Box */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-400">
            <p className="text-gray-300 font-medium mb-1">How Seasonal Multipliers Work</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Base Multiplier:</strong> Your estimated demand increase during this event</li>
              <li><strong>Learned Multiplier:</strong> Automatically calculated from historical data (more accurate)</li>
              <li>The system will use the learned multiplier when available, falling back to the base multiplier</li>
              <li>SKU-specific multipliers can be set if certain products perform differently during events</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-white">Edit Event: {editingEvent.name}</h4>
              <button onClick={() => setEditingEvent(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Event Name</label>
                <input
                  type="text"
                  value={editingEvent.name}
                  onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Type</label>
                  <select
                    value={editingEvent.eventType}
                    onChange={(e) => setEditingEvent({ ...editingEvent, eventType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    {EVENT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Base Multiplier</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="5"
                    value={editingEvent.baseMultiplier}
                    onChange={(e) => setEditingEvent({ ...editingEvent, baseMultiplier: parseFloat(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setEditingEvent(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => updateEvent(editingEvent.id, {
                  name: editingEvent.name,
                  eventType: editingEvent.eventType,
                  baseMultiplier: editingEvent.baseMultiplier,
                })}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
