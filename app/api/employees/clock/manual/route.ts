import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Add manual time entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { employeeNumber, date, clockInTime, clockOutTime, hours } = body

    if (!employeeNumber) {
      return NextResponse.json(
        { success: false, error: 'Employee number required' },
        { status: 400 }
      )
    }

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date required' },
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

    const entryDate = new Date(date)
    entryDate.setHours(0, 0, 0, 0)

    let calculatedHours: number | null = null

    // If hours are provided directly, use them
    if (hours !== null && hours !== undefined && hours !== '') {
      calculatedHours = parseFloat(hours.toString())
    }
    // Otherwise, calculate from clock in/out times
    else if (clockInTime && clockOutTime) {
      const clockIn = new Date(`${date}T${clockInTime}`)
      const clockOut = new Date(`${date}T${clockOutTime}`)
      
      if (clockOut <= clockIn) {
        return NextResponse.json(
          { success: false, error: 'Clock out time must be after clock in time' },
          { status: 400 }
        )
      }

      const diffMs = clockOut.getTime() - clockIn.getTime()
      const diffHours = diffMs / (1000 * 60 * 60)
      calculatedHours = parseFloat(diffHours.toFixed(2))
    } else {
      return NextResponse.json(
        { success: false, error: 'Either provide clock in/out times or hours directly' },
        { status: 400 }
      )
    }

    // Create clock in entry
    let clockInEntry = null
    if (clockInTime) {
      const clockInTimestamp = new Date(`${date}T${clockInTime}`)
      clockInEntry = await prisma.timeEntry.create({
        data: {
          employeeId: employee.id,
          entryType: 'clock_in',
          timestamp: clockInTimestamp,
          date: entryDate
        }
      })
    }

    // Create clock out entry
    let clockOutEntry = null
    if (clockOutTime || calculatedHours) {
      let clockOutTimestamp: Date
      if (clockOutTime) {
        clockOutTimestamp = new Date(`${date}T${clockOutTime}`)
      } else if (clockInTime) {
        // If only clock in time provided, calculate clock out time from hours
        const clockInTimestamp = new Date(`${date}T${clockInTime}`)
        clockOutTimestamp = new Date(clockInTimestamp.getTime() + (calculatedHours! * 60 * 60 * 1000))
      } else {
        // If only hours provided, use current time as clock out (or a reasonable default)
        clockOutTimestamp = new Date(`${date}T17:00:00`) // Default to 5 PM
      }

      clockOutEntry = await prisma.timeEntry.create({
        data: {
          employeeId: employee.id,
          entryType: 'clock_out',
          timestamp: clockOutTimestamp,
          date: entryDate,
          hoursWorked: calculatedHours
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Manual time entry added successfully',
      clockInEntry,
      clockOutEntry,
      hoursWorked: calculatedHours
    })
  } catch (error: any) {
    console.error('Error adding manual time entry:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to add manual time entry' },
      { status: 500 }
    )
  }
}

