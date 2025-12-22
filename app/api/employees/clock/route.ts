import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Clock in or out
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { employeeNumber, timestamp } = body

    if (!employeeNumber) {
      return NextResponse.json(
        { success: false, error: 'Employee number required' },
        { status: 400 }
      )
    }

    // Find employee
    const employee = await prisma.employee.findUnique({
      where: { employeeNumber }
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

    // Use custom timestamp if provided, otherwise use current time
    const entryTime = timestamp ? new Date(timestamp) : new Date()
    // Create date in local timezone (not UTC) - use the timestamp's local date components
    const entryDate = new Date(entryTime.getFullYear(), entryTime.getMonth(), entryTime.getDate())
    entryDate.setHours(0, 0, 0, 0)
    
    // Ensure entryTime is valid
    if (isNaN(entryTime.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid timestamp provided' },
        { status: 400 }
      )
    }

    // Get last entry for this employee
    const lastEntry = await prisma.timeEntry.findFirst({
      where: { employeeId: employee.id },
      orderBy: { timestamp: 'desc' }
    })
    
    const shouldClockIn = !lastEntry || lastEntry.entryType === 'clock_out'
    const entryType = shouldClockIn ? 'clock_in' : 'clock_out'
    
    // Validate: if clocking out, clock out time should be after clock in time
    if (entryType === 'clock_out' && lastEntry && lastEntry.entryType === 'clock_in') {
      const clockInTime = new Date(lastEntry.timestamp)
      if (entryTime <= clockInTime) {
        return NextResponse.json(
          { success: false, error: 'Clock out time must be after clock in time' },
          { status: 400 }
        )
      }
    }

    // Create new time entry
    const timeEntry = await prisma.timeEntry.create({
      data: {
        employeeId: employee.id,
        entryType,
        timestamp: entryTime,
        date: entryDate
      }
    })

    let hoursWorked = null
    let dailyTotal = null

    // If clocking out, calculate hours worked for the day
    if (entryType === 'clock_out' && lastEntry && lastEntry.entryType === 'clock_in') {
      const clockInTime = new Date(lastEntry.timestamp)
      const clockOutTime = entryTime
      const diffMs = clockOutTime.getTime() - clockInTime.getTime()
      const diffHours = diffMs / (1000 * 60 * 60) // Convert to decimal hours
      
      hoursWorked = parseFloat(diffHours.toFixed(2))

      // Update the clock_out entry with hours worked
      await prisma.timeEntry.update({
        where: { id: timeEntry.id },
        data: { hoursWorked }
      })

      // Calculate total hours for the day (use entryDate, not today)
      const dayEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: employee.id,
          date: entryDate,
          entryType: 'clock_out',
          hoursWorked: { not: null }
        }
      })

      dailyTotal = dayEntries.reduce((sum, entry) => {
        return sum + (entry.hoursWorked ? parseFloat(entry.hoursWorked.toString()) : 0)
      }, 0)
    } else if (entryType === 'clock_in') {
      // If clocking in, get the day's total so far (in case they clocked in/out multiple times)
      const dayEntries = await prisma.timeEntry.findMany({
        where: {
          employeeId: employee.id,
          date: entryDate,
          entryType: 'clock_out',
          hoursWorked: { not: null }
        }
      })

      dailyTotal = dayEntries.reduce((sum, entry) => {
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
      where: { employeeNumber }
    })

    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Employee not found' },
        { status: 404 }
      )
    }

    // Get last entry for this employee
    const lastEntry = await prisma.timeEntry.findFirst({
      where: { employeeId: employee.id },
      orderBy: { timestamp: 'desc' }
    })
    
    const isClockedIn = lastEntry?.entryType === 'clock_in'

    // Get today's total hours from completed clock out entries only
    // The frontend will calculate and add current session hours in real-time
    // Use local date, not UTC
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
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


