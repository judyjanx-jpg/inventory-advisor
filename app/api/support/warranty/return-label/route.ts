import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { shipstation, getWarehouseAddress } from '@/lib/shipstation'

// Generate return label for a warranty claim
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { claimNumber } = body

    if (!claimNumber) {
      return NextResponse.json(
        { error: 'Claim number is required' },
        { status: 400 }
      )
    }

    // Get the warranty claim
    const claim = await prisma.warrantyClaim.findUnique({
      where: { claimNumber }
    })

    if (!claim) {
      return NextResponse.json(
        { error: 'Warranty claim not found' },
        { status: 404 }
      )
    }

    // Check if label already exists
    if (claim.returnLabelUrl && claim.returnTrackingNumber) {
      return NextResponse.json({
        success: true,
        labelUrl: claim.returnLabelUrl,
        trackingNumber: claim.returnTrackingNumber,
        carrier: claim.returnCarrier,
        message: 'Return label already generated'
      })
    }

    // Parse shipping address
    let customerAddress
    try {
      customerAddress = claim.shippingAddress ? JSON.parse(claim.shippingAddress) : null
    } catch {
      customerAddress = null
    }

    if (!customerAddress || !customerAddress.street1 || !customerAddress.city || !customerAddress.state || !customerAddress.zip) {
      return NextResponse.json(
        { error: 'Invalid or missing customer shipping address' },
        { status: 400 }
      )
    }

    // Check if ShipStation is configured
    if (!shipstation.isConfigured()) {
      return NextResponse.json(
        { error: 'Shipping service not configured. Please contact support.' },
        { status: 503 }
      )
    }

    // Get warehouse address
    const warehouseAddress = getWarehouseAddress()
    if (!warehouseAddress.street1 || !warehouseAddress.city) {
      return NextResponse.json(
        { error: 'Warehouse address not configured. Please contact support.' },
        { status: 503 }
      )
    }

    // Determine if this is a test/sandbox environment
    const isTest = process.env.NODE_ENV !== 'production' || process.env.SHIPSTATION_TEST_MODE === 'true'

    console.log(`[Warranty] Generating return label for claim ${claimNumber}`)

    // Create return label via ShipStation
    const label = await shipstation.createReturnLabel({
      customerAddress: {
        name: customerAddress.name || 'Customer',
        street1: customerAddress.street1,
        street2: customerAddress.street2 || '',
        city: customerAddress.city,
        state: customerAddress.state,
        postalCode: customerAddress.zip,
        country: 'US',
      },
      warehouseAddress: {
        name: warehouseAddress.name,
        company: warehouseAddress.company,
        street1: warehouseAddress.street1,
        street2: warehouseAddress.street2 || '',
        city: warehouseAddress.city,
        state: warehouseAddress.state,
        postalCode: warehouseAddress.postalCode,
        country: 'US',
        phone: warehouseAddress.phone,
      },
      weight: { value: 8, units: 'ounces' }, // Default for jewelry
      testLabel: isTest,
    })

    // Convert base64 label to data URL or store it
    // For now, we'll store the base64 directly - in production you'd upload to S3/CloudStorage
    const labelDataUrl = `data:application/pdf;base64,${label.labelData}`

    // Update the warranty claim with label info
    await prisma.warrantyClaim.update({
      where: { claimNumber },
      data: {
        returnTrackingNumber: label.trackingNumber,
        returnLabelUrl: labelDataUrl,
        returnCarrier: 'USPS',
        status: 'PENDING_RETURN',
      }
    })

    console.log(`[Warranty] Return label generated for claim ${claimNumber}: ${label.trackingNumber}`)

    return NextResponse.json({
      success: true,
      labelUrl: labelDataUrl,
      trackingNumber: label.trackingNumber,
      carrier: 'USPS',
      shipmentCost: label.shipmentCost,
      message: 'Return label generated successfully'
    })
  } catch (error: any) {
    console.error('[Warranty] Return label error:', error)
    return NextResponse.json(
      { error: error.message || 'Unable to generate return label. Please try again.' },
      { status: 500 }
    )
  }
}

// Get return label status for a claim
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const claimNumber = searchParams.get('claimNumber')

    if (!claimNumber) {
      return NextResponse.json(
        { error: 'Claim number is required' },
        { status: 400 }
      )
    }

    const claim = await prisma.warrantyClaim.findUnique({
      where: { claimNumber },
      select: {
        claimNumber: true,
        status: true,
        returnTrackingNumber: true,
        returnLabelUrl: true,
        returnCarrier: true,
        returnShippedAt: true,
        returnDeliveredAt: true,
      }
    })

    if (!claim) {
      return NextResponse.json(
        { error: 'Warranty claim not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      claimNumber: claim.claimNumber,
      status: claim.status,
      hasLabel: !!claim.returnLabelUrl,
      trackingNumber: claim.returnTrackingNumber,
      carrier: claim.returnCarrier,
      shippedAt: claim.returnShippedAt,
      deliveredAt: claim.returnDeliveredAt,
    })
  } catch (error) {
    console.error('[Warranty] Label status error:', error)
    return NextResponse.json(
      { error: 'Unable to get label status' },
      { status: 500 }
    )
  }
}

