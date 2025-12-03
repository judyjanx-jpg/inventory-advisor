import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get all pending/ordered PO items with expected delivery dates
    const pendingItems = await prisma.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          status: { in: ['pending', 'ordered', 'in_transit', 'partial'] }
        }
      },
      include: {
        product: { select: { sku: true } },
        purchaseOrder: { 
          select: { 
            poNumber: true, 
            expectedDeliveryDate: true,
            status: true
          } 
        }
      }
    })

    // Group by SKU
    const incomingBySku: Record<string, Array<{
      quantity: number
      expectedDate: string
      poNumber: string
    }>> = {}

    for (const item of pendingItems) {
      const sku = item.product.sku
      if (!incomingBySku[sku]) {
        incomingBySku[sku] = []
      }
      
      // Calculate remaining quantity (ordered - received)
      const remainingQty = item.quantity - (item.receivedQuantity || 0)
      
      if (remainingQty > 0) {
        incomingBySku[sku].push({
          quantity: remainingQty,
          expectedDate: item.purchaseOrder.expectedDeliveryDate?.toISOString() || '',
          poNumber: item.purchaseOrder.poNumber || '',
        })
      }
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
