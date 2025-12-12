import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getInboundPlan,
  listShipments,
  getShipment,
} from '@/lib/fba-inbound-v2024'

/**
 * GET /api/shipments/:id/amazon-status
 *
 * Gets the current status of a shipment from Amazon's FBA Inbound API.
 * Updates local database with latest status from Amazon.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid shipment ID' }, { status: 400 })
    }

    // Get shipment from database
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        amazonSplits: true,
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (!shipment.amazonInboundPlanId) {
      return NextResponse.json({
        error: 'Shipment has not been submitted to Amazon yet',
        localStatus: shipment.status,
        workflowStep: shipment.amazonWorkflowStep,
      }, { status: 400 })
    }

    const inboundPlanId = shipment.amazonInboundPlanId

    // Fetch inbound plan status from Amazon
    let inboundPlan: any
    try {
      inboundPlan = await getInboundPlan(inboundPlanId)
    } catch (error: any) {
      return NextResponse.json({
        error: 'Failed to fetch inbound plan from Amazon',
        details: error.message,
        localStatus: shipment.status,
      }, { status: 500 })
    }

    // Fetch all shipment splits from Amazon
    const { shipments: amazonShipments } = await listShipments(inboundPlanId)

    // Update each split with latest status
    const splitStatuses: any[] = []

    for (const amazonSplit of amazonShipments) {
      try {
        const splitDetail = await getShipment(inboundPlanId, amazonSplit.shipmentId)

        // Find matching local split
        const localSplit = shipment.amazonSplits.find(
          s => s.amazonShipmentId === amazonSplit.shipmentId
        )

        // Map Amazon status to our status
        const amazonStatus = splitDetail.status || 'UNKNOWN'
        let mappedStatus = 'pending'

        switch (amazonStatus) {
          case 'WORKING':
            mappedStatus = 'pending'
            break
          case 'READY_TO_SHIP':
            mappedStatus = 'labels_ready'
            break
          case 'SHIPPED':
            mappedStatus = 'shipped'
            break
          case 'IN_TRANSIT':
            mappedStatus = 'in_transit'
            break
          case 'DELIVERED':
          case 'CHECKED_IN':
            mappedStatus = 'receiving'
            break
          case 'RECEIVING':
            mappedStatus = 'receiving'
            break
          case 'CLOSED':
            mappedStatus = 'received'
            break
          case 'CANCELLED':
            mappedStatus = 'cancelled'
            break
          default:
            mappedStatus = localSplit?.status || 'pending'
        }

        // Update local split if exists
        if (localSplit) {
          await prisma.amazonShipmentSplit.update({
            where: { id: localSplit.id },
            data: {
              status: mappedStatus,
              destinationFc: splitDetail.destination?.warehouseId || localSplit.destinationFc,
              trackingNumber: splitDetail.trackingId || localSplit.trackingNumber,
            },
          })
        }

        splitStatuses.push({
          amazonShipmentId: amazonSplit.shipmentId,
          shipmentConfirmationId: splitDetail.shipmentConfirmationId,
          amazonStatus,
          mappedStatus,
          destination: splitDetail.destination,
          trackingId: splitDetail.trackingId,
        })
      } catch (error: any) {
        console.error(`Error fetching split ${amazonSplit.shipmentId}:`, error)
        splitStatuses.push({
          amazonShipmentId: amazonSplit.shipmentId,
          error: error.message,
        })
      }
    }

    // Determine overall shipment status based on splits
    let overallStatus = shipment.status
    const allStatuses = splitStatuses.map(s => s.mappedStatus).filter(Boolean)

    if (allStatuses.every(s => s === 'received')) {
      overallStatus = 'received'
    } else if (allStatuses.some(s => s === 'receiving')) {
      overallStatus = 'receiving'
    } else if (allStatuses.some(s => s === 'in_transit')) {
      overallStatus = 'in_transit'
    } else if (allStatuses.every(s => s === 'shipped' || s === 'in_transit' || s === 'receiving' || s === 'received')) {
      overallStatus = 'shipped'
    } else if (allStatuses.some(s => s === 'labels_ready')) {
      overallStatus = 'submitted'
    }

    // Update shipment status if changed
    if (overallStatus !== shipment.status) {
      await prisma.shipment.update({
        where: { id },
        data: { status: overallStatus },
      })
    }

    return NextResponse.json({
      success: true,
      shipmentId: id,
      internalId: shipment.internalId,
      localStatus: overallStatus,
      amazonInboundPlanId: inboundPlanId,
      amazonPlanStatus: inboundPlan.status,
      workflowStep: shipment.amazonWorkflowStep,
      splits: splitStatuses,
      lastUpdated: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Error fetching Amazon status:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch Amazon status',
        details: error.response?.data || error.stack,
      },
      { status: 500 }
    )
  }
}
