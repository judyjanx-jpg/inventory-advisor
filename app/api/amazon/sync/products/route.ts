import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials, updateSyncStatus, marketplaceToChannel } from '@/lib/amazon-sp-api'

// NOTE: This sync is READ-ONLY. We never push data to Amazon.

interface ReportRow {
  'seller-sku': string
  'asin1': string
  'item-name': string
  'price': string
  'quantity': string
  'fulfillment-channel': string
  'status': string
  'fnsku': string
  'product-id-type': string
  [key: string]: string
}

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

    const channel = marketplaceToChannel(credentials.marketplaceId)
    
    console.log('=== Starting Product Sync (READ-ONLY) ===')
    console.log('Seller ID:', credentials.sellerId)
    console.log('Marketplace:', credentials.marketplaceId)
    
    // Use Reports API to get ALL merchant listings
    console.log('\n📋 Requesting Merchant Listings Report...')
    
    // Step 1: Request the report
    let reportDocumentId: string | null = null
    
    try {
      // Request the GET_MERCHANT_LISTINGS_ALL_DATA report
      const createReportResponse = await client.callAPI({
        operation: 'createReport',
        endpoint: 'reports',
        body: {
          reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA',
          marketplaceIds: [credentials.marketplaceId],
        },
      })

      const reportId = createReportResponse?.reportId
      console.log('  Report requested, ID:', reportId)

      if (!reportId) {
        throw new Error('No report ID returned')
      }

      // Step 2: Poll for report completion
      console.log('  Waiting for report to generate...')
      let reportStatus = 'IN_QUEUE'
      let attempts = 0
      const maxAttempts = 30 // 5 minutes max wait

      while (reportStatus !== 'DONE' && reportStatus !== 'FATAL' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds
        
        const reportResponse = await client.callAPI({
          operation: 'getReport',
          endpoint: 'reports',
          path: { reportId },
        })

        reportStatus = reportResponse?.processingStatus || 'UNKNOWN'
        reportDocumentId = reportResponse?.reportDocumentId || null
        attempts++
        
        console.log(`  Status: ${reportStatus} (attempt ${attempts}/${maxAttempts})`)
        
        if (reportStatus === 'FATAL') {
          throw new Error('Report generation failed')
        }
      }

      if (reportStatus !== 'DONE' || !reportDocumentId) {
        throw new Error('Report did not complete in time')
      }

      console.log('  Report ready, document ID:', reportDocumentId)

    } catch (reportError: any) {
      console.log('  Reports API failed:', reportError.message)
      console.log('  Falling back to FBA Inventory API...')
      
      // Fall back to direct API if reports don't work
      return await syncViaInventoryAPI(client, credentials, channel)
    }

    // Step 3: Download and parse the report
    console.log('\n📥 Downloading report...')
    
    let reportData: ReportRow[] = []
    
    try {
      const documentResponse = await client.callAPI({
        operation: 'getReportDocument',
        endpoint: 'reports',
        path: { reportDocumentId },
      })

      const documentUrl = documentResponse?.url
      
      if (!documentUrl) {
        throw new Error('No document URL returned')
      }

      // Download the report content
      const reportContent = await client.download(documentResponse)
      
      // Parse TSV content
      if (typeof reportContent === 'string') {
        const lines = reportContent.split('\n')
        const headers = lines[0]?.split('\t').map(h => h.trim().toLowerCase()) || []
        
        console.log('  Report headers:', headers.slice(0, 5).join(', '), '...')
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i]?.split('\t') || []
          if (values.length > 1) {
            const row: any = {}
            headers.forEach((header, index) => {
              row[header] = values[index]?.trim() || ''
            })
            reportData.push(row)
          }
        }
      }

      console.log(`  Parsed ${reportData.length} products from report`)

    } catch (downloadError: any) {
      console.log('  Report download failed:', downloadError.message)
      return await syncViaInventoryAPI(client, credentials, channel)
    }

    if (reportData.length === 0) {
      console.log('  No data in report, falling back to Inventory API')
      return await syncViaInventoryAPI(client, credentials, channel)
    }

    // Step 4: Get catalog data for parent/child relationships
    const asins = [...new Set(
      reportData
        .map(r => r['asin1'] || r['asin'])
        .filter(Boolean)
    )]

    console.log(`\n📚 Fetching catalog data for ${asins.length} ASINs...`)
    
    const catalogData: Record<string, any> = {}
    const asinBatches = chunkArray(asins, 20)
    
    for (let i = 0; i < Math.min(asinBatches.length, 50); i++) { // Limit catalog lookups
      const batch = asinBatches[i]
      try {
        const response = await client.callAPI({
          operation: 'searchCatalogItems',
          endpoint: 'catalogItems',
          query: {
            marketplaceIds: [credentials.marketplaceId],
            identifiers: batch.join(','),
            identifiersType: 'ASIN',
            includedData: ['attributes', 'relationships', 'summaries'],
            pageSize: 20,
          },
        })

        const items = response?.items || []
        for (const item of items) {
          if (item.asin) {
            catalogData[item.asin] = item
          }
        }

        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (err) {
        // Continue on catalog errors
      }
    }

    console.log(`✓ Got catalog data for ${Object.keys(catalogData).length} ASINs`)

    // Step 5: Create/update products
    console.log('\n💾 Saving products to database...')
    
    let created = 0
    let updated = 0
    let mappingsCreated = 0
    const parentChildRelationships: Array<{
      childSku: string
      parentAsin: string
      variationType?: string
      variationValue?: string
    }> = []

    for (const row of reportData) {
      const sku = row['seller-sku'] || row['sku']
      if (!sku) continue

      const asin = row['asin1'] || row['asin'] || ''
      const fnsku = row['fnsku'] || ''
      const title = row['item-name'] || row['product-name'] || sku
      const price = parseFloat(row['price'] || '0') || 0
      const quantity = parseInt(row['quantity'] || '0') || 0
      const status = row['status']?.toLowerCase().includes('active') ? 'active' : 'active'

      // Get catalog data for this ASIN
      const catalog = asin ? catalogData[asin] : null
      const catalogSummary = catalog?.summaries?.[0]
      const attributes = catalog?.attributes || {}
      const relationships = catalog?.relationships || []

      // Check for parent relationship
      let parentAsin: string | null = null
      let isParent = false
      
      for (const rel of relationships) {
        if (rel.type === 'VARIATION' && rel.parentAsins?.[0]) {
          parentAsin = rel.parentAsins[0]
        }
        if (rel.type === 'VARIATION_PARENT' || rel.childAsins?.length) {
          isParent = true
        }
      }

      // Get variation attributes
      let variationType: string | null = null
      let variationValue: string | null = null
      
      if (attributes.size?.[0]?.value) {
        variationType = 'Size'
        variationValue = attributes.size[0].value
      } else if (attributes.color?.[0]?.value) {
        variationType = 'Color'
        variationValue = attributes.color[0].value
      }

      // Check if product exists
      let product = await prisma.product.findUnique({
        where: { sku },
      })

      if (!product) {
        try {
          product = await prisma.product.create({
            data: {
              sku,
              title: catalogSummary?.itemName || title,
              asin: asin || null,
              fnsku: fnsku || null,
              brand: catalogSummary?.brand || attributes.brand?.[0]?.value || 'KISPER',
              category: catalogSummary?.productType || null,
              cost: 0,
              price,
              status,
              isParent,
              variationType,
              variationValue,
              inventoryLevels: {
                create: {
                  fbaAvailable: quantity,
                  fbaReserved: 0,
                  fbaUnfulfillable: 0,
                  warehouseAvailable: 0,
                },
              },
              salesVelocity: {
                create: {
                  velocity7d: 0,
                  velocity30d: 0,
                  velocity90d: 0,
                },
              },
            },
          })
          created++
        } catch (err: any) {
          if (err.code !== 'P2002') {
            console.log(`  Error creating ${sku}:`, err.message?.substring(0, 50))
          }
          continue
        }
      } else {
        // Update existing product
        await prisma.product.update({
          where: { sku },
          data: {
            asin: asin || product.asin,
            fnsku: fnsku || product.fnsku,
            title: catalogSummary?.itemName || title || product.title,
            price: price || product.price,
            isParent: isParent || product.isParent,
            variationType: variationType || product.variationType,
            variationValue: variationValue || product.variationValue,
          },
        })

        // Update inventory levels
        await prisma.inventoryLevel.upsert({
          where: { masterSku: sku },
          update: {
            fbaAvailable: quantity,
          },
          create: {
            masterSku: sku,
            fbaAvailable: quantity,
            fbaReserved: 0,
            fbaUnfulfillable: 0,
            warehouseAvailable: 0,
          },
        })
        updated++
      }

      // Track parent relationship
      if (parentAsin) {
        parentChildRelationships.push({
          childSku: sku,
          parentAsin,
          variationType: variationType || undefined,
          variationValue: variationValue || undefined,
        })
      }

      // Create SKU mapping
      const existingMapping = await prisma.skuMapping.findFirst({
        where: { masterSku: sku, channel },
      })

      if (!existingMapping) {
        try {
          await prisma.skuMapping.create({
            data: {
              masterSku: sku,
              channel,
              channelSku: sku,
              channelProductId: asin || null,
              channelFnsku: fnsku || null,
              isActive: true,
            },
          })
          mappingsCreated++
        } catch (err) {
          // Ignore duplicate mapping errors
        }
      }

      // Progress log
      if ((created + updated) % 100 === 0) {
        console.log(`  Processed ${created + updated}/${reportData.length}...`)
      }
    }

    // Step 6: Link children to parents
    console.log(`\n🔗 Linking ${parentChildRelationships.length} variations to parents...`)
    let relationshipsLinked = 0

    for (const rel of parentChildRelationships) {
      const parentProduct = await prisma.product.findFirst({
        where: { asin: rel.parentAsin },
      })

      if (parentProduct) {
        await prisma.product.update({
          where: { sku: parentProduct.sku },
          data: { isParent: true },
        })

        await prisma.product.update({
          where: { sku: rel.childSku },
          data: { 
            parentSku: parentProduct.sku,
            variationType: rel.variationType,
            variationValue: rel.variationValue,
          },
        })
        relationshipsLinked++
      }
    }

    await updateSyncStatus('success')

    const message = `Synced ${reportData.length} products: ${created} created, ${updated} updated, ${mappingsCreated} mappings, ${relationshipsLinked} variations linked`
    console.log(`\n✅ ${message}`)

    return NextResponse.json({
      success: true,
      message,
      created,
      updated,
      mappingsCreated,
      relationshipsLinked,
      total: reportData.length,
    })
  } catch (error: any) {
    console.error('Error syncing products:', error)
    await updateSyncStatus('error', error.message)

    return NextResponse.json(
      { error: error.message || 'Failed to sync products' },
      { status: 500 }
    )
  }
}

