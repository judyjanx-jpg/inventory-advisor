'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  Sparkles,
  Pencil,
  X,
  Clock,
  Trash2
} from 'lucide-react'

interface ScheduleDay {
  dayOfWeek: number
  isWorking: boolean
  startTime: string | null
  endTime: string | null
}

interface CalendarEvent {
  id: number
  title: string
  eventType: string
  startDate: string
  startTime: string | null
  endTime: string | null
  isAllDay: boolean
  description: string | null
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ScheduleCard() {
  const [schedule, setSchedule] = useState<ScheduleDay[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ isWorking: true, startTime: '09:00', endTime: '17:00' })
  const [saving, setSaving] = useState(false)
  const [showWorkHours, setShowWorkHours] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [deletingEvent, setDeletingEvent] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [editEventForm, setEditEventForm] = useState({
    title: '',
    startDate: '',
    startTime: '',
    endTime: '',
    isAllDay: false
  })
  const [savingEvent, setSavingEvent] = useState(false)
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  const [scheduleTimezone, setScheduleTimezone] = useState('America/New_York')
  const [deletingTestReminders, setDeletingTestReminders] = useState(false)

  useEffect(() => {
    fetchSchedule()
    checkAiAvailability()
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [currentMonth])

  const checkAiAvailability = async () => {
    try {
      // Try to check if AI is available by making a test request
      // The API will return 503 if ANTHROPIC_API_KEY is not configured
      const res = await fetch('/api/dashboard/schedule/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'test' })
      })
      setAiAvailable(res.status !== 503)
    } catch {
      setAiAvailable(false)
    }
  }

