import { NextRequest, NextResponse } from 'next/server'
import { createSpApiClient } from '@/lib/amazon-sp-api'
import { getShipment, listShipmentItems, listPlacementOptions } from '@/lib/fba-inbound-v2024'

/**
 * GET /api/fba-shipments/list-by-plan?inboundPlanId=xxx
 *
 * List all shipments for a given inbound plan ID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const inboundPlanId = searchParams.get('inboundPlanId')

    if (!inboundPlanId) {
      return NextResponse.json({ error: 'Inbound Plan ID is required' }, { status: 400 })
    }

    // Get placement options which contain the shipment IDs
    const placementResponse = await listPlacementOptions(inboundPlanId)

    // Extract unique shipment IDs from all placement options
    const shipmentIds = new Set<string>()
    for (const option of placementResponse.placementOptions || []) {
      for (const shipmentId of option.shipmentIds || []) {
        shipmentIds.add(shipmentId)
      }
    }

    if (shipmentIds.size === 0) {
      return NextResponse.json({
        success: true,
        inboundPlanId,
        shipmentCount: 0,
        shipments: [],
        message: 'No shipments found. The placement options may not have been confirmed yet.',
      })
    }

    // Get detailed info for each shipment
    const detailedShipments = []

    for (const shipmentId of shipmentIds) {
      try {
        const fullShipment = await getShipment(inboundPlanId, shipmentId)

        // Try to get items
        let items: Array<{ msku: string; quantity: number }> = []
        try {
          const itemsResponse = await listShipmentItems(inboundPlanId, shipmentId)
          items = itemsResponse.items || []
        } catch (itemsError) {
          // Items might not be available yet
          items = fullShipment.items || []
        }

        detailedShipments.push({
          shipmentId,
          shipmentConfirmationId: fullShipment.shipmentConfirmationId || null,
          status: fullShipment.status,
          destination: fullShipment.destination,
          itemCount: items.length,
          totalUnits: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
          items,
        })
      } catch (error: any) {
        // Include partial info if we can't get full details
        detailedShipments.push({
          shipmentId,
          shipmentConfirmationId: null,
          status: 'unknown',
          error: error.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      inboundPlanId,
      shipmentCount: detailedShipments.length,
      shipments: detailedShipments,
    })

  } catch (error: any) {
    console.error('Error listing shipments by plan:', error)

    return NextResponse.json({
      error: 'Failed to list shipments',
      details: error.message,
      code: error.code,
    }, { status: 500 })
  }
}
