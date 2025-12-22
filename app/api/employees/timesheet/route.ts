import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Helper function to get date range based on pay period
function getPayPeriodRange(payPeriod: string, referenceDate: Date = new Date()) {
  const date = new Date(referenceDate)
  
  if (payPeriod === 'weekly') {
    // Week ending Saturday (week starts Sunday)
    const day = date.getDay() // 0 = Sunday, 6 = Saturday
    // Calculate days to Saturday (if today is Sunday=0, we want Saturday=6, so 6 days)
    // If today is Saturday, daysToSaturday = 0
    const daysToSaturday = day === 6 ? 0 : (6 - day)
    const weekEnd = new Date(date)
    weekEnd.setDate(date.getDate() + daysToSaturday)
    weekEnd.setHours(23, 59, 59, 999)
    
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekEnd.getDate() - 6)
    weekStart.setHours(0, 0, 0, 0)
    
    return { start: weekStart, end: weekEnd, label: `Week ending ${weekEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` }
  } else if (payPeriod === 'bi-weekly') {
    const day = date.getDate()
    const month = date.getMonth()
    const year = date.getFullYear()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    
    if (day <= 15) {
      // First half: 1-15
      const start = new Date(year, month, 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date(year, month, 15)
      end.setHours(23, 59, 59, 999)
      return { start, end, label: `${month + 1}/1 - ${month + 1}/15` }
    } else {
      // Second half: 16-end of month
      const start = new Date(year, month, 16)
      start.setHours(0, 0, 0, 0)
      const end = new Date(year, month, daysInMonth)
      end.setHours(23, 59, 59, 999)
      return { start, end, label: `${month + 1}/16 - ${month + 1}/${daysInMonth}` }
    }
  } else {
    // Monthly
    const month = date.getMonth()
    const year = date.getFullYear()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    
    const start = new Date(year, month, 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(year, month, daysInMonth)
    end.setHours(23, 59, 59, 999)
    
    return { start, end, label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
  }
}

// GET - Get timesheet data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const employeeId = searchParams.get('employeeId')
    const referenceDate = searchParams.get('referenceDate')

    let start: Date
    let end: Date
    let periodLabel: string | null = null

    // If employeeId is provided, get their pay period and calculate range
    if (employeeId && !startDate && !endDate) {
      const employee = await prisma.employee.findUnique({
        where: { id: parseInt(employeeId) },
        select: { payPeriod: true }
      })
      
      const payPeriod = employee?.payPeriod || 'weekly'
      const refDate = referenceDate ? new Date(referenceDate) : new Date()
      const range = getPayPeriodRange(payPeriod, refDate)
      start = range.start
      end = range.end
      periodLabel = range.label
    } else {
      start = startDate ? new Date(startDate) : new Date()
      end = endDate ? new Date(endDate) : new Date()
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    }

    // Get all time entries in date range
    const where: any = {
      date: {
        gte: start,
        lte: end
      }
    }

    if (employeeId) {
      where.employeeId = parseInt(employeeId)
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            name: true,
            payPeriod: true
          }
        }
      },
      orderBy: [
        { employeeId: 'asc' },
        { date: 'asc' },
        { timestamp: 'asc' }
      ]
    })

    // Group by employee and date, calculate daily totals
    const timesheet: Record<string, Record<string, {
      entries: any[]
      totalHours: number
    }>> = {}

    timeEntries.forEach(entry => {
      const empKey = `${entry.employee.id}-${entry.employee.employeeNumber}`
      const dateKey = entry.date.toISOString().split('T')[0]

      if (!timesheet[empKey]) {
        timesheet[empKey] = {}
      }

      if (!timesheet[empKey][dateKey]) {
        timesheet[empKey][dateKey] = {
          entries: [],
          totalHours: 0
        }
      }

      timesheet[empKey][dateKey].entries.push(entry)

      // If this is a clock_out with hours worked, add to total
      if (entry.entryType === 'clock_out' && entry.hoursWorked) {
        timesheet[empKey][dateKey].totalHours += parseFloat(entry.hoursWorked.toString())
      }
    })

    // Format for response
    const formatted = Object.entries(timesheet).map(([empKey, dates]) => {
      const [empId, empNumber] = empKey.split('-')
      const firstEntry = timeEntries.find(e => e.employee.id.toString() === empId)
      const employee = firstEntry?.employee

      const daysArray = Object.entries(dates).map(([date, data]) => ({
        date,
        totalHours: parseFloat(data.totalHours.toFixed(2)),
        entries: data.entries.map(e => ({
          id: e.id,
          entryType: e.entryType,
          timestamp: e.timestamp,
          hoursWorked: e.hoursWorked ? parseFloat(e.hoursWorked.toString()) : null
        }))
      }))

      // Calculate period total
      const periodTotal = daysArray.reduce((sum, day) => sum + day.totalHours, 0)

      return {
        employee: {
          id: employee?.id,
          employeeNumber: employee?.employeeNumber,
          name: employee?.name,
          payPeriod: employee?.payPeriod || 'weekly'
        },
        periodLabel: periodLabel,
        periodTotal: parseFloat(periodTotal.toFixed(2)),
        days: daysArray
      }
    })

    return NextResponse.json({ success: true, timesheet: formatted })
  } catch (error: any) {
    console.error('Error fetching timesheet:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

