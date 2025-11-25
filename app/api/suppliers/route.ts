import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      include: {
        _count: {
          select: {
            products: true,
            purchaseOrders: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(suppliers)
  } catch (error: any) {
    console.error('Error fetching suppliers:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch suppliers' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
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
    } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Supplier name is required' },
        { status: 400 }
      )
    }

    // Build the data object, only including non-empty values
    const data: any = {
      name,
      status: 'active',
    }

    // Only add optional fields if they have values
    if (contactName) data.contactName = contactName
    if (email) data.email = email
    if (phone) data.phone = phone
    if (website) data.website = website
    if (address) data.address = address
    if (country) data.country = country
    if (leadTimeDays) data.leadTimeDays = parseInt(leadTimeDays) || null
    if (paymentTerms) data.paymentTerms = paymentTerms
    if (minimumOrderValue) data.minimumOrderValue = parseFloat(minimumOrderValue) || null
    if (notes) data.notes = notes

    const supplier = await prisma.supplier.create({
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
    console.error('Error creating supplier:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create supplier' },
      { status: 500 }
    )
  }
}
