'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  Check,
  Loader2,
  Sparkles
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
  isAllDay: boolean
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

  useEffect(() => {
    fetchSchedule()
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [currentMonth])

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
        // Refresh schedule and events
        fetchSchedule()
        fetchEvents()
        // Clear response after 5 seconds
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
    
    // Add empty slots for days before the 1st
    for (let i = 0; i < startingDay; i++) {
      days.push(null)
    }
    
    // Add the days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }
    
    return days
  }

  const hasEventOnDay = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.some(e => e.startDate === dateStr)
  }

  const isToday = (day: number) => {
    const today = new Date()
    return day === today.getDate() && 
           currentMonth.getMonth() === today.getMonth() && 
           currentMonth.getFullYear() === today.getFullYear()
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
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-[var(--primary)]" />
          My Schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
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
                onClick={() => day && setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))}
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

        {/* Weekly Hours */}
        <div>
          <h4 className="text-sm font-medium text-[var(--foreground)] mb-2">Work Hours</h4>
          <div className="space-y-1">
            {loading ? (
              <div className="animate-pulse space-y-2">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-6 bg-[var(--muted)] rounded" />
                ))}
              </div>
            ) : (
              FULL_DAY_NAMES.map((dayName, idx) => {
                const daySchedule = schedule.find(s => s.dayOfWeek === idx)
                return (
                  <div key={idx} className="flex items-center justify-between text-sm py-1">
                    <span className="text-[var(--muted-foreground)] w-24">{dayName.slice(0, 3)}:</span>
                    <span className={daySchedule?.isWorking ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}>
                      {daySchedule?.isWorking 
                        ? `${formatTime(daySchedule.startTime)} - ${formatTime(daySchedule.endTime)}`
                        : 'Closed'
                      }
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* AI Input */}
        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-sm text-[var(--muted-foreground)]">Type anything about your schedule...</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
              placeholder="e.g., I'm off on Monday"
              className="flex-1 px-3 py-2 bg-[var(--input)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <button
              onClick={handleAiSubmit}
              disabled={aiLoading || !aiInput.trim()}
              className="px-3 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {aiLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </button>
          </div>
          
          {/* AI Response */}
          {aiResponse && (
            <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
              {aiResponse}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

