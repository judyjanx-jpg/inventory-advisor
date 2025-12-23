import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requestTransparencyCodes, getExistingTransparencyCodes } from '@/lib/transparency-api'

/**
 * POST /api/transparency/codes
 * Request Transparency codes for products
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { items } = body // Array of { sku, gtin/asin, quantity }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      )
    }

    const results: Record<string, { codes: string[], error?: string }> = {}

    for (const item of items) {
      const { sku, gtin, asin, quantity } = item
      const identifier = gtin || asin

      if (!identifier) {
        results[sku] = { codes: [], error: 'No GTIN or ASIN provided' }
        continue
      }

      try {
        // First try to get existing unused codes
        let codes = await getExistingTransparencyCodes(identifier, quantity)

        // If we don't have enough, request more
        if (codes.length < quantity) {
          const needed = quantity - codes.length
          const newCodes = await requestTransparencyCodes(identifier, needed)
          codes = [...codes, ...newCodes]
        }

        results[sku] = { codes: codes.slice(0, quantity) }
      } catch (error: any) {
        console.error(`Error getting codes for ${sku}:`, error)
        results[sku] = { 
          codes: [], 
          error: error.message || 'Failed to get codes' 
        }
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Error in transparency codes endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/transparency/codes?sku=XXX&quantity=10
 * Get Transparency codes for a single product
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku')
    const quantity = parseInt(searchParams.get('quantity') || '1')

    if (!sku) {
      return NextResponse.json(
        { error: 'SKU is required' },
        { status: 400 }
      )
    }

    // Get product to find GTIN/ASIN
    const product = await prisma.product.findUnique({
      where: { sku }
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // Transparency API requires GTIN (UPC/EAN), not ASIN
    // Ensure UPC is treated as a string to preserve leading zeros
    let gtin = product.upc ? String(product.upc) : null
    if (!gtin) {
      return NextResponse.json(
        { error: 'Product has no UPC (GTIN) for Transparency lookup. Transparency requires a valid UPC/EAN.' },
        { status: 400 }
      )
    }
    
    // Remove any whitespace but preserve leading zeros
    gtin = gtin.trim()

    // Always request fresh codes from Amazon - don't use existing database codes
    // Delete old unused codes for this shipment/SKU first
    const shipmentId = searchParams.get('shipmentId')
    
    if (shipmentId) {
      // Delete existing unused codes for this shipment/SKU to ensure fresh codes
      await prisma.shipmentTransparencyCode.deleteMany({
        where: {
          shipmentId: parseInt(shipmentId),
          masterSku: sku,
          used: false,
        },
      })
      console.log(`[API] Deleted existing unused codes for shipment ${shipmentId}, SKU ${sku}`)
    }
    
    let codes: string[] = []
    
    // Always request fresh codes from Amazon
    try {
      console.log(`[API] Requesting ${quantity} fresh Transparency codes for SKU ${sku}, GTIN ${gtin}`)
      codes = await requestTransparencyCodes(gtin, quantity)
      
      console.log(`[API] Received ${codes.length} codes from Amazon. First code preview: "${codes[0]?.substring(0, 30)}..."`)
      
      // Store new codes in database if we have a shipment ID
      if (shipmentId && codes.length > 0) {
        await prisma.shipmentTransparencyCode.createMany({
          data: codes.map(code => ({
            shipmentId: parseInt(shipmentId),
            masterSku: sku,
            transparencyCode: code,
            requestedAt: new Date(),
          })),
          skipDuplicates: true,
        })
        console.log(`[API] Stored ${codes.length} new codes in database`)
      }
    } catch (error: any) {
      console.error('[API] Error requesting Transparency codes for %s:', sku, error)
      return NextResponse.json(
        { error: error.message || 'Failed to request Transparency codes from Amazon' },
        { status: 500 }
      )
    }

    // Filter out any codes that look like UPCs (8-14 digits only)
    // Transparency codes should be longer and have a different format
    const validCodes = codes
      .slice(0, quantity)
      .filter((code: string) => {
        const codeStr = String(code).trim()
        // UPCs are typically 8-14 digits with no other characters
        const isOnlyDigits = /^\d+$/.test(codeStr)
        const isUPCLength = codeStr.length >= 8 && codeStr.length <= 14
        const looksLikeUPC = isOnlyDigits && isUPCLength
        
        if (looksLikeUPC) {
          console.warn(`[API] Filtered out potential UPC code: "${codeStr}" (length: ${codeStr.length})`)
          return false
        }
        
        // Transparency codes should be at least 15 characters
        if (codeStr.length < 15) {
          console.warn(`[API] Filtered out suspiciously short code: "${codeStr}" (length: ${codeStr.length})`)
          return false
        }
        
        return true
      })
    
    if (validCodes.length < codes.length) {
      console.warn(`[API] Filtered out ${codes.length - validCodes.length} invalid codes (UPCs) from ${codes.length} total codes`)
    }
    
    return NextResponse.json({
      sku,
      codes: validCodes,
    })
  } catch (error: any) {
    console.error('Error getting transparency codes:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get codes' },
      { status: 500 }
    )
  }
}






