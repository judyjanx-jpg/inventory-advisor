import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST - Backfill pending audit items from existing received POs
export async function POST(request: NextRequest) {
  try {
    // Get all PO items that have been received but aren't in pending audit yet
    const receivedItems = await prisma.purchaseOrderItem.findMany({
      where: {
        quantityReceived: { gt: 0 },
      },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            status: true,
            actualArrivalDate: true,
          },
        },
      },
    })

    // Filter to only include items from POs that are received or partial
    const itemsToAdd = receivedItems.filter(item => 
      item.purchaseOrder.status === 'received' || item.purchaseOrder.status === 'partial'
    )

    if (itemsToAdd.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No received items to backfill',
        added: 0,
      })
    }

    // Check which items already exist in pending audit
    const existingPending = await prisma.pendingAuditItem.findMany({
      where: {
        auditedAt: null,
      },
      select: {
        masterSku: true,
        sourceId: true,
      },
    })

    const existingKeys = new Set(
      existingPending.map(p => `${p.masterSku}-${p.sourceId}`)
    )

    // Filter out items that already exist
    const newItems = itemsToAdd.filter(item => 
      !existingKeys.has(`${item.masterSku}-${item.purchaseOrder.id}`)
    )

    if (newItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All received items already in pending audit',
        added: 0,
      })
    }

    // Add new items to pending audit
    const created = await prisma.$transaction(
      newItems.map(item =>
        prisma.pendingAuditItem.upsert({
          where: {
            masterSku_sourceType_sourceId: {
              masterSku: item.masterSku,
              sourceType: 'po_received',
              sourceId: item.purchaseOrder.id,
            },
          },
          update: {
            quantityReceived: item.quantityReceived,
          },
          create: {
            masterSku: item.masterSku,
            sourceType: 'po_received',
            sourceId: item.purchaseOrder.id,
            poNumber: item.purchaseOrder.poNumber,
            quantityReceived: item.quantityReceived,
          },
        })
      )
    )

    return NextResponse.json({
      success: true,
      message: `Added ${created.length} items to pending audit`,
      added: created.length,
      items: newItems.map(i => ({
        sku: i.masterSku,
        poNumber: i.purchaseOrder.poNumber,
        quantityReceived: i.quantityReceived,
      })),
    })
  } catch (error: any) {
    console.error('Error backfilling pending audit items:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to backfill pending audit items' },
      { status: 500 }
    )
  }
}

