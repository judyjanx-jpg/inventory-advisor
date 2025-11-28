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

    // Get FBA inventory using getInventorySummaries endpoint
    // This endpoint requires pagination - default page size is 50
    console.log('Fetching FBA inventory using getInventorySummaries...')
    console.log(`Marketplace ID: ${credentials.marketplaceId}`)
    
    let inventorySummaries: any[] = []
    let nextToken: string | undefined = undefined
    let pageCount = 0
    const maxPages = 20 // Limit to prevent infinite loops
    
    do {
      pageCount++
      console.log(`Fetching page ${pageCount}${nextToken ? ` (nextToken: ${nextToken.substring(0, 20)}...)` : ''}...`)
      
      const queryParams: any = {
        granularityType: 'Marketplace',
        granularityId: credentials.marketplaceId,
        marketplaceIds: [credentials.marketplaceId], // ✅ FIX: Must be an ARRAY!
        details: true,
      }
      
      if (nextToken) {
        queryParams.nextToken = nextToken
      }
      
      const inventoryResponse = await client.callAPI({
        operation: 'getInventorySummaries',
        endpoint: 'fbaInventory',
        query: queryParams,
      })
      
      // Debug logging on first page
      if (pageCount === 1) {
        console.log('=== RAW INVENTORY RESPONSE ===')
        console.log('Top-level keys:', Object.keys(inventoryResponse || {}))
        console.log('Full response (first 5000 chars):')
        console.log(JSON.stringify(inventoryResponse, null, 2).substring(0, 5000))
      }
      
      // FBA response structure: { payload: { inventorySummaries: [...], nextToken: "..." } }
      const payload = inventoryResponse?.payload || inventoryResponse
      const pageItems = payload?.inventorySummaries || []
      nextToken = payload?.nextToken || payload?.pagination?.nextToken
      
      // Debug first item
      if (pageCount === 1 && pageItems.length > 0) {
        console.log('\n=== FIRST INVENTORY ITEM ===')
        console.log(JSON.stringify(pageItems[0], null, 2))
        console.log('Item keys:', Object.keys(pageItems[0]))
        if (pageItems[0].inventoryDetails) {
          console.log('inventoryDetails keys:', Object.keys(pageItems[0].inventoryDetails))
        } else {
          console.log('⚠️ NO inventoryDetails object!')
        }
        console.log('=== END DEBUG ===')
      }
      
      if (pageItems.length > 0) {
        inventorySummaries = [...inventorySummaries, ...pageItems]
        console.log(`  Got ${pageItems.length} items (total: ${inventorySummaries.length})`)
      } else {
        console.log(`  No items in this page`)
      }
      
      // Break if no nextToken or we've hit the max pages
      if (!nextToken || pageCount >= maxPages) {
        break
      }
      
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500))
    } while (nextToken && pageCount < maxPages)
    
    console.log(`\nTotal inventory items fetched: ${inventorySummaries.length}`)
    
    // Log sample items to verify structure
    if (inventorySummaries.length > 0) {
      console.log('\nSample inventory item:')
      const sample = inventorySummaries[0]
      console.log(`  SKU: ${sample.sellerSku}`)
      console.log(`  Fulfillable: ${sample.inventoryDetails?.fulfillableQuantity || 0}`)
      console.log(`  Inbound Working: ${sample.inventoryDetails?.inboundWorkingQuantity || 0}`)
      console.log(`  Inbound Shipped: ${sample.inventoryDetails?.inboundShippedQuantity || 0}`)
      console.log(`  Inbound Receiving: ${sample.inventoryDetails?.inboundReceivingQuantity || 0}`)
      console.log(`  Reserved: ${JSON.stringify(sample.inventoryDetails?.reservedQuantity)}`)
    }

    console.log('Inventory API Response sample:', JSON.stringify(inventorySummaries.slice(0, 2), null, 2))
    
    if (inventorySummaries.length === 0) {
      console.warn('No inventory items returned from Amazon API')
      return NextResponse.json({
        success: true,
        message: 'No inventory items found in Amazon response',
        updated: 0,
        skipped: 0,
        total: 0,
      })
    }
    
    let updated = 0
    let skipped = 0
    const updatedSkus: string[] = []

    for (const item of inventorySummaries) {
      // FBA Inventory response structure
      const sku = item.sellerSku
      
      if (!sku) {
        console.warn('Skipping item with no sellerSku:', item)
        skipped++
        continue
      }
      
      // Extract FBA inventory quantities
      const fbaQuantity = item.inventoryDetails?.fulfillableQuantity || 0
      const inboundWorking = item.inventoryDetails?.inboundWorkingQuantity || 0
      const inboundShipped = item.inventoryDetails?.inboundShippedQuantity || 0
      const inboundReceiving = item.inventoryDetails?.inboundReceivingQuantity || 0
      
      // Handle reservedQuantity - can be a number or an object with totalReservedQuantity
      let reservedQuantity = 0
      if (item.inventoryDetails?.reservedQuantity) {
        if (typeof item.inventoryDetails.reservedQuantity === 'number') {
          reservedQuantity = item.inventoryDetails.reservedQuantity
        } else if (item.inventoryDetails.reservedQuantity.totalReservedQuantity !== undefined) {
          reservedQuantity = item.inventoryDetails.reservedQuantity.totalReservedQuantity || 0
        }
      }
      
      // Handle unfulfillable - can be a number or an object with totalUnfulfillableQuantity
      let unfulfillable = 0
      if (item.inventoryDetails?.unfulfillableQuantity) {
        if (typeof item.inventoryDetails.unfulfillableQuantity === 'number') {
          unfulfillable = item.inventoryDetails.unfulfillableQuantity
        } else if (item.inventoryDetails.unfulfillableQuantity.totalUnfulfillableQuantity !== undefined) {
          unfulfillable = item.inventoryDetails.unfulfillableQuantity.totalUnfulfillableQuantity || 0
        }
      }

      // Check if product exists - only match child products (not parent products)
      const product = await prisma.product.findUnique({
        where: { sku },
        include: {
          _count: {
            select: {
              variations: true,
            },
          },
        },
      })

      if (!product) {
        skipped++
        if (skipped <= 10) {
          console.log(`  ✗ SKU ${sku} - product not found in database`)
        } else if (skipped === 11) {
          console.log(`  ... (more SKUs not found, showing first 10 only)`)
        }
        continue
      }
      
      // Log successful match
      if (updated < 10) {
        console.log(`  ✓ Found product for SKU ${sku}: ${product.title?.substring(0, 50)}...`)
      }

      // Skip parent products - only sync inventory for child products
      // A product is a parent if: isParent is true OR (has no parentSku AND has variations)
      if (product.isParent || (product.parentSku === null && (product._count?.variations || 0) > 0)) {
        skipped++
        if (skipped <= 5) {
          console.log(`Skipping SKU ${sku} - this is a parent product, inventory should be on child SKUs`)
        }
        continue
      }
      
      const totalInventory = fbaQuantity + inboundWorking + inboundShipped + inboundReceiving
      console.log(`Updating inventory for SKU ${sku}: FBA=${fbaQuantity}, Inbound=${inboundWorking + inboundShipped + inboundReceiving}, Total=${totalInventory}`)

      // Update or create inventory levels using masterSku
      await prisma.inventoryLevel.upsert({
        where: { masterSku: sku },
        update: {
          fbaAvailable: fbaQuantity,
          fbaInboundWorking: inboundWorking,
          fbaInboundShipped: inboundShipped,
          fbaInboundReceiving: inboundReceiving,
          fbaReserved: reservedQuantity,
          fbaUnfulfillable: unfulfillable,
          fbaLastSync: new Date(),
        },
        create: {
          masterSku: sku,
          fbaAvailable: fbaQuantity,
          fbaInboundWorking: inboundWorking,
          fbaInboundShipped: inboundShipped,
          fbaInboundReceiving: inboundReceiving,
          fbaReserved: reservedQuantity,
          fbaUnfulfillable: unfulfillable,
          warehouseAvailable: 0,
          warehouseReserved: 0,
          fbaLastSync: new Date(),
        },
      })
      updated++
      updatedSkus.push(sku)
      
      if (totalInventory > 0) {
        console.log(`  ✓ SKU ${sku} has inventory: ${totalInventory} units`)
      }
    }

    await updateSyncStatus('success')

    console.log(`\n[Sync Summary]`)
    console.log(`  Total items from Amazon: ${inventorySummaries.length}`)
    console.log(`  Updated: ${updated} SKUs`)
    console.log(`  Skipped: ${skipped} SKUs`)
    if (updatedSkus.length > 0) {
      console.log(`  Updated SKUs: ${updatedSkus.slice(0, 10).join(', ')}${updatedSkus.length > 10 ? '...' : ''}`)
    }

    return NextResponse.json({
      success: true,
      message: `Inventory synced: ${updated} updated, ${skipped} skipped (product not found)`,
      updated,
      skipped,
      total: inventorySummaries.length,
      updatedSkus: updatedSkus.slice(0, 20), // Return first 20 for debugging
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

