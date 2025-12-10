import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

// Only create client if API key exists
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

interface ParsedScheduleAction {
  type: 'time_off' | 'work_hours' | 'event' | 'appointment' | 'holiday'
  date?: string
  endDate?: string
  dayOfWeek?: number
  startTime?: string
  endTime?: string
  isAllDay?: boolean
  title?: string
  description?: string
  recurring?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { input } = body

    if (!input?.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Please provide some input'
      }, { status: 400 })
    }

    if (!anthropic) {
      return NextResponse.json({
        success: false,
        error: 'AI features require ANTHROPIC_API_KEY to be configured.'
      }, { status: 503 })
    }

    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    // Get current date context in user's timezone
    const userTimezone = profile.timezone || 'America/New_York'
    const now = new Date()
    const nowInUserTz = toZonedTime(now, userTimezone)
    const today = nowInUserTz
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 })
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    // Parse with Claude - use user's timezone for date context
    const todayDateStr = format(today, 'yyyy-MM-dd')
    const systemPrompt = `You are a schedule assistant. Parse the user's natural language input about their schedule and return a JSON object with the appropriate action.

Current context (in ${userTimezone} timezone):
- Today is ${format(today, 'EEEE, MMMM d, yyyy')} (${todayDateStr})
- Current week starts on ${format(currentWeekStart, 'MMMM d')}

IMPORTANT: When the user says "today", use the date: ${todayDateStr}
When the user says "tomorrow", use the date: ${format(addDays(today, 1), 'yyyy-MM-dd')}

Return a JSON object with these fields:
{
  "type": "time_off" | "work_hours" | "event" | "appointment" | "holiday",
  "date": "YYYY-MM-DD" (for specific dates),
  "endDate": "YYYY-MM-DD" (for multi-day events),
  "dayOfWeek": 0-6 (for recurring schedule changes, 0=Sunday),
  "startTime": "HH:MM" (24-hour format),
  "endTime": "HH:MM" (24-hour format),
  "isAllDay": true/false,
  "title": "Event title",
  "description": "Optional description",
  "recurring": true/false (if this is a permanent schedule change),
  "message": "A friendly confirmation message to show the user"
}

Examples:
- "I'm off on Monday" → type: "time_off", dayOfWeek: 1, recurring: false, message: "Got it! You're off this Monday."
- "I'll be working late on Thursday until 8pm" → type: "work_hours", dayOfWeek: 4, endTime: "20:00", recurring: false
- "Remind me about the meeting at 2pm tomorrow" → type: "appointment", date: (tomorrow's date), startTime: "14:00", title: "Meeting reminder"
- "We have a holiday from April 4-16" → type: "holiday", date: "2024-04-04", endDate: "2024-04-16", isAllDay: true, title: "Holiday"
- "Change my Monday hours to 10am-4pm permanently" → type: "work_hours", dayOfWeek: 1, startTime: "10:00", endTime: "16:00", recurring: true

Only return the JSON object, no other text.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: input }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    let parsed: ParsedScheduleAction & { message?: string }
    try {
      // Extract JSON from the response (handle potential markdown code blocks)
      let jsonStr = content.text.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
      }
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({
        success: false,
        error: "Sorry, I couldn't understand that. Try something like 'I'm off on Monday' or 'Add a meeting at 2pm tomorrow'."
      })
    }

    // Process the parsed action
    if (parsed.type === 'time_off' || parsed.type === 'work_hours') {
      if (parsed.dayOfWeek !== undefined) {
        // Update schedule for that day
        if (parsed.recurring) {
          // Permanent schedule change
          await prisma.userSchedule.upsert({
            where: {
              userId_dayOfWeek: {
                userId: profile.id,
                dayOfWeek: parsed.dayOfWeek
              }
            },
            update: {
              isWorking: parsed.type === 'work_hours',
              startTime: parsed.startTime || null,
              endTime: parsed.endTime || null
            },
            create: {
              userId: profile.id,
              dayOfWeek: parsed.dayOfWeek,
              isWorking: parsed.type === 'work_hours',
              startTime: parsed.startTime || null,
              endTime: parsed.endTime || null
            }
          })
        } else {
          // One-time change - create a calendar event
          const nextDate = getNextDayOfWeek(today, parsed.dayOfWeek)
          const eventTitle = parsed.type === 'time_off' ? `Day Off (${dayNames[parsed.dayOfWeek]})` : `Modified Hours`
          
          // Convert nextDate (in user timezone) to UTC for storage
          const nextDateUTC = fromZonedTime(nextDate, userTimezone)
          
          // Check for duplicate - same date (within same day in user timezone) and same time
          const nextDateInUserTz = toZonedTime(nextDateUTC, userTimezone)
          const dayStart = new Date(nextDateInUserTz)
          dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(dayStart)
          dayEnd.setHours(23, 59, 59, 999)
          const dayStartUTC = fromZonedTime(dayStart, userTimezone)
          const dayEndUTC = fromZonedTime(dayEnd, userTimezone)
          
          const existingEvent = await prisma.calendarEvent.findFirst({
            where: {
              userId: profile.id,
              OR: [
                // Exact match: same title, date, and time
                {
                  title: eventTitle,
                  startDate: {
                    gte: dayStartUTC,
                    lte: dayEndUTC
                  },
                  startTime: parsed.startTime || null
                },
                // Also check for "Test" reminders with same time on same day (prevent test spam)
                {
                  title: { contains: 'Test', mode: 'insensitive' },
                  startDate: {
                    gte: dayStartUTC,
                    lte: dayEndUTC
                  },
                  startTime: parsed.startTime || null
                }
              ]
            }
          })
          
          if (existingEvent) {
            return NextResponse.json({
              success: false,
              error: 'A similar reminder already exists for this time.'
            })
          }
          
          await prisma.calendarEvent.create({
            data: {
              userId: profile.id,
              title: eventTitle,
              eventType: 'time_off',
              startDate: nextDateUTC,
              endDate: null,
              startTime: parsed.startTime || null,
              endTime: parsed.endTime || null,
              isAllDay: !parsed.startTime,
              createdBy: 'ai'
            }
          })
        }
      } else if (parsed.date) {
        // Specific date - treat as user's timezone, convert to UTC for storage
        const dateStr = parsed.date // YYYY-MM-DD format
        const [year, month, day] = dateStr.split('-').map(Number)
        // Create date at midnight in user's timezone, then convert to UTC
        const dateInUserTz = new Date(year, month - 1, day)
        const startDate = fromZonedTime(dateInUserTz, userTimezone)
        const eventTitle = parsed.title || 'Day Off'
        
        // Check for duplicate
        const existingEvent = await prisma.calendarEvent.findFirst({
          where: {
            userId: profile.id,
            title: eventTitle,
            startDate: {
              gte: new Date(startDate.getTime() - 60 * 60 * 1000),
              lte: new Date(startDate.getTime() + 60 * 60 * 1000)
            },
            startTime: parsed.startTime || null
          }
        })
        
        if (existingEvent) {
          return NextResponse.json({
            success: false,
            error: 'A similar reminder already exists for this time.'
          })
        }
        
        const endDate = parsed.endDate ? (() => {
          const [eYear, eMonth, eDay] = parsed.endDate.split('-').map(Number)
          const endDateInUserTz = new Date(eYear, eMonth - 1, eDay)
          return fromZonedTime(endDateInUserTz, userTimezone)
        })() : null
        
        await prisma.calendarEvent.create({
          data: {
            userId: profile.id,
            title: eventTitle,
            eventType: 'time_off',
            startDate: startDate,
            endDate: endDate,
            startTime: parsed.startTime || null,
            endTime: parsed.endTime || null,
            isAllDay: !parsed.startTime,
            createdBy: 'ai'
          }
        })
      }
    } else if (parsed.type === 'appointment' || parsed.type === 'event') {
      if (parsed.date) {
        // Treat date as user's timezone, convert to UTC for storage
        const dateStr = parsed.date // YYYY-MM-DD format
        const [year, month, day] = dateStr.split('-').map(Number)
        const dateInUserTz = new Date(year, month - 1, day)
        const startDate = fromZonedTime(dateInUserTz, userTimezone)
        
        // Check for duplicate events - same date (within same day in user timezone) and same time
        // Also check if title contains "test" to prevent test reminder spam
        const startDateInUserTz = toZonedTime(startDate, userTimezone)
        const dayStart = new Date(startDateInUserTz)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)
        const dayStartUTC = fromZonedTime(dayStart, userTimezone)
        const dayEndUTC = fromZonedTime(dayEnd, userTimezone)
        
        const eventTitle = parsed.title || 'Appointment'
        
        const existingEvent = await prisma.calendarEvent.findFirst({
          where: {
            userId: profile.id,
            OR: [
              // Exact match: same title, date, and time
              {
                title: eventTitle,
                startDate: {
                  gte: dayStartUTC,
                  lte: dayEndUTC
                },
                startTime: parsed.startTime || null
              },
              // Also check for "Test" reminders with same time on same day (prevent test spam)
              {
                title: { contains: 'Test', mode: 'insensitive' },
                startDate: {
                  gte: dayStartUTC,
                  lte: dayEndUTC
                },
                startTime: parsed.startTime || null
              }
            ]
          }
        })
        
        if (existingEvent) {
          return NextResponse.json({
            success: false,
            error: 'A similar reminder already exists for this time.'
          })
        }
        
        const endDate = parsed.endDate ? (() => {
          const [eYear, eMonth, eDay] = parsed.endDate.split('-').map(Number)
          const endDateInUserTz = new Date(eYear, eMonth - 1, eDay)
          return fromZonedTime(endDateInUserTz, userTimezone)
        })() : null
        
        await prisma.calendarEvent.create({
          data: {
            userId: profile.id,
            title: parsed.title || 'Appointment',
            description: parsed.description,
            eventType: parsed.type,
            startDate: startDate,
            endDate: endDate,
            startTime: parsed.startTime || null,
            endTime: parsed.endTime || null,
            isAllDay: parsed.isAllDay ?? !parsed.startTime,
            createdBy: 'ai'
          }
        })
      }
    } else if (parsed.type === 'holiday') {
      // Treat date as user's timezone, convert to UTC for storage
      let startDate: Date
      if (parsed.date) {
        const [year, month, day] = parsed.date.split('-').map(Number)
        const dateInUserTz = new Date(year, month - 1, day)
        startDate = fromZonedTime(dateInUserTz, userTimezone)
      } else {
        // Use today in user's timezone, convert to UTC
        startDate = fromZonedTime(today, userTimezone)
      }
      
      const endDate = parsed.endDate ? (() => {
        const [eYear, eMonth, eDay] = parsed.endDate.split('-').map(Number)
        const endDateInUserTz = new Date(eYear, eMonth - 1, eDay)
        return fromZonedTime(endDateInUserTz, userTimezone)
      })() : null
      
      await prisma.calendarEvent.create({
        data: {
          userId: profile.id,
          title: parsed.title || 'Holiday',
          description: parsed.description,
          eventType: 'holiday',
          startDate: startDate,
          endDate: endDate,
          isAllDay: true,
          createdBy: 'ai'
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: parsed.message || "Done! I've updated your schedule."
    })
  } catch (error) {
    console.error('Schedule parse error:', error)
    return NextResponse.json({
      success: false,
      error: 'Something went wrong. Please try again.'
    }, { status: 500 })
  }
}

function getNextDayOfWeek(date: Date, dayOfWeek: number): Date {
  const result = new Date(date)
  const currentDay = date.getDay()
  const daysUntil = (dayOfWeek - currentDay + 7) % 7 || 7 // If today is that day, go to next week
  result.setDate(result.getDate() + daysUntil)
  return result
}

