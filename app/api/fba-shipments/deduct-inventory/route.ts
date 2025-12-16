import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient } from '@/lib/amazon-sp-api'
import {
  listInboundPlans,
  getShipment,
  listShipmentItems,
} from '@/lib/fba-inbound-v2024'

const API_VERSION = '2024-03-20'

// Helper to call the Fulfillment Inbound v2024 API
async function callFbaInboundApi(
  client: any,
  operation: string,
  params: {
    path?: Record<string, string>
    query?: Record<string, any>
    body?: any
  } = {}
): Promise<any> {
  return client.callAPI({
    operation,
    endpoint: 'fulfillmentInbound',
    options: { version: API_VERSION },
    path: params.path,
    query: params.query,
    body: params.body,
  })
}

/**
 * Find a shipment across all inbound plans
 * Returns { inboundPlanId, shipment } if found
 *
 * Supports matching by:
 * - shipmentId (internal API ID)
 * - shipmentConfirmationId (what users see in Send to Amazon UI, e.g., FBA193YSY6V4)
 */
async function findShipmentInPlans(
  client: any,
  targetShipmentId: string
): Promise<{ inboundPlanId: string; shipment: any } | null> {
  let paginationToken: string | undefined

  // Search through all inbound plans
  do {
    const plansResponse = await listInboundPlans({
      pageSize: 20,
      paginationToken,
    })

    for (const plan of plansResponse.inboundPlans) {
      // For each plan, list its shipments
      try {
        const shipmentsResponse = await callFbaInboundApi(client, 'listInboundPlanShipments', {
          path: { inboundPlanId: plan.inboundPlanId },
        })

        const shipments = shipmentsResponse.shipments || []

        // Check if our target shipment is in this plan
        for (const shipment of shipments) {
          // First check if it matches by shipmentId directly
          if (shipment.shipmentId === targetShipmentId) {
            const fullShipment = await getShipment(plan.inboundPlanId, shipment.shipmentId)
            return {
              inboundPlanId: plan.inboundPlanId,
              shipment: fullShipment,
            }
          }

          // Also check by shipmentConfirmationId (what users see in STA UI)
          // Need to get full shipment details to access shipmentConfirmationId
          try {
            const fullShipment = await getShipment(plan.inboundPlanId, shipment.shipmentId)
            if (fullShipment.shipmentConfirmationId === targetShipmentId) {
              return {
                inboundPlanId: plan.inboundPlanId,
                shipment: fullShipment,
              }
            }
          } catch (shipmentError) {
            // Could not get shipment details, continue to next
            console.log(`Error getting shipment ${shipment.shipmentId}:`, shipmentError)
          }
        }
      } catch (error) {
        // Plan might not have shipments yet, continue searching
        console.log(`Error listing shipments for plan ${plan.inboundPlanId}:`, error)
      }
    }

    paginationToken = plansResponse.pagination?.token
  } while (paginationToken)

  return null
}

