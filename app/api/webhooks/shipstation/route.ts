import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * ShipStation Webhook Handler
 * Receives notifications when shipments are created, shipped, or delivered
 * 
 * Webhook events:
 * - SHIP_NOTIFY: When a shipment is created/label printed
 * - ITEM_ORDER_NOTIFY: When items are shipped
 * - FULFILLMENT_SHIPPED: When fulfillment is marked shipped
 */

interface ShipStationWebhookPayload {
  resource_url: string
  resource_type: string
}

interface ShipmentData {
  shipmentId: number
  orderId: number
  orderKey: string
  orderNumber: string
  trackingNumber: string
  carrierCode: string
  serviceCode: string
  shipDate: string
  voided: boolean
  shipTo: {
    name: string
    city: string
    state: string
    postalCode: string
    country: string
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook is from ShipStation (basic check)
    const userAgent = request.headers.get('user-agent') || ''
    if (!userAgent.includes('ShipStation')) {
      console.warn('[ShipStation Webhook] Rejected - invalid user agent')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload: ShipStationWebhookPayload = await request.json()
    console.log('[ShipStation Webhook] Received:', payload.resource_type)

    // ShipStation sends a URL to fetch the actual data
    if (payload.resource_url) {
      // Fetch shipment details from ShipStation
      const apiKey = process.env.SHIPSTATION_API_KEY
      const apiSecret = process.env.SHIPSTATION_API_SECRET
      
      if (!apiKey || !apiSecret) {
        console.error('[ShipStation Webhook] Missing API credentials')
        return NextResponse.json({ error: 'Configuration error' }, { status: 500 })
      }

      const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
      const response = await fetch(payload.resource_url, {
        headers: {
          'Authorization': `Basic ${auth}`,
        }
      })

      if (!response.ok) {
        console.error('[ShipStation Webhook] Failed to fetch resource:', response.status)
        return NextResponse.json({ received: true })
      }

      const data = await response.json()
      
      // Handle shipment data
      if (data.shipments && Array.isArray(data.shipments)) {
        for (const shipment of data.shipments as ShipmentData[]) {
          await processShipmentUpdate(shipment)
        }
      } else if (data.trackingNumber) {
        // Single shipment
        await processShipmentUpdate(data as ShipmentData)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[ShipStation Webhook] Error:', error)
    // Return 200 to prevent retries for parsing errors
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

async function processShipmentUpdate(shipment: ShipmentData) {
  const { trackingNumber, voided, shipDate } = shipment

  if (!trackingNumber) {
    console.log('[ShipStation Webhook] No tracking number, skipping')
    return
  }

  console.log(`[ShipStation Webhook] Processing shipment: ${trackingNumber}`)

  // Find warranty claim with this tracking number
  const claim = await prisma.warrantyClaim.findFirst({
    where: {
      OR: [
        { returnTrackingNumber: trackingNumber },
        { replacementTracking: trackingNumber },
      ]
    }
  })

  if (!claim) {
    console.log(`[ShipStation Webhook] No warranty claim found for tracking ${trackingNumber}`)
    return
  }

  // Determine if this is a return or replacement shipment
  const isReturn = claim.returnTrackingNumber === trackingNumber
  const isReplacement = claim.replacementTracking === trackingNumber

  if (voided) {
    console.log(`[ShipStation Webhook] Shipment ${trackingNumber} was voided`)
    // Handle voided shipment - maybe notify support
    return
  }

  if (isReturn && shipDate) {
    // Return shipment was created/shipped
    await prisma.warrantyClaim.update({
      where: { id: claim.id },
      data: {
        status: 'RETURN_SHIPPED',
        returnShippedAt: new Date(shipDate),
      }
    })
    console.log(`[ShipStation Webhook] Claim ${claim.claimNumber} marked as RETURN_SHIPPED`)
  }

  if (isReplacement && shipDate) {
    // Replacement shipment was created/shipped
    await prisma.warrantyClaim.update({
      where: { id: claim.id },
      data: {
        replacementShippedAt: new Date(shipDate),
      }
    })
    console.log(`[ShipStation Webhook] Claim ${claim.claimNumber} replacement shipped`)
  }
}

// GET endpoint for webhook verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    status: 'ok',
    message: 'ShipStation webhook endpoint active'
  })
}

