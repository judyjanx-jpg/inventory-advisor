import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT - Update time entry
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entryId = parseInt(params.id)
    if (isNaN(entryId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid entry ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { timestamp, hoursWorked } = body

    if (!timestamp) {
      return NextResponse.json(
        { success: false, error: 'Timestamp is required' },
        { status: 400 }
      )
    }

    // Get the existing entry
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: entryId },
      include: {
        employee: {
          select: {
            id: true
          }
        }
      }
    })

    if (!existingEntry) {
      return NextResponse.json(
        { success: false, error: 'Time entry not found' },
        { status: 404 }
      )
    }

    const entryTime = new Date(timestamp)
    const entryDate = new Date(entryTime.getFullYear(), entryTime.getMonth(), entryTime.getDate())
    entryDate.setHours(0, 0, 0, 0)

    // Update the entry
    const updateData: any = {
      timestamp: entryTime,
      date: entryDate
    }

    // If this is a clock_out entry, handle hours worked
    if (existingEntry.entryType === 'clock_out') {
      if (hoursWorked !== null && hoursWorked !== undefined && hoursWorked !== '') {
        // Use provided hours worked
        updateData.hoursWorked = parseFloat(hoursWorked.toString())
      } else {
        // Auto-calculate from clock in time
        // Find the most recent clock_in before this clock_out
        const clockInEntry = await prisma.timeEntry.findFirst({
          where: {
            employeeId: existingEntry.employee.id,
            entryType: 'clock_in',
            timestamp: {
              lt: entryTime // Use the new timestamp
            }
          },
          orderBy: { timestamp: 'desc' }
        })

        if (clockInEntry) {
          const clockInTime = new Date(clockInEntry.timestamp)
          const clockOutTime = entryTime
          const diffMs = clockOutTime.getTime() - clockInTime.getTime()
          if (diffMs > 0) {
            const diffHours = diffMs / (1000 * 60 * 60)
            updateData.hoursWorked = parseFloat(diffHours.toFixed(2))
          } else {
            updateData.hoursWorked = null
          }
        } else {
          updateData.hoursWorked = null
        }
      }
    }

    const updatedEntry = await prisma.timeEntry.update({
      where: { id: entryId },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      entry: updatedEntry
    })
  } catch (error: any) {
    console.error('Error updating time entry:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete time entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entryId = parseInt(params.id)
    if (isNaN(entryId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid entry ID' },
        { status: 400 }
      )
    }

    // Check if entry exists
    const existingEntry = await prisma.timeEntry.findUnique({
      where: { id: entryId }
    })

    if (!existingEntry) {
      return NextResponse.json(
        { success: false, error: 'Time entry not found' },
        { status: 404 }
      )
    }

    // Delete the entry
    await prisma.timeEntry.delete({
      where: { id: entryId }
    })

    return NextResponse.json({
      success: true
    })
  } catch (error: any) {
    console.error('Error deleting time entry:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

