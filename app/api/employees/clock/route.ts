import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Clock in or out
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { employeeNumber } = body

    if (!employeeNumber) {
      return NextResponse.json(
        { success: false, error: 'Employee number required' },
        { status: 400 }
      )
    }

    // Find employee
    const employee = await prisma.employee.findUnique({
      where: { employeeNumber },
      include: {
        timeEntries: {
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    })

    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      )
    }

    if (!employee.isActive) {
      return NextResponse.json(
        { success: false, error: 'Employee is not active' },
        { status: 400 }
      )
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Get last entry
    const lastEntry = employee.timeEntries[0]
    const shouldClockIn = !lastEntry || lastEntry.entryType === 'clock_out'

    // Create new time entry
    const entryType = shouldClockIn ? 'clock_in' : 'clock_out'
    const timeEntry = await prisma.timeEntry.create({
      data: {
        employeeId: employee.id,
        entryType,
        timestamp: now,
        date: today
      }
    })

    let hoursWorked = null
    let dailyTotal = null

    // If clocking out, calculate hours worked for the day
    if (entryType === 'clock_out' && lastEntry && lastEntry.entryType === 'clock_in') {
      const clockInTime = new Date(lastEntry.timestamp)
      const clockOutTime = now
      const diffMs = clockOutTime.getTime() - clockInTime.getTime()
      const diffHours = diffMs / (1000 * 60 * 60) // Convert to decimal hours
      
      hoursWorked = parseFloat(diffHours.toFixed(2))

      // Update the clock_out entry with hours worked
      await prisma.timeEntry.update({
        where: { id: timeEntry.id },
        data: { hoursWorked }
      })

      // Calculate total hours for the day
      const todayEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: employee.id,
          date: today,
          entryType: 'clock_out',
          hoursWorked: { not: null }
        }
      })

      dailyTotal = todayEntries.reduce((sum, entry) => {
        return sum + (entry.hoursWorked ? parseFloat(entry.hoursWorked.toString()) : 0)
      }, 0)
    } else if (entryType === 'clock_in') {
      // If clocking in, get today's total so far (in case they clocked in/out multiple times)
      const todayEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: employee.id,
          date: today,
          entryType: 'clock_out',
          hoursWorked: { not: null }
        }
      })

      dailyTotal = todayEntries.reduce((sum, entry) => {
        return sum + (entry.hoursWorked ? parseFloat(entry.hoursWorked.toString()) : 0)
      }, 0)
    }

    return NextResponse.json({
      success: true,
      entry: timeEntry,
      entryType,
      hoursWorked,
      dailyTotal: dailyTotal ? parseFloat(dailyTotal.toFixed(2)) : null,
      employeeName: employee.name
    })
  } catch (error: any) {
    console.error('Error clocking in/out:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// GET - Get current status for employee
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeNumber = searchParams.get('employeeNumber')

    if (!employeeNumber) {
      return NextResponse.json(
        { success: false, error: 'Employee number required' },
        { status: 400 }
      )
    }

    const employee = await prisma.employee.findUnique({
      where: { employeeNumber },
      include: {
        timeEntries: {
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    })

    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      )
    }

    const lastEntry = employee.timeEntries[0]
    const isClockedIn = lastEntry?.entryType === 'clock_in'

    // Get today's total hours
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const todayEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId: employee.id,
        date: today,
        entryType: 'clock_out',
        hoursWorked: { not: null }
      }
    })

    const dailyTotal = todayEntries.reduce((sum, entry) => {
      return sum + (entry.hoursWorked ? parseFloat(entry.hoursWorked.toString()) : 0)
    }, 0)

    return NextResponse.json({
      success: true,
      isClockedIn,
      lastEntry,
      dailyTotal: parseFloat(dailyTotal.toFixed(2)),
      employeeName: employee.name
    })
  } catch (error: any) {
    console.error('Error getting clock status:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}


