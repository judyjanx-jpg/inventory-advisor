import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PUT - Update template
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { name, supplierId, subject, body: templateBody } = body

    // TODO: Update template in database
    return NextResponse.json({
      id: params.id,
      name,
      supplierId: supplierId ? parseInt(supplierId) : null,
      subject,
      body: templateBody,
      updatedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Error updating template:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update template' },
      { status: 500 }
    )
  }
}

// DELETE - Delete template
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // TODO: Delete template from database
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting template:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete template' },
      { status: 500 }
    )
  }
}

