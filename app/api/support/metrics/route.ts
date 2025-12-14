import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Get support metrics for dashboard
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Ticket statistics
    const [
      totalTickets,
      openTickets,
      pendingTickets,
      resolvedTickets,
      ticketsByCategory,
      ticketsByChannel,
      ticketsByDay,
      avgResolutionTime,
    ] = await Promise.all([
      // Total tickets
      prisma.supportTicket.count(),

      // Open tickets
      prisma.supportTicket.count({
        where: { status: 'OPEN' }
      }),

      // Pending tickets
      prisma.supportTicket.count({
        where: { status: 'PENDING' }
      }),

      // Resolved in period
      prisma.supportTicket.count({
        where: {
          status: { in: ['RESOLVED', 'CLOSED'] },
          resolvedAt: { gte: startDate }
        }
      }),

      // By category
      prisma.supportTicket.groupBy({
        by: ['category'],
        _count: { category: true }
      }),

      // By channel
      prisma.supportTicket.groupBy({
        by: ['channel'],
        _count: { channel: true }
      }),

      // Tickets created per day
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM support_tickets
        WHERE created_at >= ${startDate}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      ` as Promise<Array<{ date: Date; count: bigint }>>,

      // Average resolution time (resolved tickets only)
      prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_hours
        FROM support_tickets
        WHERE resolved_at IS NOT NULL
          AND created_at >= ${startDate}
      ` as Promise<Array<{ avg_hours: number | null }>>,
    ])

    // Warranty claim statistics
    const [
      totalClaims,
      pendingClaims,
      completedClaims,
      claimsByType,
      claimsByStatus,
    ] = await Promise.all([
      prisma.warrantyClaim.count(),
      prisma.warrantyClaim.count({
        where: { status: { in: ['PENDING_RETURN', 'RETURN_SHIPPED', 'PROCESSING'] } }
      }),
      prisma.warrantyClaim.count({
        where: { status: 'COMPLETED', createdAt: { gte: startDate } }
      }),
      prisma.warrantyClaim.groupBy({
        by: ['claimType'],
        _count: { claimType: true }
      }),
      prisma.warrantyClaim.groupBy({
        by: ['status'],
        _count: { status: true }
      }),
    ])

    // Chat session statistics
    const [
      totalSessions,
      escalatedSessions,
    ] = await Promise.all([
      prisma.chatSession.count({
        where: { startedAt: { gte: startDate } }
      }),
      prisma.chatSession.count({
        where: {
          startedAt: { gte: startDate },
          escalatedToTicketId: { not: null }
        }
      }),
    ])

    // Recent tickets for activity feed
    const recentTickets = await prisma.supportTicket.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        priority: true,
        category: true,
        customerName: true,
        createdAt: true,
      }
    })

    // Recent warranty claims
    const recentClaims = await prisma.warrantyClaim.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        claimNumber: true,
        customerName: true,
        claimType: true,
        status: true,
        createdAt: true,
      }
    })

    return NextResponse.json({
      period: { days, startDate: startDate.toISOString() },

      tickets: {
        total: totalTickets,
        open: openTickets,
        pending: pendingTickets,
        resolved: resolvedTickets,
        byCategory: ticketsByCategory.map(c => ({ category: c.category, count: c._count.category })),
        byChannel: ticketsByChannel.map(c => ({ channel: c.channel, count: c._count.channel })),
        byDay: (ticketsByDay as any[]).map(d => ({ 
          date: d.date, 
          count: Number(d.count) 
        })),
        avgResolutionHours: avgResolutionTime[0]?.avg_hours 
          ? Math.round(avgResolutionTime[0].avg_hours * 10) / 10 
          : null,
      },

      warrantyClaims: {
        total: totalClaims,
        pending: pendingClaims,
        completed: completedClaims,
        byType: claimsByType.map(c => ({ type: c.claimType, count: c._count.claimType })),
        byStatus: claimsByStatus.map(c => ({ status: c.status, count: c._count.status })),
      },

      chat: {
        totalSessions,
        escalated: escalatedSessions,
        escalationRate: totalSessions > 0 
          ? Math.round((escalatedSessions / totalSessions) * 100) 
          : 0,
      },

      recentActivity: {
        tickets: recentTickets,
        claims: recentClaims,
      },
    })
  } catch (error) {
    console.error('[Metrics] Error:', error)
    return NextResponse.json(
      { error: 'Unable to fetch metrics' },
      { status: 500 }
    )
  }
}

