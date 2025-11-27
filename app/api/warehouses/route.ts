import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        _count: {
          select: {
            inventory: true,
          },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    })

    return NextResponse.json(warehouses)
  } catch (error: any) {
    console.error('Error fetching warehouses:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch warehouses' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      code,
      address,
      city,
      state,
      country,
      zipCode,
      contactName,
      contactEmail,
      contactPhone,
      isDefault,
    } = body

    // If this is set as default, unset other defaults
    if (isDefault) {
      await prisma.warehouse.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        name,
        code: code.toUpperCase(),
        address,
        city,
        state,
        country: country || 'US',
        zipCode,
        contactName,
        contactEmail,
        contactPhone,
        isDefault: isDefault || false,
      },
    })

    return NextResponse.json(warehouse)
  } catch (error: any) {
    console.error('Error creating warehouse:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create warehouse' },
      { status: 500 }
    )
  }
}

