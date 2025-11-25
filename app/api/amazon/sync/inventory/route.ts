import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials, updateSyncStatus } from '@/lib/amazon-sp-api'

export async function POST() {
  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'Amazon credentials not configured' },
        { status: 400 }
      )
    }

    await updateSyncStatus('running')

    const client = await createSpApiClient()
    if (!client) {
      throw new Error('Failed to create SP-API client')
    }

    // Get FBA inventory
    const inventoryResponse = await client.callAPI({
      operation: 'getInventorySummaries',
      endpoint: 'fbaInventory',
      query: {
        granularityType: 'Marketplace',
        granularityId: credentials.marketplaceId,
        marketplaceIds: [credentials.marketplaceId],
        details: true,
      },
    })

    const inventorySummaries = inventoryResponse?.payload?.inventorySummaries || inventoryResponse?.inventorySummaries || []
    
    let updated = 0
    let skipped = 0

    for (const item of inventorySummaries) {
      const sku = item.sellerSku
      const fbaQuantity = item.inventoryDetails?.fulfillableQuantity || 0
      const inboundQuantity = item.inventoryDetails?.inboundReceivingQuantity || 0
      const reservedQuantity = item.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0

      // Find product by SKU
      const product = await prisma.product.findUnique({
        where: { sku },
        include: { inventoryLevels: true },
      })

      if (!product) {
        skipped++
        continue
      }

      // Update or create inventory levels
      if (product.inventoryLevels) {
        await prisma.inventoryLevel.update({
          where: { productId: product.id },
          data: {
            fbaAvailable: fbaQuantity,
            fbaInbound: inboundQuantity,
            fbaReserved: reservedQuantity,
            lastSyncedAt: new Date(),
          },
        })
      } else {
        await prisma.inventoryLevel.create({
          data: {
            productId: product.id,
            fbaAvailable: fbaQuantity,
            fbaInbound: inboundQuantity,
            fbaReserved: reservedQuantity,
            warehouseAvailable: 0,
            lastSyncedAt: new Date(),
          },
        })
      }
      updated++
    }

    await updateSyncStatus('success')

    return NextResponse.json({
      success: true,
      message: `Inventory synced: ${updated} updated, ${skipped} skipped (product not found)`,
      updated,
      skipped,
      total: inventorySummaries.length,
    })
  } catch (error: any) {
    console.error('Error syncing inventory:', error)
    await updateSyncStatus('error', error.message)

    return NextResponse.json(
      { error: error.message || 'Failed to sync inventory' },
      { status: 500 }
    )
  }
}

