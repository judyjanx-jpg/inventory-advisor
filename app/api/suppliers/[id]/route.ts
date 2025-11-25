import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        products: {
          select: {
            sku: true,
            title: true,
            cost: true,
          },
        },
        _count: {
          select: {
            products: true,
            purchaseOrders: true,
          },
        },
      },
    })

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(supplier)
  } catch (error: any) {
    console.error('Error fetching supplier:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch supplier' },
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
      contactName,
      email,
      phone,
      website,
      address,
      country,
      leadTimeDays,
      paymentTerms,
      minimumOrderValue,
      notes,
      status,
    } = body

    // Build update data object
    const data: any = {}

    if (name !== undefined) data.name = name
    if (contactName !== undefined) data.contactName = contactName || null
    if (email !== undefined) data.email = email || null
    if (phone !== undefined) data.phone = phone || null
    if (website !== undefined) data.website = website || null
    if (address !== undefined) data.address = address || null
    if (country !== undefined) data.country = country || null
    if (leadTimeDays !== undefined) data.leadTimeDays = leadTimeDays ? parseInt(leadTimeDays) : null
    if (paymentTerms !== undefined) data.paymentTerms = paymentTerms || null
    if (minimumOrderValue !== undefined) data.minimumOrderValue = minimumOrderValue ? parseFloat(minimumOrderValue) : null
    if (notes !== undefined) data.notes = notes || null
    if (status !== undefined) data.status = status

    const supplier = await prisma.supplier.update({
      where: { id: parseInt(params.id) },
      data,
      include: {
        _count: {
          select: {
            products: true,
            purchaseOrders: true,
          },
        },
      },
    })

    return NextResponse.json(supplier)
  } catch (error: any) {
    console.error('Error updating supplier:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update supplier' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if supplier has products or POs
    const supplier = await prisma.supplier.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        _count: {
          select: {
            products: true,
            purchaseOrders: true,
          },
        },
      },
    })

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier not found' },
        { status: 404 }
      )
    }

    if (supplier._count.products > 0 || supplier._count.purchaseOrders > 0) {
      return NextResponse.json(
        { error: 'Cannot delete supplier with associated products or purchase orders' },
        { status: 400 }
      )
    }

    await prisma.supplier.delete({
      where: { id: parseInt(params.id) },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting supplier:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete supplier' },
      { status: 500 }
    )
  }
}
