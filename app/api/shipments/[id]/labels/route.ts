import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLabels } from '@/lib/fba-inbound-v2024'

/**
 * GET /api/shipments/:id/labels
 *
 * Gets shipping labels (SPD package labels) from Amazon for a submitted shipment.
 *
 * Query params:
 * - splitId: Optional Amazon shipment ID to get labels for a specific split
 * - pageType: 'PACKAGE_LABEL' (default) | 'BILL_OF_LADING' | 'PALLET_LABEL'
 * - labelType: 'PLAIN_PAPER' (default) | 'THERMAL'
 * - format: 'url' (default) | 'download' - whether to return URL or redirect to download
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

    const url = new URL(request.url)
    const splitId = url.searchParams.get('splitId')
    const pageType = (url.searchParams.get('pageType') || 'PACKAGE_LABEL') as 'PACKAGE_LABEL' | 'BILL_OF_LADING' | 'PALLET_LABEL'
    const labelType = (url.searchParams.get('labelType') || 'PLAIN_PAPER') as 'THERMAL' | 'PLAIN_PAPER'
    const format = url.searchParams.get('format') || 'url'

    // Get shipment from database
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        amazonSplits: true,
        boxes: true,
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (!shipment.amazonInboundPlanId) {
      return NextResponse.json({
        error: 'Shipment has not been submitted to Amazon yet',
      }, { status: 400 })
    }

    // Check workflow step - labels only available after transport confirmed
    const validSteps = ['transport_confirmed', 'labels_ready', 'shipped']
    if (!validSteps.includes(shipment.amazonWorkflowStep || '')) {
      return NextResponse.json({
        error: 'Labels not yet available. Complete the submission workflow first.',
        currentStep: shipment.amazonWorkflowStep,
        requiredSteps: validSteps,
      }, { status: 400 })
    }

    const inboundPlanId = shipment.amazonInboundPlanId

    // Get labels for specific split or all splits
    const splits = splitId
      ? shipment.amazonSplits.filter((s: { amazonShipmentId: string }) => s.amazonShipmentId === splitId)
      : shipment.amazonSplits

    if (!splits.length) {
      return NextResponse.json({
        error: splitId
          ? `Shipment split ${splitId} not found`
          : 'No shipment splits found',
      }, { status: 404 })
    }

    const labelResults: any[] = []

    for (const split of splits) {
      try {
        // Get number of packages for this split
        // For now, use total box count (could be refined based on split items)
        const numberOfPackages = shipment.boxes.length

        const result = await getLabels(
          inboundPlanId,
          split.amazonShipmentId,
          pageType,
          labelType,
          numberOfPackages
        )

        // Update split status to labels_ready if not already shipped
        if (split.status === 'transport_confirmed') {
          await prisma.amazonShipmentSplit.update({
            where: { id: split.id },
            data: { status: 'labels_ready' },
          })
        }

        labelResults.push({
          amazonShipmentId: split.amazonShipmentId,
          destinationFc: split.destinationFc,
          downloadUrl: result.downloadUrl,
          pageType,
          labelType,
        })
      } catch (error: any) {
        console.error(`Error getting labels for ${split.amazonShipmentId}:`, error)
        labelResults.push({
          amazonShipmentId: split.amazonShipmentId,
          error: error.message || 'Failed to get labels',
        })
      }
    }

    // Update shipment workflow step if all labels retrieved
    const allLabelsReady = labelResults.every(r => r.downloadUrl && !r.error)
    if (allLabelsReady && shipment.amazonWorkflowStep === 'transport_confirmed') {
      await prisma.shipment.update({
        where: { id },
        data: { amazonWorkflowStep: 'labels_ready' },
      })
    }

    // If single split requested and format is download, redirect to URL
    if (format === 'download' && labelResults.length === 1 && labelResults[0].downloadUrl) {
      return NextResponse.redirect(labelResults[0].downloadUrl)
    }

    return NextResponse.json({
      success: true,
      shipmentId: id,
      internalId: shipment.internalId,
      amazonInboundPlanId: inboundPlanId,
      labels: labelResults,
      pageType,
      labelType,
    })
  } catch (error: any) {
    console.error('Error getting labels:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to get labels',
        details: error.response?.data || error.stack,
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/shipments/:id/labels
 *
 * Request labels for specific package IDs (for more granular label retrieval)
 *
 * Body:
 * - splitId: Amazon shipment ID
 * - packageIds: Array of package IDs to get labels for
 * - pageType: 'PACKAGE_LABEL' | 'BILL_OF_LADING' | 'PALLET_LABEL'
 * - labelType: 'THERMAL' | 'PLAIN_PAPER'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid shipment ID' }, { status: 400 })
    }

    const body = await request.json()
    const {
      splitId,
      packageIds,
      pageType = 'PACKAGE_LABEL',
      labelType = 'PLAIN_PAPER',
    } = body

    if (!splitId) {
      return NextResponse.json({ error: 'splitId is required' }, { status: 400 })
    }

    // Get shipment from database
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        amazonSplits: {
          where: { amazonShipmentId: splitId },
        },
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (!shipment.amazonInboundPlanId) {
      return NextResponse.json({
        error: 'Shipment has not been submitted to Amazon yet',
      }, { status: 400 })
    }

    if (!shipment.amazonSplits.length) {
      return NextResponse.json({
        error: `Shipment split ${splitId} not found`,
      }, { status: 404 })
    }

    const result = await getLabels(
      shipment.amazonInboundPlanId,
      splitId,
      pageType,
      labelType,
      undefined,
      packageIds
    )

    return NextResponse.json({
      success: true,
      shipmentId: id,
      amazonShipmentId: splitId,
      downloadUrl: result.downloadUrl,
      pageType,
      labelType,
      packageIds,
    })
  } catch (error: any) {
    console.error('Error getting labels:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to get labels',
        details: error.response?.data || error.stack,
      },
      { status: 500 }
    )
  }
}
