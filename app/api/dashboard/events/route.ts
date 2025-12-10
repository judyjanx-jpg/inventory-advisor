import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString())

    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: true,
        events: []
      })
    }

    const userTimezone = profile.timezone || 'America/New_York'

    // Get start and end of the requested month in user's timezone
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = endOfMonth(monthStart)

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: profile.id,
        OR: [
          // Events that start in this month
          {
            startDate: {
              gte: monthStart,
              lte: monthEnd
            }
          },
          // Multi-day events that span into this month
          {
            AND: [
              { startDate: { lt: monthStart } },
              { endDate: { gte: monthStart } }
            ]
          }
        ]
      },
      orderBy: [
        { startDate: 'asc' },
        { startTime: 'asc' }
      ]
    })

    return NextResponse.json({
      success: true,
      events: events.map(e => {
        // Convert UTC dates to user's timezone for display
        const startDateInTz = toZonedTime(e.startDate, userTimezone)
        const endDateInTz = e.endDate ? toZonedTime(e.endDate, userTimezone) : null
        
        return {
          id: e.id,
          title: e.title,
          eventType: e.eventType,
          startDate: format(startDateInTz, 'yyyy-MM-dd'),
          endDate: endDateInTz ? format(endDateInTz, 'yyyy-MM-dd') : null,
          startTime: e.startTime,
          endTime: e.endTime,
          isAllDay: e.isAllDay,
          description: e.description
        }
      })
    })
  } catch (error) {
    console.error('Events API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to load events'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, eventType, startDate, endDate, startTime, endTime, isAllDay, description } = body

    if (!title || !startDate) {
      return NextResponse.json({
        success: false,
        error: 'Title and start date are required'
      }, { status: 400 })
    }

    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    const event = await prisma.calendarEvent.create({
      data: {
        userId: profile.id,
        title,
        eventType: eventType || 'appointment',
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        startTime: startTime || null,
        endTime: endTime || null,
        isAllDay: isAllDay ?? !startTime,
        description: description || null,
        createdBy: 'user'
      }
    })

    return NextResponse.json({
      success: true,
      event: {
        id: event.id,
        title: event.title,
        startDate: format(event.startDate, 'yyyy-MM-dd')
      }
    })
  } catch (error) {
    console.error('Create event error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create event'
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Event ID is required'
      }, { status: 400 })
    }

    const body = await request.json()
    const { title, startDate, endDate, startTime, endTime, isAllDay, description } = body

    if (!title || !startDate) {
      return NextResponse.json({
        success: false,
        error: 'Title and start date are required'
      }, { status: 400 })
    }

    const event = await prisma.calendarEvent.update({
      where: { id: parseInt(id) },
      data: {
        title,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        startTime: startTime || null,
        endTime: endTime || null,
        isAllDay: isAllDay ?? !startTime,
        description: description || null,
      }
    })

    return NextResponse.json({
      success: true,
      event: {
        id: event.id,
        title: event.title,
        eventType: event.eventType,
        startDate: format(event.startDate, 'yyyy-MM-dd'),
        endDate: event.endDate ? format(event.endDate, 'yyyy-MM-dd') : null,
        startTime: event.startTime,
        endTime: event.endTime,
        isAllDay: event.isAllDay,
        description: event.description
      }
    })
  } catch (error) {
    console.error('Update event error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update event'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')
    const deleteTest = searchParams.get('deleteTest') === 'true'

    const profile = await prisma.userProfile.findFirst()
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: 'User profile not found'
      }, { status: 404 })
    }

    if (deleteTest) {
      // Delete all test reminders (title contains "Test" or "test")
      const result = await prisma.calendarEvent.deleteMany({
        where: {
          userId: profile.id,
          OR: [
            { title: { contains: 'Test', mode: 'insensitive' } },
            { title: { contains: 'test', mode: 'insensitive' } }
          ]
        }
      })

      return NextResponse.json({
        success: true,
        message: `Deleted ${result.count} test reminders`
      })
    }

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Event ID is required'
      }, { status: 400 })
    }

    // Verify the event belongs to the user before deleting
    const event = await prisma.calendarEvent.findFirst({
      where: {
        id: parseInt(id),
        userId: profile.id
      }
    })

    if (!event) {
      return NextResponse.json({
        success: false,
        error: 'Event not found or access denied'
      }, { status: 404 })
    }

    await prisma.calendarEvent.delete({
      where: { id: parseInt(id) }
    })

    return NextResponse.json({
      success: true,
      message: 'Event deleted'
    })
  } catch (error: any) {
    console.error('Delete event error:', error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'Failed to delete event'
    }, { status: 500 })
  }
}