  const fetchSchedule = async () => {
    try {
      const res = await fetch('/api/dashboard/schedule')
      const data = await res.json()
      if (data.success) {
        setSchedule(data.schedule || [])
      }
    } catch (error) {
      console.error('Error fetching schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchEvents = async () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    try {
      const res = await fetch(`/api/dashboard/events?year=${year}&month=${month}`)
      const data = await res.json()
      if (data.success) {
        setEvents(data.events || [])
      }
    } catch (error) {
      console.error('Error fetching events:', error)
    }
  }

  const handleEditDay = (dayOfWeek: number) => {
    const daySchedule = schedule.find(s => s.dayOfWeek === dayOfWeek)
    setEditForm({
      isWorking: daySchedule?.isWorking ?? true,
      startTime: daySchedule?.startTime || '09:00',
      endTime: daySchedule?.endTime || '17:00'
    })
    setEditingDay(dayOfWeek)
  }

  const handleSaveDay = async () => {
    if (editingDay === null) return
    
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayOfWeek: editingDay,
          isWorking: editForm.isWorking,
          startTime: editForm.isWorking ? editForm.startTime : null,
          endTime: editForm.isWorking ? editForm.endTime : null
        })
      })
      const data = await res.json()
      if (data.success) {
        setSchedule(prev => {
          const existing = prev.findIndex(s => s.dayOfWeek === editingDay)
          const newDay = {
            dayOfWeek: editingDay,
            isWorking: editForm.isWorking,
            startTime: editForm.isWorking ? editForm.startTime : null,
            endTime: editForm.isWorking ? editForm.endTime : null
          }
          if (existing >= 0) {
            const updated = [...prev]
            updated[existing] = newDay
            return updated
          }
          return [...prev, newDay]
        })
        setEditingDay(null)
      }
    } catch (error) {
      console.error('Error saving schedule:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEvent = async (eventId: number) => {
    setDeletingEvent(true)
    try {
      const res = await fetch(`/api/dashboard/events?id=${eventId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setEvents(prev => prev.filter(e => e.id !== eventId))
        setSelectedEvent(null)
        setSelectedDate(null)
        setEditingEvent(null)
        // Trigger refresh of dashboard tasks
        window.dispatchEvent(new CustomEvent('dashboard-refresh'))
      }
    } catch (error) {
      console.error('Error deleting event:', error)
    } finally {
      setDeletingEvent(false)
    }
  }

  const handleDeleteTestReminders = async () => {
    if (!confirm('Delete all test reminders? This cannot be undone.')) return
    
    setDeletingTestReminders(true)
    try {
      const res = await fetch(`/api/dashboard/events?deleteTest=true`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setEvents(prev => prev.filter(e => !e.title.toLowerCase().includes('test')))
        fetchEvents()
        // Trigger refresh of dashboard tasks
        window.dispatchEvent(new CustomEvent('dashboard-refresh'))
        setAiResponse(`Deleted ${data.message || 'test reminders'}`)
        setTimeout(() => setAiResponse(null), 3000)
      }
    } catch (error) {
      console.error('Error deleting test reminders:', error)
      setAiResponse('Failed to delete test reminders')
      setTimeout(() => setAiResponse(null), 3000)
    } finally {
      setDeletingTestReminders(false)
    }
  }

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event)
    setEditEventForm({
      title: event.title,
      startDate: event.startDate,
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      isAllDay: event.isAllDay
    })
  }

  const handleSaveEvent = async () => {
    if (!editingEvent) return
    
    setSavingEvent(true)
    try {
      const res = await fetch(`/api/dashboard/events?id=${editingEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editEventForm.title,
          startDate: editEventForm.startDate,
          startTime: editEventForm.isAllDay ? null : editEventForm.startTime,
          endTime: editEventForm.isAllDay ? null : editEventForm.endTime,
          isAllDay: editEventForm.isAllDay
        })
      })
      const data = await res.json()
      if (data.success) {
        setEvents(prev => prev.map(e => 
          e.id === editingEvent.id ? data.event : e
        ))
        setEditingEvent(null)
        setSelectedEvent(null)
        fetchEvents()
      }
    } catch (error) {
      console.error('Error updating event:', error)
    } finally {
      setSavingEvent(false)
    }
  }

  const handleAiSubmit = async () => {
    if (!aiInput.trim() || aiLoading) return

    setAiLoading(true)
    setAiResponse(null)

    try {
      const res = await fetch('/api/dashboard/schedule/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: aiInput }),
      })
      const data = await res.json()
      
      if (data.success) {
        setAiResponse(data.message)
        setAiInput('')
        fetchSchedule()
        fetchEvents()
        // Trigger refresh of dashboard tasks
        window.dispatchEvent(new CustomEvent('dashboard-refresh'))
        setTimeout(() => setAiResponse(null), 5000)
      } else {
        setAiResponse(data.error || 'Sorry, I couldn\'t understand that.')
      }
    } catch (error) {
      setAiResponse('Something went wrong. Please try again.')
    } finally {
      setAiLoading(false)
    }
  }

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDay = firstDay.getDay()
    
    const days: (number | null)[] = []
    for (let i = 0; i < startingDay; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }
    return days
  }

  const getEventsForDay = (day: number) => {
    // Convert day to date string in schedule timezone
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const dateInTz = new Date(year, month - 1, day)
    
    // Format as YYYY-MM-DD in the schedule timezone
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: scheduleTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(dateInTz)
    
    return events.filter(e => e.startDate === dateStr)
  }

  const hasEventOnDay = (day: number) => getEventsForDay(day).length > 0

  const isToday = (day: number) => {
    // Use schedule timezone
    const now = new Date()
    
    // Get today's date in schedule timezone
    const todayInUserTz = new Intl.DateTimeFormat('en-US', {
      timeZone: scheduleTimezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    }).formatToParts(now)
    
    const todayDay = parseInt(todayInUserTz.find(p => p.type === 'day')?.value || '0')
    const todayMonth = parseInt(todayInUserTz.find(p => p.type === 'month')?.value || '0') - 1 // 0-indexed
    const todayYear = parseInt(todayInUserTz.find(p => p.type === 'year')?.value || '0')
    
    return day === todayDay && 
           currentMonth.getMonth() === todayMonth && 
           currentMonth.getFullYear() === todayYear
  }

  const formatTime = (time: string | null) => {
    if (!time) return null
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
    setSelectedDate(null)
    setSelectedEvent(null)
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
    setSelectedDate(null)
    setSelectedEvent(null)
  }

  const handleDayClick = (day: number) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    setSelectedDate(newDate)
    setSelectedEvent(null)
    
    // If there's an event on this day, show the first one
    const dayEvents = getEventsForDay(day)
    if (dayEvents.length > 0) {
      setSelectedEvent(dayEvents[0])
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-[var(--primary)]" />
            My Schedule
          </CardTitle>
          <select
            value={scheduleTimezone}
            onChange={(e) => setScheduleTimezone(e.target.value)}
            className="px-2 py-1 text-xs bg-[var(--input)] border border-[var(--border)] rounded text-[var(--foreground)] hover:bg-[var(--hover-bg)] transition-colors"
            title="Select timezone for schedule"
          >
            <option value="America/New_York">EST/EDT</option>
            <option value="America/Chicago">CST/CDT</option>
            <option value="America/Denver">MST/MDT</option>
            <option value="America/Los_Angeles">PST/PDT</option>
            <option value="America/Phoenix">MST (Arizona)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 overflow-y-auto">
        {/* Mini Calendar */}
        <div className="bg-[var(--muted)]/30 rounded-xl p-3">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3">
            <button 
              onClick={prevMonth}
              className="p-1 hover:bg-[var(--hover-bg)] rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-[var(--muted-foreground)]" />
            </button>
            <span className="font-medium text-[var(--foreground)]">
              {new Intl.DateTimeFormat('en-US', { 
                month: 'long', 
                year: 'numeric',
                timeZone: scheduleTimezone
              }).format(currentMonth)}
            </span>
            <button 
              onClick={nextMonth}
              className="p-1 hover:bg-[var(--hover-bg)] rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_NAMES.map(day => (
              <div key={day} className="text-center text-xs text-[var(--muted-foreground)] py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {getDaysInMonth(currentMonth).map((day, idx) => (
              <button
                key={idx}
                disabled={day === null}
                onClick={() => day && handleDayClick(day)}
                className={`
                  aspect-square rounded-lg text-sm flex items-center justify-center relative
                  ${day === null ? '' : 'hover:bg-[var(--hover-bg)] transition-colors'}
                  ${isToday(day || 0) ? 'bg-[var(--primary)] text-white font-bold' : 'text-[var(--foreground)]'}
                  ${selectedDate && day === selectedDate.getDate() && currentMonth.getMonth() === selectedDate.getMonth() 
                    ? 'ring-2 ring-[var(--primary)]' : ''}
                `}
              >
                {day}
                {day && hasEventOnDay(day) && !isToday(day) && (
                  <span className="absolute bottom-1 w-1 h-1 bg-[var(--primary)] rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Date Events */}
        {selectedDate && (
          <div className="bg-[var(--muted)]/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-[var(--foreground)]">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </h4>
              <button 
                onClick={() => { setSelectedDate(null); setSelectedEvent(null); }}
                className="p-1 hover:bg-[var(--hover-bg)] rounded"
              >
                <X className="w-4 h-4 text-[var(--muted-foreground)]" />
              </button>
            </div>
            
            {getEventsForDay(selectedDate.getDate()).length > 0 ? (
              <div className="space-y-2">
                {getEventsForDay(selectedDate.getDate()).map(event => (
                  <div 
                    key={event.id}
                    className={`p-2 rounded-lg border transition-colors ${
                      selectedEvent?.id === event.id 
                        ? 'bg-[var(--primary)]/20 border-[var(--primary)]' 
                        : 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--primary)]/50 cursor-pointer'
                    }`}
                    onClick={() => {
                      // Don't toggle if we're editing this event
                      if (editingEvent?.id !== event.id) {
                        setSelectedEvent(selectedEvent?.id === event.id ? null : event)
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--foreground)]">{event.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        event.eventType === 'reminder' ? 'bg-amber-500/20 text-amber-400' :
                        event.eventType === 'appointment' ? 'bg-blue-500/20 text-blue-400' :
                        event.eventType === 'time_off' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-[var(--muted)] text-[var(--muted-foreground)]'
                      }`}>
                        {event.eventType}
                      </span>
                    </div>
                    {event.startTime && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-[var(--muted-foreground)]">
                        <Clock className="w-3 h-3" />
                        {formatTime(event.startTime)}
                        {event.endTime && ` - ${formatTime(event.endTime)}`}
                      </div>
                    )}
                    {selectedEvent?.id === event.id && (
                      <div className="mt-2 pt-2 border-t border-[var(--border)]" onClick={(e) => e.stopPropagation()}>
                        {editingEvent?.id === event.id ? (
                          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editEventForm.title}
                              onChange={(e) => setEditEventForm({ ...editEventForm, title: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1 bg-[var(--input)] border border-[var(--border)] rounded text-sm text-[var(--foreground)]"
                              placeholder="Event name"
                              autoFocus
                            />
                            <input
                              type="date"
                              value={editEventForm.startDate}
                              onChange={(e) => setEditEventForm({ ...editEventForm, startDate: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1 bg-[var(--input)] border border-[var(--border)] rounded text-sm text-[var(--foreground)]"
                            />
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={editEventForm.isAllDay}
                                onChange={(e) => setEditEventForm({ ...editEventForm, isAllDay: e.target.checked })}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4"
                              />
                              <span className="text-xs text-[var(--muted-foreground)]">All day</span>
                            </div>
                            {!editEventForm.isAllDay && (
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="time"
                                  value={editEventForm.startTime}
                                  onChange={(e) => setEditEventForm({ ...editEventForm, startTime: e.target.value })}
                                  onClick={(e) => e.stopPropagation()}
                                  onFocus={(e) => e.stopPropagation()}
                                  className="flex-1 px-2 py-1 bg-[var(--input)] border border-[var(--border)] rounded text-sm text-[var(--foreground)]"
                                />
                                <span className="text-xs text-[var(--muted-foreground)]">-</span>
                                <input
                                  type="time"
                                  value={editEventForm.endTime}
                                  onChange={(e) => setEditEventForm({ ...editEventForm, endTime: e.target.value })}
                                  onClick={(e) => e.stopPropagation()}
                                  onFocus={(e) => e.stopPropagation()}
                                  className="flex-1 px-2 py-1 bg-[var(--input)] border border-[var(--border)] rounded text-sm text-[var(--foreground)]"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSaveEvent(); }}
                                disabled={savingEvent || !editEventForm.title.trim()}
                                className="flex-1 px-2 py-1 bg-[var(--primary)] text-white rounded text-xs hover:opacity-90 disabled:opacity-50"
                              >
                                {savingEvent ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Save'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingEvent(null); }}
                                className="px-2 py-1 bg-[var(--muted)] text-[var(--foreground)] rounded text-xs hover:bg-[var(--hover-bg)]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {event.description && (
                              <p className="text-xs text-[var(--muted-foreground)] mb-2">{event.description}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditEvent(event); }}
                                className="flex items-center gap-1 text-xs text-[var(--primary)] hover:text-[var(--primary)]/80"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                                disabled={deletingEvent}
                                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                              >
                                {deletingEvent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">No events on this day</p>
            )}
          </div>
        )}

        {/* Collapsible Work Hours */}
        <div className="border-t border-[var(--border)] pt-3">
          <button
            onClick={() => setShowWorkHours(!showWorkHours)}
            className="w-full flex items-center justify-between text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
          >
            <span>Work Hours</span>
            {showWorkHours ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showWorkHours && (
            <div className="mt-2 space-y-1">
              {loading ? (
                <div className="animate-pulse space-y-2">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="h-6 bg-[var(--muted)] rounded" />
                  ))}
                </div>
              ) : (
                FULL_DAY_NAMES.map((dayName, idx) => {
                  const daySchedule = schedule.find(s => s.dayOfWeek === idx)
                  const isEditing = editingDay === idx
                  
                  if (isEditing) {
                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-[var(--muted)]/50 rounded-lg">
                        <span className="text-[var(--muted-foreground)] w-12 text-sm">{dayName.slice(0, 3)}:</span>
                        <select
                          value={editForm.isWorking ? 'working' : 'closed'}
                          onChange={(e) => setEditForm({ ...editForm, isWorking: e.target.value === 'working' })}
                          className="px-2 py-1 bg-[var(--input)] border border-[var(--border)] rounded text-sm text-[var(--foreground)]"
                        >
                          <option value="working">Working</option>
                          <option value="closed">Closed</option>
                        </select>
                        {editForm.isWorking && (
                          <>
                            <input
                              type="time"
                              value={editForm.startTime}
                              onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                              className="px-2 py-1 bg-[var(--input)] border border-[var(--border)] rounded text-sm text-[var(--foreground)]"
                            />
                            <span className="text-[var(--muted-foreground)]">-</span>
                            <input
                              type="time"
                              value={editForm.endTime}
                              onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                              className="px-2 py-1 bg-[var(--input)] border border-[var(--border)] rounded text-sm text-[var(--foreground)]"
                            />
                          </>
                        )}
                        <button
                          onClick={handleSaveDay}
                          disabled={saving}
                          className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setEditingDay(null)}
                          className="p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  }
                  
                  return (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-[var(--muted)]/30 group cursor-pointer"
                      onClick={() => handleEditDay(idx)}
                    >
                      <span className="text-[var(--muted-foreground)] w-12">{dayName.slice(0, 3)}:</span>
                      <div className="flex items-center gap-2">
                        <span className={daySchedule?.isWorking ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}>
                          {daySchedule?.isWorking 
                            ? `${formatTime(daySchedule.startTime)} - ${formatTime(daySchedule.endTime)}`
                            : 'Closed'
                          }
                        </span>
                        <Pencil className="w-3 h-3 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* AI Input - Only show if AI is available */}
        {aiAvailable !== false && (
          <div className="border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--primary)]" />
                <span className="text-sm text-[var(--muted-foreground)]">Type anything about your schedule...</span>
              </div>
              {events.some(e => e.title.toLowerCase().includes('test')) && (
                <button
                  onClick={handleDeleteTestReminders}
                  disabled={deletingTestReminders}
                  className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                  title="Delete all test reminders"
                >
                  {deletingTestReminders ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>Delete Test Reminders</>
                  )}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
                placeholder="e.g., Remind me to call supplier Tuesday at 2pm"
                className="flex-1 px-3 py-2 bg-[var(--input)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                disabled={!aiAvailable}
              />
              <button
                onClick={handleAiSubmit}
                disabled={aiLoading || !aiInput.trim() || !aiAvailable}
                className="px-3 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {aiLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </button>
            </div>
            
            {aiResponse && (
              <div className={`mt-2 p-2 rounded-lg text-sm ${
                aiResponse.includes('Sorry') || aiResponse.includes('wrong') || aiResponse.includes('require')
                  ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              }`}>
                {aiResponse}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
