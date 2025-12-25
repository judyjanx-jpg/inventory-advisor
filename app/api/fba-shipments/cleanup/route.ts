import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/fba-shipments/cleanup
 * 
 * Clean up old FBA shipments (older than 180 days)
 * This helps remove old shipments that are no longer relevant for reconciliation
 */
export async function POST(request: NextRequest) {
  try {
    const cutoffDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) // 180 days ago

    // Count old shipments before deletion
    const oldShipmentsCount = await prisma.fbaShipment.count({
      where: {
        createdDate: {
          lt: cutoffDate,
        },
      },
    })

    // Delete old shipments (this will cascade delete items due to onDelete: Cascade)
    const result = await prisma.fbaShipment.deleteMany({
      where: {
        createdDate: {
          lt: cutoffDate,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} old shipments (older than 180 days)`,
      deletedCount: result.count,
      cutoffDate: cutoffDate.toISOString(),
    })

  } catch (error: any) {
    console.error('Error cleaning up old shipments:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cleanup shipments' },
      { status: 500 }
    )
  }
}

