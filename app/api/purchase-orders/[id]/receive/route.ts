import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { items, receivedDate } = body // { [itemId]: { received: number, damaged: number, backorder: number } }, receivedDate: string (YYYY-MM-DD)

    if (!items || typeof items !== 'object') {
      return NextResponse.json(
        { error: 'Items data is required' },
        { status: 400 }
      )
    }

    const poId = parseInt(params.id)

    // Get the PO with items
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        supplier: true,
      },
    })

    if (!purchaseOrder) {
      return NextResponse.json(
        { error: 'Purchase order not found' },
        { status: 404 }
      )
    }

    const updates = []
    const inventoryUpdates = []
    const backorderCreates = []

    for (const [itemIdStr, quantities] of Object.entries(items)) {
      const itemId = parseInt(itemIdStr)
      const { received, damaged, backorder } = quantities as { received: number; damaged: number; backorder: number }

      const poItem = purchaseOrder.items.find((i: any) => i.id === itemId)
      if (!poItem) continue

      // Calculate new totals
      const newReceived = poItem.quantityReceived + received
      const newDamaged = poItem.quantityDamaged + damaged

      // Validate
      if (newReceived + newDamaged + backorder > poItem.quantityOrdered) {
        return NextResponse.json(
          { error: `Total quantities exceed ordered amount for ${poItem.masterSku}` },
          { status: 400 }
        )
      }

      // Update the PO item
      updates.push(
        prisma.purchaseOrderItem.update({
          where: { id: itemId },
          data: {
            quantityReceived: newReceived,
            quantityDamaged: newDamaged,
          },
        })
      )

      // If this product is linked to others, also mark their PO items as received
      if (poItem.product.physicalProductGroupId && received > 0) {
        // Find all linked products
        const linkedProducts = await prisma.product.findMany({
          where: {
            physicalProductGroupId: poItem.product.physicalProductGroupId,
            sku: { not: poItem.masterSku }, // Exclude the current product
          },
        })

        // Find PO items for linked products in this same PO
        for (const linkedProduct of linkedProducts) {
          const linkedPOItem = purchaseOrder.items.find((i: any) => i.masterSku === linkedProduct.sku)
          if (linkedPOItem) {
            // Mark the linked product's PO item as received with the same quantity
            updates.push(
              prisma.purchaseOrderItem.update({
                where: { id: linkedPOItem.id },
                data: {
                  quantityReceived: linkedPOItem.quantityReceived + received,
                },
              })
            )
            // Also update inventory for linked product (they share physical inventory)
            inventoryUpdates.push(
              prisma.inventoryLevel.upsert({
                where: { masterSku: linkedProduct.sku },
                update: {
                  warehouseAvailable: {
                    increment: received,
                  },
                  warehouseLastSync: new Date(),
                },
                create: {
                  masterSku: linkedProduct.sku,
                  warehouseAvailable: received,
                  fbaAvailable: 0,
                  warehouseLastSync: new Date(),
                },
              })
            )
          }
        }
      }

      // Update inventory (add received goods to warehouse)
      // This updates warehouseAvailable which is used by the forecasting tool
      if (received > 0) {
        inventoryUpdates.push(
          prisma.inventoryLevel.upsert({
            where: { masterSku: poItem.masterSku },
            update: {
              warehouseAvailable: {
                increment: received,
              },
              warehouseLastSync: new Date(),
            },
            create: {
              masterSku: poItem.masterSku,
              warehouseAvailable: received,
              fbaAvailable: 0,
              warehouseLastSync: new Date(),
            },
          })
        )
      }

      // Create backorder if needed
      if (backorder > 0) {
        backorderCreates.push(
          prisma.backorder.create({
            data: {
              poId: poId,
              poNumber: purchaseOrder.poNumber,
              supplierId: purchaseOrder.supplierId,
              masterSku: poItem.masterSku,
              quantity: backorder,
              unitCost: Number(poItem.unitCost),
              status: 'pending',
              createdDate: new Date(),
            },
          })
        )
      }
    }

    // Execute all updates
    await Promise.all([...updates, ...inventoryUpdates, ...backorderCreates])

    // Refresh the PO to check status
    const updatedPO = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    })

    if (updatedPO) {
      const totalOrdered = updatedPO.items.reduce((sum: any, item: any) => sum + item.quantityOrdered, 0)
      const totalReceived = updatedPO.items.reduce((sum: any, item: any) => sum + item.quantityReceived, 0)
      const totalDamaged = updatedPO.items.reduce((sum: any, item: any) => sum + item.quantityDamaged, 0)

      // Check if all items are accounted for (received + damaged + backordered)
      const hasBackorders = backorderCreates.length > 0
      const allReceived = totalReceived + totalDamaged >= totalOrdered

      let newStatus = updatedPO.status
      if (allReceived || (totalReceived > 0 && !hasBackorders && totalReceived + totalDamaged >= totalOrdered)) {
        newStatus = 'received'
      } else if (totalReceived > 0) {
        newStatus = hasBackorders ? 'received' : 'partial' // If backordered, mark as received since remainder is tracked elsewhere
      }

      if (newStatus !== updatedPO.status) {
        // Use provided receivedDate or default to now
        const arrivalDate = receivedDate ? new Date(receivedDate) : new Date()
        await prisma.purchaseOrder.update({
          where: { id: poId },
          data: {
            status: newStatus,
            actualArrivalDate: arrivalDate,
          },
        })

        // Update supplier lead time tracking
        if (newStatus === 'received' && purchaseOrder.expectedArrivalDate) {
          const actualLeadTime = Math.round(
            (new Date().getTime() - new Date(purchaseOrder.createdDate).getTime()) / (1000 * 60 * 60 * 24)
          )
          
          await prisma.supplier.update({
            where: { id: purchaseOrder.supplierId },
            data: {
              avgActualLeadTime: actualLeadTime,
            },
          })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Items received successfully',
      backordersCreated: backorderCreates.length,
    })
  } catch (error: any) {
    console.error('Error receiving items:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to receive items' },
      { status: 500 }
    )
  }
}
