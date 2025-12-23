import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/fba-shipments/reconcile
 *
 * List FBA shipments for reconciliation
 * Query params:
 * - status: 'pending' | 'accepted' | 'deducted' | 'all' (default: 'pending')
 * - limit: number (default: 50)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build where clause
    const where: any = {}
    if (status !== 'all') {
      where.reconciliationStatus = status
    }

    // Get total count
    const total = await prisma.fbaShipment.count({ where })

    // Get shipments with items
    const shipments = await prisma.fbaShipment.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                sku: true,
                title: true,
                fnsku: true,
                asin: true,
              },
            },
          },
        },
      },
      orderBy: [
        { reconciliationStatus: 'asc' }, // pending first
        { createdDate: 'desc' },
      ],
      take: limit,
      skip: offset,
    })

    // Get warehouses for the UI dropdown
    const warehouses = await prisma.warehouse.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        isDefault: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    })

    // Format response
    const formattedShipments = shipments.map((shipment) => ({
      id: shipment.id,
      shipmentId: shipment.shipmentId,
      internalId: shipment.internalId,
      status: shipment.status,
      destinationFc: shipment.destinationFc,
      destinationName: shipment.destinationName,
      channel: shipment.channel,
      createdDate: shipment.createdDate,
      shipDate: shipment.shipDate,
      totalUnits: shipment.totalUnits,
      unitsShipped: shipment.unitsShipped,
      unitsReceived: shipment.unitsReceived,
      unitsDiscrepancy: shipment.unitsDiscrepancy,
      // Reconciliation fields
      reconciliationStatus: shipment.reconciliationStatus,
      reconciledAt: shipment.reconciledAt,
      reconciledBy: shipment.reconciledBy,
      deductedFromWarehouseId: shipment.deductedFromWarehouseId,
      inventoryDeducted: shipment.inventoryDeducted,
      reconciliationNotes: shipment.reconciliationNotes,
      // Items
      items: shipment.items.map((item) => ({
        id: item.id,
        masterSku: item.masterSku,
        channelSku: item.channelSku,
        productName: item.product?.title || 'Unknown',
        fnsku: item.product?.fnsku,
        asin: item.product?.asin,
        quantityShipped: item.quantityShipped,
        quantityReceived: item.quantityReceived,
        quantityDiscrepancy: item.quantityDiscrepancy,
      })),
    }))

    return NextResponse.json({
      success: true,
      shipments: formattedShipments,
      warehouses,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + shipments.length < total,
      },
      summary: {
        pending: await prisma.fbaShipment.count({ where: { reconciliationStatus: 'pending' } }),
        accepted: await prisma.fbaShipment.count({ where: { reconciliationStatus: 'accepted' } }),
        deducted: await prisma.fbaShipment.count({ where: { reconciliationStatus: 'deducted' } }),
      },
    })
  } catch (error: any) {
    console.error('Error listing FBA shipments for reconciliation:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to list shipments' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/fba-shipments/reconcile
 *
 * Reconcile an FBA shipment
 * Body:
 * - shipmentId: number - The internal FBA shipment ID
 * - action: 'accept' | 'deduct' - What to do with this shipment
 * - warehouseId: number (required for 'deduct' action)
 * - notes: string (optional) - Reconciliation notes
 * - reconciledBy: string (optional) - Who is reconciling
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shipmentId, action, warehouseId, notes, reconciledBy } = body

    if (!shipmentId) {
      return NextResponse.json({ error: 'Shipment ID is required' }, { status: 400 })
    }

    if (!action || !['accept', 'deduct'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "accept" or "deduct"' }, { status: 400 })
    }

    // Get the shipment
    const shipment = await prisma.fbaShipment.findUnique({
      where: { id: shipmentId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    // Check if already reconciled
    if (shipment.reconciliationStatus !== 'pending') {
      return NextResponse.json({
        error: `Shipment already reconciled as "${shipment.reconciliationStatus}" on ${shipment.reconciledAt}`,
        shipment: {
          id: shipment.id,
          shipmentId: shipment.shipmentId,
          reconciliationStatus: shipment.reconciliationStatus,
          reconciledAt: shipment.reconciledAt,
          reconciledBy: shipment.reconciledBy,
        },
      }, { status: 400 })
    }

    // Handle ACCEPT action - just mark as reconciled without deducting
    if (action === 'accept') {
      const updatedShipment = await prisma.fbaShipment.update({
        where: { id: shipmentId },
        data: {
          reconciliationStatus: 'accepted',
          reconciledAt: new Date(),
          reconciledBy: reconciledBy || 'system',
          reconciliationNotes: notes || 'Accepted without inventory deduction',
          inventoryDeducted: false,
        },
      })

      return NextResponse.json({
        success: true,
        action: 'accept',
        message: `Shipment ${shipment.shipmentId} accepted without inventory deduction`,
        shipment: {
          id: updatedShipment.id,
          shipmentId: updatedShipment.shipmentId,
          reconciliationStatus: updatedShipment.reconciliationStatus,
          reconciledAt: updatedShipment.reconciledAt,
          inventoryDeducted: updatedShipment.inventoryDeducted,
        },
      })
    }

    // Handle DEDUCT action - deduct inventory from specified warehouse
    if (action === 'deduct') {
      if (!warehouseId) {
        return NextResponse.json({ error: 'Warehouse ID is required for deduct action' }, { status: 400 })
      }

      // Validate warehouse exists
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: warehouseId },
      })

      if (!warehouse) {
        return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
      }

      // Process each item and deduct inventory
      const deductions: any[] = []
      let totalUnitsDeducted = 0
      const errors: string[] = []

      for (const item of shipment.items) {
        const masterSku = item.masterSku
        const quantityToDeduct = item.quantityShipped

        // Get current warehouse inventory
        const warehouseInventory = await prisma.warehouseInventory.findUnique({
          where: {
            warehouseId_masterSku: {
              warehouseId,
              masterSku,
            },
          },
        })

        const currentAvailable = warehouseInventory?.available || 0
        const newAvailable = Math.max(0, currentAvailable - quantityToDeduct)

        // Update warehouse inventory
        if (warehouseInventory) {
          await prisma.warehouseInventory.update({
            where: { id: warehouseInventory.id },
            data: { available: newAvailable },
          })
        } else {
          // Create warehouse inventory record if it doesn't exist (with 0 or negative)
          await prisma.warehouseInventory.create({
            data: {
              warehouseId,
              masterSku,
              available: 0, // Can't go below 0
            },
          })
        }

        // Update aggregated inventory level
        const inventoryLevel = await prisma.inventoryLevel.findUnique({
          where: { masterSku },
        })

        if (inventoryLevel) {
          const newWarehouseAvailable = Math.max(0, inventoryLevel.warehouseAvailable - quantityToDeduct)
          await prisma.inventoryLevel.update({
            where: { masterSku },
            data: { warehouseAvailable: newWarehouseAvailable },
          })
        }

        // Create inventory adjustment record for audit trail
        await prisma.inventoryAdjustment.create({
          data: {
            masterSku,
            location: 'warehouse',
            adjustmentType: 'fba_shipment',
            quantityChange: -quantityToDeduct,
            quantityBefore: currentAvailable,
            quantityAfter: newAvailable,
            reason: `FBA Shipment ${shipment.shipmentId} reconciliation`,
            reference: shipment.shipmentId,
          },
        })

        deductions.push({
          masterSku,
          productName: item.product?.title || 'Unknown',
          quantityDeducted: quantityToDeduct,
          warehouseInventoryBefore: currentAvailable,
          warehouseInventoryAfter: newAvailable,
        })

        totalUnitsDeducted += quantityToDeduct
      }

      // Update shipment as reconciled
      const updatedShipment = await prisma.fbaShipment.update({
        where: { id: shipmentId },
        data: {
          reconciliationStatus: 'deducted',
          reconciledAt: new Date(),
          reconciledBy: reconciledBy || 'system',
          deductedFromWarehouseId: warehouseId,
          inventoryDeducted: true,
          reconciliationNotes: notes || `Deducted ${totalUnitsDeducted} units from ${warehouse.name}`,
        },
      })

      return NextResponse.json({
        success: true,
        action: 'deduct',
        message: `Deducted ${totalUnitsDeducted} units from ${warehouse.name} for shipment ${shipment.shipmentId}`,
        shipment: {
          id: updatedShipment.id,
          shipmentId: updatedShipment.shipmentId,
          reconciliationStatus: updatedShipment.reconciliationStatus,
          reconciledAt: updatedShipment.reconciledAt,
          inventoryDeducted: updatedShipment.inventoryDeducted,
          deductedFromWarehouseId: updatedShipment.deductedFromWarehouseId,
        },
        warehouse: {
          id: warehouse.id,
          name: warehouse.name,
          code: warehouse.code,
        },
        summary: {
          itemsProcessed: deductions.length,
          totalUnitsDeducted,
        },
        deductions,
        errors: errors.length > 0 ? errors : undefined,
      })
    }

  } catch (error: any) {
    console.error('Error reconciling FBA shipment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to reconcile shipment' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/fba-shipments/reconcile
 *
 * Undo a reconciliation (reset to pending)
 * Only allowed for 'accepted' shipments (not deducted ones since inventory was already changed)
 * Body:
 * - shipmentId: number
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { shipmentId } = body

    if (!shipmentId) {
      return NextResponse.json({ error: 'Shipment ID is required' }, { status: 400 })
    }

    const shipment = await prisma.fbaShipment.findUnique({
      where: { id: shipmentId },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (shipment.reconciliationStatus === 'pending') {
      return NextResponse.json({ error: 'Shipment is already pending' }, { status: 400 })
    }

    if (shipment.reconciliationStatus === 'deducted') {
      return NextResponse.json({
        error: 'Cannot undo deducted shipment. Inventory has already been adjusted. Please create a manual inventory adjustment to reverse.',
      }, { status: 400 })
    }

    // Reset to pending
    const updatedShipment = await prisma.fbaShipment.update({
      where: { id: shipmentId },
      data: {
        reconciliationStatus: 'pending',
        reconciledAt: null,
        reconciledBy: null,
        deductedFromWarehouseId: null,
        inventoryDeducted: false,
        reconciliationNotes: null,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Shipment ${shipment.shipmentId} reset to pending`,
      shipment: {
        id: updatedShipment.id,
        shipmentId: updatedShipment.shipmentId,
        reconciliationStatus: updatedShipment.reconciliationStatus,
      },
    })

  } catch (error: any) {
    console.error('Error undoing FBA shipment reconciliation:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to undo reconciliation' },
      { status: 500 }
    )
  }
}
