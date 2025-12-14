import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireInternalAccess } from '@/lib/internal-auth'

// GET - List support tickets (internal)
export async function GET(request: NextRequest) {
  const authError = requireInternalAccess(request)
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // comma-separated list
    const category = searchParams.get('category')
    const priority = searchParams.get('priority')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = {}

    if (status) {
      const statuses = status.split(',').map(s => s.trim())
      where.status = { in: statuses }
    }

    if (category) {
      where.category = category
    }

    if (priority) {
      where.priority = priority
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        take: limit,
        skip: offset,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          customerEmail: true,
          customerName: true,
          status: true,
          priority: true,
          category: true,
          channel: true,
          orderId: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
        }
      }),
      prisma.supportTicket.count({ where })
    ])

    return NextResponse.json({
      tickets,
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('[Tickets] List error:', error)
    return NextResponse.json(
      { error: 'Unable to fetch tickets' },
      { status: 500 }
    )
  }
}

