import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/purchase-orders/incoming
 * 
 * Returns all pending/in-transit PO items grouped by SKU
 * with quantity and expected arrival date
 */
export async function GET() {
  try {
    // Get all in-progress PO items (not received/cancelled)
    const pendingItems = await prisma.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          status: { in: ['sent', 'confirmed', 'shipped', 'partial'] }
        }
      },
      include: {
        product: { 
          select: { 
            sku: true,
            title: true 
          } 
        },
        purchaseOrder: { 
          select: { 
            poNumber: true, 
            expectedArrivalDate: true,
            status: true,
            supplier: {
              select: { name: true }
            }
          } 
        }
      }
    })

    // Group by SKU with multiple incoming shipments
    const incomingBySku: Record<string, {
      totalQuantity: number
      items: Array<{
        quantity: number
        expectedDate: string | null
        daysUntil: number | null
        poNumber: string
        status: string
        supplierName: string
      }>
    }> = {}

    const now = new Date()
    now.setHours(0, 0, 0, 0) // Start of today

    for (const item of pendingItems) {
      const sku = item.masterSku
      if (!incomingBySku[sku]) {
        incomingBySku[sku] = {
          totalQuantity: 0,
          items: []
        }
      }
      
      // Calculate remaining quantity (ordered - received)
      const remainingQty = item.quantityOrdered - (item.quantityReceived || 0)
      
      if (remainingQty > 0) {
        // Calculate days until expected arrival
        let daysUntil: number | null = null
        const expectedDate = item.purchaseOrder.expectedArrivalDate
        
        if (expectedDate) {
          const expected = new Date(expectedDate)
          expected.setHours(0, 0, 0, 0)
          daysUntil = Math.ceil((expected.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        }
        
        incomingBySku[sku].totalQuantity += remainingQty
        incomingBySku[sku].items.push({
          quantity: remainingQty,
          expectedDate: expectedDate?.toISOString() || null,
          daysUntil,
          poNumber: item.purchaseOrder.poNumber || '',
          status: item.purchaseOrder.status,
          supplierName: item.purchaseOrder.supplier?.name || 'Unknown',
        })
      }
    }

    // Sort each SKU's items by expected date (earliest first)
    for (const sku of Object.keys(incomingBySku)) {
      incomingBySku[sku].items.sort((a, b) => {
        if (!a.expectedDate) return 1
        if (!b.expectedDate) return -1
        return new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime()
      })
    }

    return NextResponse.json({
      success: true,
      incoming: incomingBySku,
    })

  } catch (error: any) {
    console.error('Incoming PO API error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      incoming: {},
    })
  }
}
