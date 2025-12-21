// components/profit/CalendarDatePicker.tsx
'use client'

import { useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfDay } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CalendarDatePickerProps {
  startDate: Date | null
  endDate: Date | null
  onStartDateChange: (date: Date | null) => void
  onEndDateChange: (date: Date | null) => void
}

export function CalendarDatePicker({ startDate, endDate, onStartDateChange, onEndDateChange }: CalendarDatePickerProps) {
  const [startMonth, setStartMonth] = useState(startDate || new Date())
  const [endMonth, setEndMonth] = useState(endDate || addMonths(new Date(), 1))

  const startMonthStart = startOfMonth(startMonth)
  const startMonthEnd = endOfMonth(startMonth)
  const endMonthStart = startOfMonth(endMonth)
  const endMonthEnd = endOfMonth(endMonth)

  // Get all days in the month view (including previous/next month days for full weeks)
  const getDaysInMonth = (month: Date) => {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    const firstDayOfWeek = monthStart.getDay()
    const days: (Date | null)[] = []

    // Add empty cells for days before the month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null)
    }

    // Add all days in the month
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
    days.push(...monthDays)

    return days
  }

  const startDays = getDaysInMonth(startMonth)
  const endDays = getDaysInMonth(endMonth)

  const handleDateClick = (date: Date, isStartCalendar: boolean) => {
    const dateStart = startOfDay(date)
    
    if (isStartCalendar) {
      // If clicking on start calendar
      if (!startDate || (endDate && dateStart > endDate)) {
        // If no start date or clicked date is after end date, set as new start
        onStartDateChange(dateStart)
        if (endDate && dateStart > endDate) {
          onEndDateChange(null)
        }
      } else if (startDate && isSameDay(dateStart, startDate)) {
        // If clicking the same start date, deselect it
        onStartDateChange(null)
      } else {
        // Otherwise, update start date
        onStartDateChange(dateStart)
      }
    } else {
      // If clicking on end calendar
      if (!endDate || (startDate && dateStart < startDate)) {
        // If no end date or clicked date is before start date, set as new end
        onEndDateChange(dateStart)
        if (startDate && dateStart < startDate) {
          onStartDateChange(null)
        }
      } else if (endDate && isSameDay(dateStart, endDate)) {
        // If clicking the same end date, deselect it
        onEndDateChange(null)
      } else {
        // Otherwise, update end date
        onEndDateChange(dateStart)
      }
    }
  }

  const isDateInRange = (date: Date | null) => {
    if (!date || !startDate || !endDate) return false
    return date >= startDate && date <= endDate
  }

  const isDateSelected = (date: Date | null, isStartCalendar: boolean) => {
    if (!date) return false
    const dateStart = startOfDay(date)
    if (isStartCalendar) {
      return startDate && isSameDay(dateStart, startDate)
    } else {
      return endDate && isSameDay(dateStart, endDate)
    }
  }

  const renderCalendar = (month: Date, days: (Date | null)[], isStartCalendar: boolean) => {
    const monthStart = startOfMonth(month)
    const isCurrentMonth = isSameMonth(month, new Date())

    return (
      <div className="flex flex-col">
        {/* Month Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            onClick={() => {
              if (isStartCalendar) {
                setStartMonth(subMonths(month, 1))
              } else {
                setEndMonth(subMonths(month, 1))
              }
            }}
            className="p-1 hover:bg-[var(--muted)] rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-[var(--muted-foreground)]" />
          </button>
          <h3 className="text-sm font-medium text-[var(--foreground)]">
            {format(month, 'MMMM yyyy')}
          </h3>
          <button
            onClick={() => {
              if (isStartCalendar) {
                setStartMonth(addMonths(month, 1))
              } else {
                setEndMonth(addMonths(month, 1))
              }
            }}
            className="p-1 hover:bg-[var(--muted)] rounded transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* Day Labels */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
            <div key={day} className="text-xs text-[var(--muted-foreground)] text-center py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="aspect-square" />
            }

            const dayStart = startOfDay(day)
            const isSelected = isDateSelected(day, isStartCalendar)
            const inRange = isDateInRange(day)
            const isToday = isSameDay(day, new Date())
            const isOtherMonth = !isSameMonth(day, monthStart)

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDateClick(day, isStartCalendar)}
                className={`
                  aspect-square text-xs rounded transition-colors
                  ${isSelected 
                    ? 'bg-cyan-600 text-[var(--foreground)] font-semibold' 
                    : inRange && !isSelected
                    ? 'bg-cyan-600/30 text-[var(--foreground)]'
                    : isToday
                    ? 'bg-[var(--muted)] text-[var(--foreground)] font-medium'
                    : isOtherMonth
                    ? 'text-[var(--muted-foreground)]'
                    : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                  }
                `}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-6 p-4">
      {/* Start Date Calendar */}
      <div className="flex-1">
        <div className="mb-2">
          <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Start Date</label>
          <input
            type="date"
            value={startDate ? format(startDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => {
              if (e.target.value) {
                onStartDateChange(startOfDay(new Date(e.target.value)))
              } else {
                onStartDateChange(null)
              }
            }}
            className="w-full px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        {renderCalendar(startMonth, startDays, true)}
      </div>

      {/* End Date Calendar */}
      <div className="flex-1">
        <div className="mb-2">
          <label className="text-xs text-[var(--muted-foreground)] mb-1 block">End Date</label>
          <input
            type="date"
            value={endDate ? format(endDate, 'yyyy-MM-dd') : ''}
            onChange={(e) => {
              if (e.target.value) {
                onEndDateChange(startOfDay(new Date(e.target.value)))
              } else {
                onEndDateChange(null)
              }
            }}
            className="w-full px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        {renderCalendar(endMonth, endDays, false)}
      </div>
    </div>
  )
}

