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
  'fulfillment-channel-sku': string  // Alternative FNSKU column name
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

    // Step 4: Get catalog data for parent/child relationships using Catalog Items API 2022-04-01
    const asins = [...new Set(
      reportData
        .map(r => r['asin1'] || r['asin'])
        .filter(Boolean)
    )]

    console.log(`\n📚 Fetching catalog data for ${asins.length} ASINs...`)
    
    const catalogData: Record<string, any> = {}
    const parentAsins = new Set<string>()
    const asinToParent: Record<string, string> = {}
    
    let processed = 0
    let successCount = 0
    let relationshipsFound = 0
    
    // Use getCatalogItem with version 2022-04-01 to get relationships
    for (const asin of asins) {
      try {
        const response = await client.callAPI({
          operation: 'getCatalogItem',
          endpoint: 'catalogItems',
          path: { asin },
          query: {
            marketplaceIds: [credentials.marketplaceId],
            includedData: ['attributes', 'relationships', 'summaries', 'images'],
          },
          options: {
            version: '2022-04-01'  // THIS IS THE KEY - specify the API version!
          }
        })

        if (response) {
          catalogData[asin] = response
          successCount++
          
          // Log first 5 successful responses with relationship details
          if (successCount <= 5) {
            console.log(`  ✅ Got data for ${asin}`)
            console.log(`     Keys: ${Object.keys(response).join(', ')}`)
            
            // Debug log the relationships structure
            const relationships = response.relationships || []
            if (relationships.length > 0) {
              console.log(`     Relationships count: ${relationships.length}`)
              console.log(`     First relationship:`, JSON.stringify(relationships[0]).substring(0, 500))
            } else {
              console.log(`     No relationships array (or empty)`)
            }
          }
          
          // Parse relationships - Amazon 2022-04-01 format:
          // relationships: [ { marketplaceId: "...", relationships: [...] } ]
          const relationshipsWrapper = response.relationships || []
          
          for (const wrapper of relationshipsWrapper) {
            // The wrapper has marketplaceId and relationships array
            const rels = wrapper.relationships || []
            
            for (const rel of rels) {
              // Each rel has: type, parentAsins?, childAsins?, variationTheme?
              if (rel.type === 'VARIATION') {
                if (rel.parentAsins && rel.parentAsins.length > 0) {
                  const parentAsin = rel.parentAsins[0]
                  parentAsins.add(parentAsin)
                  asinToParent[asin] = parentAsin
                  relationshipsFound++
                  
                  if (relationshipsFound <= 10) {
                    console.log(`  🔗 Found parent: ${asin} -> ${parentAsin} (${rel.variationTheme?.name || 'variation'})`)
                  }
                }
                if (rel.childAsins && rel.childAsins.length > 0) {
                  parentAsins.add(asin)  // This item IS a parent
                }
              }
            }
          }
        }

        processed++
        if (processed % 100 === 0) {
          console.log(`  Processed ${processed}/${asins.length} ASINs (${successCount} successful)...`)
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (err: any) {
        if (processed < 3) {
          console.log(`  ❌ Error for ${asin}: ${err.code || err.message}`)
        }
        processed++
      }
    }

    console.log(`\n✓ Got catalog data for ${successCount}/${asins.length} ASINs`)
    console.log(`  Found ${parentAsins.size} unique parent ASINs`)
    console.log(`  Found ${Object.keys(asinToParent).length} child->parent relationships`)

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

    // Log first row to see what columns are available
    if (reportData.length > 0) {
      console.log('\n📋 Sample row columns:', Object.keys(reportData[0]).join(', '))
      const sampleRow = reportData[0]
      console.log('  Sample FNSKU value:', sampleRow['fnsku'] || sampleRow['fulfillment-channel-sku'] || 'NOT FOUND')
    }

    let fnskuCount = 0

    for (const row of reportData) {
      const sku = row['seller-sku'] || row['sku']
      if (!sku) continue

      const asin = row['asin1'] || row['asin'] || ''
      // Check multiple possible FNSKU column names
      const fnsku = row['fnsku'] || row['fulfillment-channel-sku'] || row['afn-sku'] || ''
      const title = row['item-name'] || row['product-name'] || sku
      const price = parseFloat(row['price'] || '0') || 0
      const quantity = parseInt(row['quantity'] || '0') || 0
      const status = row['status']?.toLowerCase().includes('active') ? 'active' : 'active'
      
      if (fnsku) fnskuCount++

      // Get catalog data for this ASIN
      const catalog = asin ? catalogData[asin] : null
      const catalogSummary = catalog?.summaries?.[0]
      const attributes = catalog?.attributes || {}
      const relationships = catalog?.relationships || []

      // Check for parent relationship using the pre-built asinToParent map
      let parentAsin: string | null = asinToParent[asin] || null
      let isParent = parentAsins.has(asin)

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

      // Extract Amazon listing data for listing tools
      let mainImageUrl: string | null = null
      let additionalImages: string[] = []
      let bulletPoints: string[] = []
      let productDescription: string | null = null

      // Extract images from catalog data
      // Images structure: { images: [{ marketplaceId, images: [{ variant, link, height, width }] }] }
      const catalogImages = catalog?.images || []
      for (const imageGroup of catalogImages) {
        const images = imageGroup?.images || []
        for (const img of images) {
          if (img.link) {
            // MAIN variant is the primary image
            if (img.variant === 'MAIN' && !mainImageUrl) {
              mainImageUrl = img.link
            } else if (img.variant !== 'MAIN') {
              additionalImages.push(img.link)
            }
          }
        }
      }
      // If no MAIN image found, use the first available
      if (!mainImageUrl && additionalImages.length > 0) {
        mainImageUrl = additionalImages.shift() || null
      }

      // Extract bullet points from attributes
      // Bullet points are usually stored as bullet_point attribute array
      const bulletPointAttrs = attributes.bullet_point || []
      for (const bp of bulletPointAttrs) {
        if (bp?.value) {
          bulletPoints.push(bp.value)
        }
      }

      // Extract product description
      // Description can be in product_description or item_description attributes
      const descAttrs = attributes.product_description || attributes.item_description || []
      if (descAttrs.length > 0 && descAttrs[0]?.value) {
        productDescription = descAttrs[0].value
      }

      // Store relevant Amazon attributes for AI tools
      const amazonAttributes = {
        ...(attributes.brand?.[0] && { brand: attributes.brand[0].value }),
        ...(attributes.item_type_name?.[0] && { itemType: attributes.item_type_name[0].value }),
        ...(attributes.material?.[0] && { material: attributes.material[0].value }),
        ...(attributes.target_audience_keyword && { targetAudience: attributes.target_audience_keyword.map((a: any) => a.value) }),
        ...(attributes.style && { style: attributes.style.map((a: any) => a.value) }),
        ...(attributes.recommended_uses_for_product && { recommendedUses: attributes.recommended_uses_for_product.map((a: any) => a.value) }),
        ...(attributes.product_site_launch_date?.[0] && { launchDate: attributes.product_site_launch_date[0].value }),
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
              // Amazon listing data
              mainImageUrl,
              additionalImages: additionalImages.length > 0 ? additionalImages : undefined,
              bulletPoints: bulletPoints.length > 0 ? bulletPoints : undefined,
              productDescription,
              amazonAttributes: Object.keys(amazonAttributes).length > 0 ? amazonAttributes : undefined,
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
            // Amazon listing data - update if we have new data
            ...(mainImageUrl && { mainImageUrl }),
            ...(additionalImages.length > 0 && { additionalImages }),
            ...(bulletPoints.length > 0 && { bulletPoints }),
            ...(productDescription && { productDescription }),
            ...(Object.keys(amazonAttributes).length > 0 && { amazonAttributes }),
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

    // Step 6: Link children to parents using Amazon's relationship data
    console.log(`\n🔗 Linking ${parentChildRelationships.length} variations to parents (from Amazon data)...`)
    let relationshipsLinked = 0
    let virtualParentsCreated = 0

    // Group children by parent ASIN
    const childrenByParent: Record<string, typeof parentChildRelationships> = {}
    for (const rel of parentChildRelationships) {
      if (!childrenByParent[rel.parentAsin]) {
        childrenByParent[rel.parentAsin] = []
      }
      childrenByParent[rel.parentAsin].push(rel)
    }

    console.log(`  Found ${Object.keys(childrenByParent).length} unique parent ASINs from Amazon`)

    for (const [parentAsin, children] of Object.entries(childrenByParent)) {
      // Try to find existing parent product by ASIN
      let parentProduct = await prisma.product.findFirst({
        where: { asin: parentAsin },
      })

      if (parentProduct) {
        console.log(`  Found existing product with parent ASIN ${parentAsin}: ${parentProduct.sku}`)
      }

      // If no parent product exists, create a virtual one
      if (!parentProduct && children.length > 0) {
        const firstChild = await prisma.product.findUnique({
          where: { sku: children[0].childSku },
        })
        
        if (firstChild) {
          // Create virtual parent SKU based on parent ASIN
          const parentSku = `PARENT-${parentAsin}`
          const catalog = catalogData[parentAsin]
          const catalogTitle = catalog?.summaries?.[0]?.itemName
          
          try {
            console.log(`  Creating virtual parent: ${parentSku} for ASIN ${parentAsin}...`)
            parentProduct = await prisma.product.create({
              data: {
                sku: parentSku,
                title: catalogTitle || firstChild.title?.replace(/\s*-?\s*(Small|Medium|Large|XL|XXL|\d+["']?|\d+\s*(inch|in|cm)).*$/i, '') || `Parent of ${firstChild.sku}`,
                asin: parentAsin,
                brand: firstChild.brand || 'KISPER',
                category: firstChild.category,
                cost: 0,
                price: 0,
                status: 'active',
                isParent: true,
                inventoryLevels: {
                  create: {
                    fbaAvailable: 0,
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
            virtualParentsCreated++
            console.log(`  ✓ Created virtual parent: ${parentSku} for ${children.length} children`)
          } catch (err: any) {
            console.log(`  ⚠️ Failed to create parent ${parentSku}: ${err.message || err.code}`)
            // Parent might already exist from a previous sync
            parentProduct = await prisma.product.findFirst({
              where: { asin: parentAsin },
            })
            if (parentProduct) {
              console.log(`  Found existing parent: ${parentProduct.sku}`)
            }
          }
        }
      }

      // Link all children to this parent
      if (parentProduct) {
        await prisma.product.update({
          where: { sku: parentProduct.sku },
          data: { isParent: true },
        })

        for (const child of children) {
          await prisma.product.update({
            where: { sku: child.childSku },
            data: { 
              parentSku: parentProduct.sku,
              variationType: child.variationType,
              variationValue: child.variationValue,
            },
          })
          relationshipsLinked++
        }
      }
    }

    console.log(`  ✓ Created ${virtualParentsCreated} parent groups, linked ${relationshipsLinked} variations`)

    // Step 7: Fetch FNSKUs from FBA Inventory API (this is the most reliable source)
    console.log('\n📦 Fetching FNSKUs and inventory from FBA Inventory API...')
    let fnskuUpdated = 0
    let inventoryUpdated = 0
    
    try {
      let nextToken: string | undefined = undefined
      let allInventory: any[] = []
      let pageCount = 0
      
      do {
        const query: any = {
          granularityType: 'Marketplace',
          granularityId: credentials.marketplaceId,
          marketplaceIds: [credentials.marketplaceId],  // ✅ FIX: Must be an ARRAY, not string
          details: true,  // ✅ FIX: Must be boolean, not string
        }
        if (nextToken) query.nextToken = nextToken
        
        const response = await client.callAPI({
          operation: 'getInventorySummaries',
          endpoint: 'fbaInventory',
          query,
        })
        
        // Detailed debug logging on first page
        if (pageCount === 0) {
          console.log('=== RAW INVENTORY RESPONSE ===')
          console.log('Top-level keys:', Object.keys(response || {}))
          console.log('Full response (first 5000 chars):')
          console.log(JSON.stringify(response, null, 2).substring(0, 5000))
          
          const payload = response?.payload || response
          const items = payload?.inventorySummaries || []
          
          if (items.length > 0) {
            console.log('\n=== FIRST INVENTORY ITEM ===')
            console.log(JSON.stringify(items[0], null, 2))
            console.log('Item keys:', Object.keys(items[0]))
            if (items[0].inventoryDetails) {
              console.log('inventoryDetails keys:', Object.keys(items[0].inventoryDetails))
            } else {
              console.log('⚠️ NO inventoryDetails object!')
            }
          }
          console.log('=== END DEBUG ===')
        }
        
        const summaries = response?.payload?.inventorySummaries || response?.inventorySummaries || []
        allInventory = [...allInventory, ...summaries]
        
        // Try multiple places for nextToken
        nextToken = response?.payload?.pagination?.nextToken || 
                   response?.pagination?.nextToken ||
                   response?.nextToken
        
        pageCount++
        console.log(`  Page ${pageCount}: got ${summaries.length} items (total: ${allInventory.length})${nextToken ? ', has more...' : ', done'}`)
        
        if (nextToken) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      } while (nextToken && pageCount < 100)
      
      console.log(`  Total inventory items: ${allInventory.length}`)
      
      // Update products with FNSKUs AND inventory levels from FBA Inventory API
      for (const item of allInventory) {
        if (item.sellerSku) {
          try {
            // Update FNSKU on product
            if (item.fnSku) {
              const result = await prisma.product.updateMany({
                where: { sku: item.sellerSku },
                data: { fnsku: item.fnSku },
              })
              if (result.count > 0) fnskuUpdated++
            }
            
            // ✅ FIX: Check both locations for inventory data (inventoryDetails or root level)
            const details = item.inventoryDetails || {}
            
            // Fulfillable quantity - check both locations
            const fbaAvailable = details.fulfillableQuantity ?? item.fulfillableQuantity ?? 0
            
            // Inbound quantities - check both locations  
            const fbaInboundWorking = details.inboundWorkingQuantity ?? item.inboundWorkingQuantity ?? 0
            const fbaInboundShipped = details.inboundShippedQuantity ?? item.inboundShippedQuantity ?? 0
            const fbaInboundReceiving = details.inboundReceivingQuantity ?? item.inboundReceivingQuantity ?? 0
            
            // ✅ FIX: Reserved can be number OR object
            let fbaReserved = 0
            const reserved = details.reservedQuantity ?? item.reservedQuantity
            if (reserved) {
              if (typeof reserved === 'number') {
                fbaReserved = reserved
              } else if (reserved.totalReservedQuantity !== undefined) {
                fbaReserved = reserved.totalReservedQuantity || 0
              }
            }
            
            // ✅ FIX: Unfulfillable can be number OR object
            let fbaUnfulfillable = 0
            const unfulfillableData = details.unfulfillableQuantity ?? item.unfulfillableQuantity
            if (unfulfillableData) {
              if (typeof unfulfillableData === 'number') {
                fbaUnfulfillable = unfulfillableData
              } else if (unfulfillableData.totalUnfulfillableQuantity !== undefined) {
                fbaUnfulfillable = unfulfillableData.totalUnfulfillableQuantity || 0
              }
            }
            
            await prisma.inventoryLevel.upsert({
              where: { masterSku: item.sellerSku },
              update: {
                fbaAvailable,
                fbaReserved,
                fbaUnfulfillable,
                fbaInboundWorking,
                fbaInboundShipped,
                fbaInboundReceiving,
              },
              create: {
                masterSku: item.sellerSku,
                fbaAvailable,
                fbaReserved,
                fbaUnfulfillable,
                fbaInboundWorking,
                fbaInboundShipped,
                fbaInboundReceiving,
                warehouseAvailable: 0,
              },
            })
            inventoryUpdated++
          } catch (e) {
            // Ignore errors
          }
        }
      }
      
      console.log(`  ✓ Updated ${fnskuUpdated} FNSKUs and ${inventoryUpdated} inventory levels`)
    } catch (fbaError: any) {
      console.log(`  ⚠️ FBA Inventory API failed: ${fbaError.message}`)
    }

    await updateSyncStatus('success')

    console.log(`\n📊 FNSKU Stats: ${fnskuCount} from report + ${fnskuUpdated} from FBA API`)
    console.log(`📦 Inventory: ${inventoryUpdated} products updated with FBA inventory levels`)

    const message = `Synced ${reportData.length} products: ${created} created, ${updated} updated, ${virtualParentsCreated} parent groups, ${relationshipsLinked} variations linked, ${fnskuUpdated} FNSKUs, ${inventoryUpdated} inventory levels updated`
    console.log(`\n✅ ${message}`)

    return NextResponse.json({
      success: true,
      message,
      created,
      updated,
      mappingsCreated,
      virtualParentsCreated,
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
    const fnsku = item.fnSku  // ✅ FIX: Correct property name is fnSku not fnsku
    const title = item.productName || sku
    
    // ✅ FIX: Robust quantity parsing - check both locations
    const details = item.inventoryDetails || {}
    const quantity = details.fulfillableQuantity ?? item.fulfillableQuantity ?? 0
    const inboundWorking = details.inboundWorkingQuantity ?? item.inboundWorkingQuantity ?? 0
    const inboundShipped = details.inboundShippedQuantity ?? item.inboundShippedQuantity ?? 0
    const inboundReceiving = details.inboundReceivingQuantity ?? item.inboundReceivingQuantity ?? 0
    
    // Reserved can be number or object
    let reserved = 0
    const reservedData = details.reservedQuantity ?? item.reservedQuantity
    if (reservedData) {
      if (typeof reservedData === 'number') {
        reserved = reservedData
      } else if (reservedData.totalReservedQuantity !== undefined) {
        reserved = reservedData.totalReservedQuantity || 0
      }
    }
    
    // Unfulfillable can be number or object
    let unfulfillable = 0
    const unfulfillableData = details.unfulfillableQuantity ?? item.unfulfillableQuantity
    if (unfulfillableData) {
      if (typeof unfulfillableData === 'number') {
        unfulfillable = unfulfillableData
      } else if (unfulfillableData.totalUnfulfillableQuantity !== undefined) {
        unfulfillable = unfulfillableData.totalUnfulfillableQuantity || 0
      }
    }

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
                fbaReserved: reserved,
                fbaUnfulfillable: unfulfillable,
                fbaInboundWorking: inboundWorking,
                fbaInboundShipped: inboundShipped,
                fbaInboundReceiving: inboundReceiving,
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
      // Update product with FNSKU if we have one and it's missing
      if (fnsku && !product.fnsku) {
        await prisma.product.update({
          where: { sku },
          data: { 
            fnsku,
            asin: asin || product.asin,
          },
        })
      }

      await prisma.inventoryLevel.upsert({
        where: { masterSku: sku },
        update: {
          fbaAvailable: quantity,
          fbaReserved: reserved,
          fbaUnfulfillable: unfulfillable,
          fbaInboundWorking: inboundWorking,
          fbaInboundShipped: inboundShipped,
          fbaInboundReceiving: inboundReceiving,
        },
        create: {
          masterSku: sku,
          fbaAvailable: quantity,
          fbaReserved: reserved,
          fbaUnfulfillable: unfulfillable,
          fbaInboundWorking: inboundWorking,
          fbaInboundShipped: inboundShipped,
          fbaInboundReceiving: inboundReceiving,
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