// Fallback: Sync via FBA Inventory API
async function syncViaInventoryAPI(client: any, credentials: any, channel: string) {
  console.log('\n📦 Using FBA Inventory API fallback...')
  
  let allItems: any[] = []
  let nextToken: string | undefined = undefined
  let pageCount = 0
  const maxPages = 100
  
  do {
    const query: any = {
      granularityType: 'Marketplace',
      granularityId: credentials.marketplaceId,
      marketplaceIds: [credentials.marketplaceId],
      details: true,
    }

    if (nextToken) {
      query.nextToken = nextToken
    }

    const response = await client.callAPI({
      operation: 'getInventorySummaries',
      endpoint: 'fbaInventory',
      query,
    })

    const summaries = response?.payload?.inventorySummaries || 
                     response?.inventorySummaries || []
    
    allItems = [...allItems, ...summaries]
    
    nextToken = response?.payload?.pagination?.nextToken || 
                response?.pagination?.nextToken
    
    pageCount++
    console.log(`  Page ${pageCount}: ${summaries.length} items (total: ${allItems.length})`)

    if (nextToken) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } while (nextToken && pageCount < maxPages)

  console.log(`\n✓ Found ${allItems.length} FBA items`)

  // Process items...
  let created = 0
  let updated = 0
  let mappingsCreated = 0

  for (const item of allItems) {
    const sku = item.sellerSku
    if (!sku) continue

    const asin = item.asin
    const fnsku = item.fnsku
    const title = item.productName || sku
    const quantity = item.inventoryDetails?.fulfillableQuantity || 0

    let product = await prisma.product.findUnique({
      where: { sku },
    })

    if (!product) {
      try {
        await prisma.product.create({
          data: {
            sku,
            title,
            asin,
            fnsku,
            brand: 'KISPER',
            cost: 0,
            price: 0,
            status: 'active',
            inventoryLevels: {
              create: {
                fbaAvailable: quantity,
                fbaReserved: item.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0,
                fbaUnfulfillable: item.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity || 0,
                warehouseAvailable: 0,
              },
            },
            salesVelocity: {
              create: {
                velocity7d: 0,
                velocity30d: 0,
                velocity90d: 0,
              },
            },
          },
        })
        created++
      } catch (err) {
        continue
      }
    } else {
      await prisma.inventoryLevel.upsert({
        where: { masterSku: sku },
        update: {
          fbaAvailable: quantity,
          fbaReserved: item.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0,
          fbaUnfulfillable: item.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity || 0,
        },
        create: {
          masterSku: sku,
          fbaAvailable: quantity,
          warehouseAvailable: 0,
        },
      })
      updated++
    }

    // Create SKU mapping
    const existingMapping = await prisma.skuMapping.findFirst({
      where: { masterSku: sku, channel },
    })

    if (!existingMapping) {
      try {
        await prisma.skuMapping.create({
          data: {
            masterSku: sku,
            channel,
            channelSku: sku,
            channelProductId: asin,
            channelFnsku: fnsku,
            isActive: true,
          },
        })
        mappingsCreated++
      } catch (err) {}
    }
  }

  await updateSyncStatus('success')

  const message = `Synced ${allItems.length} products via FBA API: ${created} created, ${updated} updated`
  console.log(`\n✅ ${message}`)

  return NextResponse.json({
    success: true,
    message,
    created,
    updated,
    mappingsCreated,
    total: allItems.length,
  })
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}
