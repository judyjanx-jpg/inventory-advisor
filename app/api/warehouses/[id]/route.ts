import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        inventory: {
          include: {
            product: {
              select: {
                sku: true,
                title: true,
              },
            },
          },
        },
      },
    })

    if (!warehouse) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(warehouse)
  } catch (error: any) {
    console.error('Error fetching warehouse:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch warehouse' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      isActive,
      isDefault,
    } = body

    // If this is set as default, unset other defaults
    if (isDefault) {
      await prisma.warehouse.updateMany({
        where: {
          isDefault: true,
          id: { not: parseInt(params.id) },
        },
        data: { isDefault: false },
      })
    }

    const warehouse = await prisma.warehouse.update({
      where: { id: parseInt(params.id) },
      data: {
        name,
        code: code?.toUpperCase(),
        address,
        city,
        state,
        country,
        zipCode,
        contactName,
        contactEmail,
        contactPhone,
        isActive,
        isDefault,
      },
    })

    return NextResponse.json(warehouse)
  } catch (error: any) {
    console.error('Error updating warehouse:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update warehouse' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.warehouse.delete({
      where: { id: parseInt(params.id) },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting warehouse:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete warehouse' },
      { status: 500 }
    )
  }
}

