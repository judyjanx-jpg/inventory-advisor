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

    const identifier = product.upc || product.asin
    if (!identifier) {
      return NextResponse.json(
        { error: 'Product has no UPC or ASIN for Transparency lookup' },
        { status: 400 }
      )
    }

    // Try to get existing codes first
    let codes = await getExistingTransparencyCodes(identifier, quantity)

    // Request more if needed
    if (codes.length < quantity) {
      const newCodes = await requestTransparencyCodes(identifier, quantity - codes.length)
      codes = [...codes, ...newCodes]
    }

    return NextResponse.json({
      sku,
      codes: codes.slice(0, quantity),
    })
  } catch (error: any) {
    console.error('Error getting transparency codes:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get codes' },
      { status: 500 }
    )
  }
}


