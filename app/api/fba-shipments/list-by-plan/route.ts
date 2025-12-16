import { NextRequest, NextResponse } from 'next/server'
import { createSpApiClient } from '@/lib/amazon-sp-api'
import { getShipment, listShipmentItems } from '@/lib/fba-inbound-v2024'

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

    const client = await createSpApiClient()

    // List all shipments in this plan
    const shipmentsResponse = await callFbaInboundApi(client, 'listInboundPlanShipments', {
      path: { inboundPlanId },
    })

    const shipments = shipmentsResponse.shipments || []

    // Get detailed info for each shipment
    const detailedShipments = []

    for (const shipment of shipments) {
      try {
        const fullShipment = await getShipment(inboundPlanId, shipment.shipmentId)

        // Try to get items
        let items: Array<{ msku: string; quantity: number }> = []
        try {
          const itemsResponse = await listShipmentItems(inboundPlanId, shipment.shipmentId)
          items = itemsResponse.items || []
        } catch (itemsError) {
          // Items might not be available yet
          items = fullShipment.items || []
        }

        detailedShipments.push({
          shipmentId: shipment.shipmentId,
          shipmentConfirmationId: fullShipment.shipmentConfirmationId,
          status: fullShipment.status,
          destination: fullShipment.destination,
          itemCount: items.length,
          totalUnits: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
          items,
        })
      } catch (error: any) {
        // Include partial info if we can't get full details
        detailedShipments.push({
          shipmentId: shipment.shipmentId,
          shipmentConfirmationId: null,
          status: shipment.status,
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
