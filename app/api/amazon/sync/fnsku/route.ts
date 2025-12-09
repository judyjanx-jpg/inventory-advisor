import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

/**
 * POST /api/amazon/sync/fnsku
 * Sync FNSKUs from Amazon for products
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { skus } = body // Optional array of specific SKUs to sync

    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'Amazon API not configured' },
        { status: 400 }
      )
    }

    const client = await createSpApiClient()
    
    // Get products that need FNSKU
    const whereClause: any = {
      isParent: false,
      fnsku: null,
    }
    
    if (skus && skus.length > 0) {
      whereClause.sku = { in: skus }
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      take: 100, // Limit batch size
    })

    console.log(`Syncing FNSKUs for ${products.length} products`)

    let updated = 0
    const results: Record<string, { fnsku: string | null, error?: string }> = {}

    for (const product of products) {
      if (!product.asin) {
        results[product.sku] = { fnsku: null, error: 'No ASIN' }
        continue
      }

      try {
        // Use FBA Inventory API to get FNSKU
        const inventoryResponse = await client.callAPI({
          operation: 'getInventorySummaries',
          endpoint: 'fbaInventory',
          query: {
            granularityType: 'Marketplace',
            granularityId: credentials.marketplaceId,
            marketplaceIds: [credentials.marketplaceId],
            sellerSkus: [product.sku],
            details: true,
          },
        })

        const summaries = inventoryResponse?.payload?.inventorySummaries || []
        const summary = summaries.find((s: any) => s.sellerSku === product.sku)

        if (summary?.fnSku) {
          await prisma.product.update({
            where: { sku: product.sku },
            data: { fnsku: summary.fnSku },
          })
          results[product.sku] = { fnsku: summary.fnSku }
          updated++
        } else {
          results[product.sku] = { fnsku: null, error: 'Not found in FBA inventory' }
        }
      } catch (error: any) {
        console.error(`Error getting FNSKU for ${product.sku}:`, error)
        results[product.sku] = { fnsku: null, error: error.message }
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    return NextResponse.json({
      success: true,
      total: products.length,
      updated,
      results,
    })
  } catch (error) {
    console.error('Error syncing FNSKUs:', error)
    return NextResponse.json(
      { error: 'Failed to sync FNSKUs' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/amazon/sync/fnsku?sku=XXX
 * Get FNSKU for a single product
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku')

    if (!sku) {
      return NextResponse.json(
        { error: 'SKU is required' },
        { status: 400 }
      )
    }

    // First check if we already have it
    const product = await prisma.product.findUnique({
      where: { sku },
      select: { sku: true, fnsku: true, asin: true },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    if (product.fnsku) {
      return NextResponse.json({
        sku: product.sku,
        fnsku: product.fnsku,
        source: 'database',
      })
    }

    // Fetch from Amazon
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'Amazon API not configured' },
        { status: 400 }
      )
    }

    const client = await createSpApiClient()

    const inventoryResponse = await client.callAPI({
      operation: 'getInventorySummaries',
      endpoint: 'fbaInventory',
      query: {
        granularityType: 'Marketplace',
        granularityId: credentials.marketplaceId,
        marketplaceIds: [credentials.marketplaceId],
        sellerSkus: [sku],
        details: true,
      },
    })

    const summaries = inventoryResponse?.payload?.inventorySummaries || []
    const summary = summaries.find((s: any) => s.sellerSku === sku)

    if (summary?.fnSku) {
      // Save to database
      await prisma.product.update({
        where: { sku },
        data: { fnsku: summary.fnSku },
      })

      return NextResponse.json({
        sku,
        fnsku: summary.fnSku,
        source: 'amazon',
      })
    }

    return NextResponse.json({
      sku,
      fnsku: null,
      error: 'FNSKU not found in Amazon FBA inventory',
    })
  } catch (error: any) {
    console.error('Error getting FNSKU:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get FNSKU' },
      { status: 500 }
    )
  }
}





