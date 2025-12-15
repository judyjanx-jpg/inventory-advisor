import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient } from '@/lib/amazon-sp-api'

/**
 * POST /api/fba-shipments/deduct-inventory
 *
 * Fetch an FBA shipment from Amazon by shipment ID and deduct
 * the inventory from a specified warehouse.
 *
 * Body:
 * - amazonShipmentId: string - The FBA shipment ID (e.g., "FBA15X123ABC")
 * - warehouseId: number - The warehouse to deduct inventory from
 * - dryRun: boolean - If true, preview changes without applying them
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amazonShipmentId, warehouseId, dryRun = false } = body

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

    // Fetch shipment items from Amazon using the legacy FBA Inbound API (v0)
    const client = await createSpApiClient()

    let shipmentItems: any[] = []
    let nextToken: string | undefined

    // Paginate through all shipment items
    do {
      const params: any = {
        operation: 'getShipmentItemsByShipmentId',
        endpoint: 'fulfillmentInboundShipment',
        path: { shipmentId: amazonShipmentId },
        query: nextToken ? { NextToken: nextToken } : {},
      }

      const response = await client.callAPI(params)

      if (response.ItemData) {
        shipmentItems = shipmentItems.concat(response.ItemData)
      }

      nextToken = response.NextToken
    } while (nextToken)

    if (shipmentItems.length === 0) {
      return NextResponse.json({
        error: 'No items found in this shipment. Please check the shipment ID.',
        amazonShipmentId,
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
      const sellerSku = item.SellerSKU
      const fnsku = item.FulfillmentNetworkSKU
      const quantityShipped = item.QuantityShipped || 0
      const quantityReceived = item.QuantityReceived || 0

      // Try to find the product by sellerSKU or FNSKU
      let product = await prisma.childProduct.findFirst({
        where: {
          OR: [
            { masterSku: sellerSku },
            { fnsku: fnsku },
          ],
        },
      })

      if (!product) {
        // Try fuzzy match - SKU might have different casing
        product = await prisma.childProduct.findFirst({
          where: {
            OR: [
              { masterSku: { equals: sellerSku, mode: 'insensitive' } },
              { fnsku: { equals: fnsku, mode: 'insensitive' } },
            ],
          },
        })
      }

      if (!product) {
        itemsNotFound.push(sellerSku)
        deductions.push({
          masterSku: sellerSku,
          sellerSku,
          fnsku: fnsku || '',
          productName: item.ProductName || 'Unknown',
          quantityShipped,
          quantityReceived,
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
          fnsku: fnsku || product.fnsku || '',
          productName: product.title || item.ProductName || 'Unknown',
          quantityShipped,
          quantityReceived,
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
        fnsku: fnsku || product.fnsku || '',
        productName: product.title || item.ProductName || 'Unknown',
        quantityShipped,
        quantityReceived,
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
    if (error.code === 'InvalidInput' || error.message?.includes('Invalid')) {
      return NextResponse.json({
        error: 'Invalid shipment ID. Please check the format and try again.',
        details: error.message,
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
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const amazonShipmentId = searchParams.get('amazonShipmentId')
    const warehouseId = searchParams.get('warehouseId')

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
