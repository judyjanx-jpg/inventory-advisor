import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - List all templates
export async function GET(request: NextRequest) {
  try {
    // For now, return empty array - templates will be stored in a new table
    // TODO: Create email_templates table in schema
    return NextResponse.json({ templates: [] })
  } catch (error: any) {
    console.error('Error fetching templates:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

// POST - Create new template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, supplierId, subject, body: templateBody } = body

    // TODO: Create email_templates table and implement
    // For now, just return success
    return NextResponse.json({
      id: Date.now().toString(),
      name,
      supplierId: supplierId ? parseInt(supplierId) : null,
      subject,
      body: templateBody,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Error creating template:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create template' },
      { status: 500 }
    )
  }
}