/**
 * POST /api/fba-shipments/deduct-inventory
 *
 * Fetch an FBA shipment from Amazon by shipment ID and deduct
 * the inventory from a specified warehouse.
 *
 * Body:
 * - amazonShipmentId: string - The FBA shipment ID (e.g., "FBA193YSY6V4")
 * - warehouseId: number - The warehouse to deduct inventory from
 * - inboundPlanId: string (optional) - If known, speeds up lookup
 * - dryRun: boolean - If true, preview changes without applying them
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amazonShipmentId, warehouseId, inboundPlanId: providedPlanId, dryRun = false } = body

    if (!amazonShipmentId) {
      return NextResponse.json({ error: 'Amazon Shipment ID is required' }, { status: 400 })
    }

    if (!warehouseId) {
      return NextResponse.json({ error: 'Warehouse ID is required' }, { status: 400 })
    }

    // Validate warehouse exists
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    })

    if (!warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    }

    const client = await createSpApiClient()

    let inboundPlanId: string | null = providedPlanId || null
    let shipmentItems: Array<{ msku: string; quantity: number }> = []

    // First, check if we have this shipment stored locally
    const localShipment = await prisma.amazonShipmentSplit.findUnique({
      where: { amazonShipmentId },
      include: {
        shipment: {
          include: {
            items: true,
          },
        },
      },
    })

    if (localShipment?.shipment?.amazonInboundPlanId) {
      // We have the inbound plan ID stored locally
      inboundPlanId = localShipment.shipment.amazonInboundPlanId
    }

    // Track the actual shipmentId (internal API ID) for fetching items
    let actualShipmentId: string | null = null

    // If we have an inbound plan ID, get the shipment directly
    if (inboundPlanId) {
      try {
        const shipment = await getShipment(inboundPlanId, amazonShipmentId)
        actualShipmentId = shipment.shipmentId || amazonShipmentId
        // Try to get items from shipment response first
        shipmentItems = shipment.items || []
        // If no items in response, fetch via listShipmentItems
        if (shipmentItems.length === 0) {
          const itemsResponse = await listShipmentItems(inboundPlanId, actualShipmentId)
          shipmentItems = itemsResponse.items || []
        }
      } catch (error: any) {
        console.log('Error getting shipment with provided plan ID:', error.message)
        // Fall through to search
        inboundPlanId = null
      }
    }

    // If we still don't have items, search through all inbound plans
    if (shipmentItems.length === 0 && !inboundPlanId) {
      const found = await findShipmentInPlans(client, amazonShipmentId)

      if (found) {
        inboundPlanId = found.inboundPlanId
        actualShipmentId = found.shipment.shipmentId
        // Try to get items from shipment response first
        shipmentItems = found.shipment.items || []
        // If no items in response, fetch via listShipmentItems
        if (shipmentItems.length === 0 && actualShipmentId) {
          try {
            const itemsResponse = await listShipmentItems(inboundPlanId, actualShipmentId)
            shipmentItems = itemsResponse.items || []
          } catch (itemsError) {
            console.log('Error fetching shipment items:', itemsError)
          }
        }
      }
    }

    // If still no items, try to get items from local shipment record
    if (shipmentItems.length === 0 && localShipment?.shipment?.items) {
      shipmentItems = localShipment.shipment.items.map(item => ({
        msku: item.masterSku,
        quantity: item.adjustedQty,
      }))
    }

    if (shipmentItems.length === 0) {
      return NextResponse.json({
        error: 'No items found for this shipment. The shipment may not exist or may not have been submitted to Amazon yet.',
        amazonShipmentId,
        hint: 'Make sure the shipment has been submitted to Amazon and has items assigned.',
      }, { status: 404 })
    }

    // Process each item and match to local SKUs
    const deductions: Array<{
      masterSku: string
      sellerSku: string
      fnsku: string
      productName: string
      quantityShipped: number
      quantityReceived: number
      quantityToDeduct: number
      warehouseInventoryBefore: number
      warehouseInventoryAfter: number
      found: boolean
      alreadyDeducted: boolean
    }> = []

    let totalItemsProcessed = 0
    let totalUnitsDeducted = 0
    let itemsNotFound: string[] = []
    let itemsAlreadyDeducted: string[] = []

    for (const item of shipmentItems) {
      const sellerSku = item.msku
      const quantityShipped = item.quantity || 0

      // Try to find the product by SKU
      let product = await prisma.childProduct.findFirst({
        where: {
          OR: [
            { masterSku: sellerSku },
            { fnsku: sellerSku },
          ],
        },
      })

      if (!product) {
        // Try fuzzy match - SKU might have different casing
        product = await prisma.childProduct.findFirst({
          where: {
            OR: [
              { masterSku: { equals: sellerSku, mode: 'insensitive' } },
              { fnsku: { equals: sellerSku, mode: 'insensitive' } },
            ],
          },
        })
      }

      if (!product) {
        itemsNotFound.push(sellerSku)
        deductions.push({
          masterSku: sellerSku,
          sellerSku,
          fnsku: '',
          productName: 'Unknown',
          quantityShipped,
          quantityReceived: 0,
          quantityToDeduct: quantityShipped,
          warehouseInventoryBefore: 0,
          warehouseInventoryAfter: 0,
          found: false,
          alreadyDeducted: false,
        })
        continue
      }

      const masterSku = product.masterSku

      // Check if this shipment was already processed (check inventory adjustment)
      const existingAdjustment = await prisma.inventoryAdjustment.findFirst({
        where: {
          masterSku,
          adjustmentType: 'fba_shipment',
          reference: amazonShipmentId,
        },
      })

      if (existingAdjustment) {
        itemsAlreadyDeducted.push(sellerSku)
        deductions.push({
          masterSku,
          sellerSku,
          fnsku: product.fnsku || '',
          productName: product.title || 'Unknown',
          quantityShipped,
          quantityReceived: 0,
          quantityToDeduct: 0,
          warehouseInventoryBefore: 0,
          warehouseInventoryAfter: 0,
          found: true,
          alreadyDeducted: true,
        })
        continue
      }

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
      const quantityToDeduct = quantityShipped
      const newAvailable = Math.max(0, currentAvailable - quantityToDeduct)

      deductions.push({
        masterSku,
        sellerSku,
        fnsku: product.fnsku || '',
        productName: product.title || 'Unknown',
        quantityShipped,
        quantityReceived: 0,
        quantityToDeduct,
        warehouseInventoryBefore: currentAvailable,
        warehouseInventoryAfter: newAvailable,
        found: true,
        alreadyDeducted: false,
      })

      totalItemsProcessed++
      totalUnitsDeducted += quantityToDeduct
    }

    // If dry run, return preview
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        amazonShipmentId,
        inboundPlanId,
        warehouse: {
          id: warehouse.id,
          name: warehouse.name,
          code: warehouse.code,
        },
        summary: {
          totalItems: shipmentItems.length,
          itemsToProcess: totalItemsProcessed,
          totalUnitsToDeduct: totalUnitsDeducted,
          itemsNotFound: itemsNotFound.length,
          itemsAlreadyDeducted: itemsAlreadyDeducted.length,
        },
        deductions,
        warnings: {
          notFound: itemsNotFound,
          alreadyDeducted: itemsAlreadyDeducted,
        },
      })
    }

    // Apply the deductions
    const appliedDeductions: any[] = []

    for (const deduction of deductions) {
      if (!deduction.found || deduction.alreadyDeducted) {
        continue
      }

      // Update warehouse inventory
      const warehouseInventory = await prisma.warehouseInventory.findUnique({
        where: {
          warehouseId_masterSku: {
            warehouseId,
            masterSku: deduction.masterSku,
          },
        },
      })

      if (warehouseInventory) {
        await prisma.warehouseInventory.update({
          where: { id: warehouseInventory.id },
          data: { available: deduction.warehouseInventoryAfter },
        })
      }

      // Update aggregated inventory level
      const inventoryLevel = await prisma.inventoryLevel.findUnique({
        where: { masterSku: deduction.masterSku },
      })

      if (inventoryLevel) {
        const newWarehouseAvailable = Math.max(0, inventoryLevel.warehouseAvailable - deduction.quantityToDeduct)
        await prisma.inventoryLevel.update({
          where: { masterSku: deduction.masterSku },
          data: { warehouseAvailable: newWarehouseAvailable },
        })
      }

      // Create inventory adjustment record for audit trail
      await prisma.inventoryAdjustment.create({
        data: {
          masterSku: deduction.masterSku,
          location: 'warehouse',
          adjustmentType: 'fba_shipment',
          quantityChange: -deduction.quantityToDeduct,
          quantityBefore: deduction.warehouseInventoryBefore,
          quantityAfter: deduction.warehouseInventoryAfter,
          reason: `FBA Shipment ${amazonShipmentId} (external import)`,
          reference: amazonShipmentId,
        },
      })

      appliedDeductions.push(deduction)
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      amazonShipmentId,
      inboundPlanId,
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
      },
      summary: {
        totalItems: shipmentItems.length,
        itemsProcessed: appliedDeductions.length,
        totalUnitsDeducted,
        itemsNotFound: itemsNotFound.length,
        itemsAlreadyDeducted: itemsAlreadyDeducted.length,
      },
      appliedDeductions,
      warnings: {
        notFound: itemsNotFound,
        alreadyDeducted: itemsAlreadyDeducted,
      },
      message: `Successfully deducted inventory for ${appliedDeductions.length} items (${totalUnitsDeducted} units) from ${warehouse.name}`,
    })

  } catch (error: any) {
    console.error('Error deducting FBA shipment inventory:', error)

    // Handle specific Amazon API errors
    if (error.message?.includes('No endpoint found')) {
      return NextResponse.json({
        error: 'Amazon API configuration error. Please check your API credentials.',
        details: error.message,
      }, { status: 500 })
    }

    if (error.code === 'InvalidInput' || error.message?.includes('Invalid')) {
      return NextResponse.json({
        error: 'Could not find shipment in Amazon. The shipment may not exist, may be archived, or the inbound plan it belongs to could not be located.',
        details: error.message,
        hint: 'Make sure the shipment ID is correct (e.g., FBA193YSY6V4) and that the shipment has been submitted to Amazon.',
      }, { status: 400 })
    }

    if (error.code === 'NotFound' || error.message?.includes('not found')) {
      return NextResponse.json({
        error: 'Shipment not found in Amazon. Please verify the shipment ID.',
        details: error.message,
      }, { status: 404 })
    }

    return NextResponse.json(
      { error: error.message || 'Failed to process shipment inventory deduction' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/fba-shipments/deduct-inventory
 *
 * Preview endpoint - fetch shipment data without deducting
 * Query params:
 * - amazonShipmentId: string
 * - warehouseId: number
 * - inboundPlanId: string (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const amazonShipmentId = searchParams.get('amazonShipmentId')
    const warehouseId = searchParams.get('warehouseId')
    const inboundPlanId = searchParams.get('inboundPlanId')

    if (!amazonShipmentId) {
      return NextResponse.json({ error: 'Amazon Shipment ID is required' }, { status: 400 })
    }

    if (!warehouseId) {
      return NextResponse.json({ error: 'Warehouse ID is required' }, { status: 400 })
    }

    // Use POST with dryRun=true for preview
    const mockRequest = {
      json: async () => ({
        amazonShipmentId,
        warehouseId: parseInt(warehouseId),
        inboundPlanId: inboundPlanId || undefined,
        dryRun: true,
      }),
    } as NextRequest

    return POST(mockRequest)

  } catch (error: any) {
    console.error('Error previewing FBA shipment:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to preview shipment' },
      { status: 500 }
    )
  }
}
