import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listShipmentItems, getShipment } from '@/lib/fba-inbound-v2024'
import { createSpApiClient } from '@/lib/amazon-sp-api'

/**
 * GET /api/fba-shipments/[shipmentId]/items
 * 
 * Fetch items for an FBA shipment from Amazon and update the database
 * This is useful when items weren't synced initially (e.g., product didn't exist)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { shipmentId: string } }
) {
  try {
    const shipmentId = params.shipmentId

    // Get the shipment from database
    const shipment = await prisma.fbaShipment.findUnique({
      where: { shipmentId },
      include: {
        items: {
          include: {
            product: {
              select: {
                sku: true,
                title: true,
                fnsku: true,
                asin: true,
              },
            },
          },
        },
      },
    })

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    // Try to get items from Amazon using the v2024 API
    // First, we need to find the inboundPlanId - it might be stored or we need to search
    // For now, try to get items using the legacy API as fallback
    
    const client = await createSpApiClient()
    if (!client) {
      return NextResponse.json({ error: 'Failed to create SP-API client' }, { status: 500 })
    }

    let amazonItems: any[] = []
    
    // Try legacy API first (works with shipmentId directly)
    try {
      const itemsResponse: any = await client.callAPI({
        operation: 'getShipmentItems',
        endpoint: 'fulfillmentInbound',
        path: {
          shipmentId: shipmentId,
        },
        query: {
          MarketplaceId: 'ATVPDKIKX0DER', // Default to US marketplace
        },
      })
      amazonItems = itemsResponse?.payload?.ItemData || itemsResponse?.ItemData || []
    } catch (legacyError: any) {
      console.log(`Legacy API failed for ${shipmentId}:`, legacyError.message)
      // If legacy fails, items might already be in DB or shipment doesn't exist in Amazon
    }

    // If we got items from Amazon, update/create them in the database
    if (amazonItems.length > 0) {
      for (const item of amazonItems) {
        const sku = item.SellerSKU
        if (!sku) continue

        // Check if product exists
        const product = await prisma.product.findUnique({
          where: { sku },
        })

        if (!product) {
          console.log(`Skipping item ${sku} - product not found in database`)
          continue
        }

        // Upsert the item
        const existingItem = await prisma.fbaShipmentItem.findFirst({
          where: {
            shipmentId: shipment.id,
            masterSku: sku,
          },
        })

        const itemData = {
          masterSku: sku,
          channelSku: item.FulfillmentNetworkSKU || null,
          quantityShipped: item.QuantityShipped || 0,
          quantityReceived: item.QuantityReceived || 0,
          quantityDiscrepancy: (item.QuantityShipped || 0) - (item.QuantityReceived || 0),
        }

        if (existingItem) {
          await prisma.fbaShipmentItem.update({
            where: { id: existingItem.id },
            data: itemData,
          })
        } else {
          await prisma.fbaShipmentItem.create({
            data: {
              shipmentId: shipment.id,
              ...itemData,
            },
          })
        }
      }

      // Refetch shipment with updated items
      const updatedShipment = await prisma.fbaShipment.findUnique({
        where: { shipmentId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  sku: true,
                  title: true,
                  fnsku: true,
                  asin: true,
                },
              },
            },
          },
        },
      })

      return NextResponse.json({
        success: true,
        items: updatedShipment?.items.map(item => ({
          id: item.id,
          masterSku: item.masterSku,
          channelSku: item.channelSku,
          productName: item.product?.title || 'Unknown',
          fnsku: item.product?.fnsku,
          asin: item.product?.asin,
          quantityShipped: item.quantityShipped,
          quantityReceived: item.quantityReceived,
          quantityDiscrepancy: item.quantityDiscrepancy,
        })) || [],
        amazonItemsFound: amazonItems.length,
      })
    }

    // Return existing items from database
    return NextResponse.json({
      success: true,
      items: shipment.items.map(item => ({
        id: item.id,
        masterSku: item.masterSku,
        channelSku: item.channelSku,
        productName: item.product?.title || 'Unknown',
        fnsku: item.product?.fnsku,
        asin: item.product?.asin,
        quantityShipped: item.quantityShipped,
        quantityReceived: item.quantityReceived,
        quantityDiscrepancy: item.quantityDiscrepancy,
      })),
      amazonItemsFound: 0,
      message: shipment.items.length === 0 ? 'No items found. Items may not be available from Amazon API or products are not in database.' : 'Items retrieved from database',
    })

  } catch (error: any) {
    console.error('Error fetching shipment items:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch items' },
      { status: 500 }
    )
  }
}

