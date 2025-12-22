import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - List all employees
export async function GET(request: NextRequest) {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { employeeNumber: 'asc' },
      include: {
        _count: {
          select: { timeEntries: true }
        }
      }
    })

    return NextResponse.json({ success: true, employees })
  } catch (error: any) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Create new employee
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { employeeNumber, name, startDate, payType, payRate } = body

    // Validate required fields
    if (!employeeNumber || !name || !startDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (employee number, name, and start date are required)' },
        { status: 400 }
      )
    }

    // Validate employee number is 4 digits
    if (!/^\d{4}$/.test(employeeNumber)) {
      return NextResponse.json(
        { success: false, error: 'Employee number must be 4 digits' },
        { status: 400 }
      )
    }

    // Check if employee number already exists
    const existing = await prisma.employee.findUnique({
      where: { employeeNumber }
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Employee number already exists' },
        { status: 400 }
      )
    }

    const employee = await prisma.employee.create({
      data: {
        employeeNumber,
        name,
        startDate: new Date(startDate),
        payType: payType || null,
        payRate: payRate ? parseFloat(payRate) : null,
        payPeriod: body.payPeriod || 'weekly'
      }
    })

    return NextResponse.json({ success: true, employee })
  } catch (error: any) {
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT - Update employee
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, employeeNumber, name, startDate, payType, payRate, payPeriod, isActive } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Employee ID required' },
        { status: 400 }
      )
    }

    // If employee number is being changed, validate it
    if (employeeNumber && !/^\d{4}$/.test(employeeNumber)) {
      return NextResponse.json(
        { success: false, error: 'Employee number must be 4 digits' },
        { status: 400 }
      )
    }

    // Check if employee number already exists (if changing)
    if (employeeNumber) {
      const existing = await prisma.employee.findFirst({
        where: {
          employeeNumber,
          id: { not: parseInt(id) }
        }
      })

      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Employee number already exists' },
          { status: 400 }
        )
      }
    }

    const updateData: any = {}
    if (employeeNumber !== undefined) updateData.employeeNumber = employeeNumber
    if (name !== undefined) updateData.name = name
    if (startDate !== undefined) updateData.startDate = new Date(startDate)
    if (payType !== undefined) updateData.payType = payType || null
    if (payRate !== undefined) updateData.payRate = payRate ? parseFloat(payRate) : null
    if (payPeriod !== undefined) updateData.payPeriod = payPeriod || 'weekly'
    if (isActive !== undefined) updateData.isActive = isActive

    const employee = await prisma.employee.update({
      where: { id: parseInt(id) },
      data: updateData
    })

    return NextResponse.json({ success: true, employee })
  } catch (error: any) {
    console.error('Error updating employee:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete employee
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Employee ID required' },
        { status: 400 }
      )
    }

    await prisma.employee.delete({
      where: { id: parseInt(id) }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting employee:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

