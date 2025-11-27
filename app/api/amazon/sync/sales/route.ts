import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials, updateSyncStatus, marketplaceToChannel } from '@/lib/amazon-sp-api'

// NOTE: This sync is READ-ONLY. We never push data to Amazon.

async function waitForReport(client: any, reportId: string, maxWaitMinutes = 600): Promise<string | null> {
  // 600 minutes = 10 hours for very large reports
  const maxAttempts = maxWaitMinutes * 2 // Check every 30 seconds
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts++
    
    const reportResponse = await client.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId },
    })

    const status = reportResponse?.processingStatus
    const minutesElapsed = Math.floor(attempts * 0.5) // 30 seconds per attempt
    console.log(`    Report status: ${status} (${minutesElapsed}/${maxWaitMinutes} minutes)`)

    if (status === 'DONE') {
      return reportResponse?.reportDocumentId || null
    }

    if (status === 'CANCELLED' || status === 'FATAL') {
      throw new Error(`Report failed with status: ${status}`)
    }

    // Wait 30 seconds before next check (less aggressive polling for long reports)
    await new Promise(resolve => setTimeout(resolve, 30000))
  }

  throw new Error(`Report timed out after ${maxWaitMinutes} minutes`)
}

async function downloadReport(client: any, documentId: string): Promise<string> {
  const docResponse = await client.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId: documentId },
  })

  const url = docResponse?.url
  if (!url) {
    throw new Error('No download URL in report document')
  }

  // Download the report content
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.status}`)
  }

  return await response.text()
}

interface OrderReportItem {
  orderId: string
  sku: string
  purchaseDate: string
  purchaseDateTime: string
  quantity: number
  itemPrice: number
  itemTax: number
  shippingPrice: number
  shippingTax: number
  status: string
  fulfillmentChannel: string
  shipCity: string
  shipState: string
  shipCountry: string
  promoDiscount: number
  asin: string
}

function parseOrdersReport(reportContent: string): OrderReportItem[] {
  const lines = reportContent.split('\n')
  if (lines.length < 2) return []

  // Parse header to find column indices
  const header = lines[0].split('\t').map(h => h.toLowerCase().trim())
  
  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const idx = header.findIndex(h => h === p || h.includes(p))
      if (idx >= 0) return idx
    }
    return -1
  }

  const orderIdIdx = findCol(['amazon-order-id', 'order-id'])
  const skuIdx = findCol(['sku', 'seller-sku'])
  const asinIdx = findCol(['asin'])
  const dateIdx = findCol(['purchase-date', 'order-date'])
  const qtyIdx = findCol(['quantity-purchased', 'quantity-shipped', 'quantity'])
  const priceIdx = findCol(['item-price', 'product-sales'])
  const taxIdx = findCol(['item-tax', 'tax'])
  const shipPriceIdx = findCol(['shipping-price', 'shipping-credits'])
  const shipTaxIdx = findCol(['shipping-tax'])
  const statusIdx = findCol(['order-status', 'status'])
  const channelIdx = findCol(['fulfillment-channel', 'sales-channel'])
  const cityIdx = findCol(['ship-city', 'recipient-city'])
  const stateIdx = findCol(['ship-state', 'recipient-state'])
  const countryIdx = findCol(['ship-country', 'recipient-country'])
  const promoIdx = findCol(['item-promotion-discount', 'promotion-discount'])

  console.log(`  Report has ${lines.length - 1} data rows`)
  console.log(`  Key columns: orderId=${orderIdIdx}, sku=${skuIdx}, date=${dateIdx}, qty=${qtyIdx}, price=${priceIdx}`)

  const items: OrderReportItem[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split('\t')
    
    const orderId = orderIdIdx >= 0 ? cols[orderIdIdx]?.trim() : ''
    const sku = skuIdx >= 0 ? cols[skuIdx]?.trim() : ''
    const dateRaw = dateIdx >= 0 ? cols[dateIdx]?.trim() : ''
    const qty = qtyIdx >= 0 ? parseInt(cols[qtyIdx]) || 0 : 1
    const price = priceIdx >= 0 ? parseFloat(cols[priceIdx]) || 0 : 0
    const tax = taxIdx >= 0 ? parseFloat(cols[taxIdx]) || 0 : 0
    const shipPrice = shipPriceIdx >= 0 ? parseFloat(cols[shipPriceIdx]) || 0 : 0
    const shipTax = shipTaxIdx >= 0 ? parseFloat(cols[shipTaxIdx]) || 0 : 0
    const status = statusIdx >= 0 ? cols[statusIdx]?.trim() || 'shipped' : 'shipped'
    const channel = channelIdx >= 0 ? cols[channelIdx]?.trim() : ''
    const city = cityIdx >= 0 ? cols[cityIdx]?.trim() : ''
    const state = stateIdx >= 0 ? cols[stateIdx]?.trim() : ''
    const country = countryIdx >= 0 ? cols[countryIdx]?.trim() : ''
    const promo = promoIdx >= 0 ? parseFloat(cols[promoIdx]) || 0 : 0
    const asin = asinIdx >= 0 ? cols[asinIdx]?.trim() : ''

    if (!orderId || !sku || !dateRaw) continue

    // Parse date (could be various formats)
    let purchaseDate = ''
    let purchaseDateTime = dateRaw
    if (dateRaw.includes('T')) {
      purchaseDate = dateRaw.split('T')[0]
    } else if (dateRaw.includes('-')) {
      purchaseDate = dateRaw.split(' ')[0]
    } else {
      const parsed = new Date(dateRaw)
      if (!isNaN(parsed.getTime())) {
        purchaseDate = parsed.toISOString().split('T')[0]
        purchaseDateTime = parsed.toISOString()
      }
    }

    if (!purchaseDate) continue

    items.push({ 
      orderId, sku, purchaseDate, purchaseDateTime, quantity: qty, 
      itemPrice: price, itemTax: tax, shippingPrice: shipPrice, shippingTax: shipTax,
      status, fulfillmentChannel: channel, shipCity: city, shipState: state, shipCountry: country,
      promoDiscount: Math.abs(promo), asin
    })
  }

  return items
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const daysBack = parseInt(searchParams.get('days') || '730') // Default 2 years (730 days)
    
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
    
    console.log('=== Starting Sales History Sync (READ-ONLY) ===')
    console.log('Seller ID:', credentials.sellerId)
    console.log('Marketplace:', credentials.marketplaceId)
    console.log('Days to fetch:', daysBack)
    
    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)
    
    console.log(`\n📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
    
    // Use Reports API for bulk data - much faster than Orders API for large volumes
    console.log('\n📋 Requesting order report from Amazon...')
    console.log('   (Large reports with 2 years of data can take 1-4+ hours to generate)')
    console.log('   Will wait up to 10 hours for report to complete...')

    let reportItems: Array<{
      orderId: string
      sku: string
      purchaseDate: string
      quantity: number
      itemPrice: number
    }> = []

    // Try different report types
    const reportTypes = [
      'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE',
      'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
      'GET_FLAT_FILE_ORDERS_DATA_BY_ORDER_DATE',
    ]

    let reportSuccess = false

    for (const reportType of reportTypes) {
      if (reportSuccess) break

      console.log(`\n  Trying report type: ${reportType}`)

      try {
        // Request the report
        const createResponse = await client.callAPI({
          operation: 'createReport',
          endpoint: 'reports',
          body: {
            reportType,
            marketplaceIds: [credentials.marketplaceId],
            dataStartTime: startDate.toISOString(),
            dataEndTime: endDate.toISOString(),
          },
        })

        const reportId = createResponse?.reportId
        if (!reportId) {
          console.log(`    Failed to create report - no reportId returned`)
          continue
        }

        console.log(`    Report ID: ${reportId}`)
        console.log(`    Waiting for report to complete...`)

        // Wait for report to complete (up to 10 hours for very large reports)
        const documentId = await waitForReport(client, reportId, 600)
        if (!documentId) {
          console.log(`    Report completed but no document ID`)
          continue
        }

        console.log(`    Report ready! Document ID: ${documentId}`)
        console.log(`    Downloading report...`)

        // Download and parse the report
        const reportContent = await downloadReport(client, documentId)
        const lines = reportContent.split('\n').length
        console.log(`    Downloaded ${lines} lines`)

        // Parse the report
        reportItems = parseOrdersReport(reportContent)
        console.log(`    Parsed ${reportItems.length} order items`)

        if (reportItems.length > 0) {
          reportSuccess = true
        }

      } catch (reportError: any) {
        console.log(`    Report type ${reportType} failed:`, reportError.message?.substring(0, 100))
        
        if (reportError.message?.includes('forbidden') || reportError.message?.includes('Access')) {
          console.log(`    Access denied for this report type`)
        }
      }
    }

    if (!reportSuccess || reportItems.length === 0) {
      // Fallback to Orders API with limited scope
      console.log('\n⚠️ Reports API failed. Falling back to Orders API (limited to recent orders)...')
      
      // Only fetch last 90 days via Orders API to be practical
      const fallbackStartDate = new Date()
      fallbackStartDate.setDate(fallbackStartDate.getDate() - 90)
      
      const fallbackEndDate = new Date()
      fallbackEndDate.setMinutes(fallbackEndDate.getMinutes() - 3)

      let nextToken: string | undefined = undefined
      let pageCount = 0
      const maxPages = 50 // ~5000 orders max via fallback

      do {
        pageCount++
        console.log(`  Fetching orders page ${pageCount}...`)

        const ordersResponse = await client.callAPI({
          operation: 'getOrders',
          endpoint: 'orders',
          query: {
            MarketplaceIds: credentials.marketplaceId,
            CreatedAfter: fallbackStartDate.toISOString(),
            CreatedBefore: fallbackEndDate.toISOString(),
            OrderStatuses: 'Shipped,Unshipped,PartiallyShipped',
            MaxResultsPerPage: 100,
            ...(nextToken ? { NextToken: nextToken } : {}),
          },
        })

        const orders = ordersResponse?.Orders || []
        nextToken = ordersResponse?.NextToken

        console.log(`    Got ${orders.length} orders`)

        for (const order of orders) {
          const orderId = order.AmazonOrderId
          if (!orderId) continue

          const purchaseDate = order.PurchaseDate?.split('T')[0]
          if (!purchaseDate) continue

          try {
            const itemsResponse = await client.callAPI({
              operation: 'getOrderItems',
              endpoint: 'orders',
              path: { orderId },
            })

            const items = itemsResponse?.OrderItems || []

            for (const item of items) {
              const sku = item.SellerSKU
              if (!sku) continue

              reportItems.push({
                orderId,
                sku,
                purchaseDate,
                quantity: item.QuantityOrdered || 0,
                itemPrice: parseFloat(item.ItemPrice?.Amount || '0') || 0,
              })
            }

            await new Promise(resolve => setTimeout(resolve, 100))
          } catch (itemError: any) {
            // Continue
          }
        }

        if (nextToken) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }

      } while (nextToken && pageCount < maxPages)
    }

    // Aggregate by SKU and date
    console.log('\n📊 Aggregating sales data...')
    
    const salesBySkuDate: Record<string, {
      sku: string
      date: string
      unitsSold: number
      revenue: number
      orderIds: Set<string>
    }> = {}

    const uniqueSkus = new Set<string>()
    const uniqueOrders = new Set<string>()
    
    // Group items by order for saving order-level data
    const orderMap: Record<string, {
      orderId: string
      purchaseDateTime: string
      status: string
      fulfillmentChannel: string
      shipCity: string
      shipState: string
      shipCountry: string
      items: OrderReportItem[]
    }> = {}

    for (const item of reportItems) {
      const key = `${item.sku}|${item.purchaseDate}`
      
      if (!salesBySkuDate[key]) {
        salesBySkuDate[key] = {
          sku: item.sku,
          date: item.purchaseDate,
          unitsSold: 0,
          revenue: 0,
          orderIds: new Set(),
        }
      }

      salesBySkuDate[key].unitsSold += item.quantity
      salesBySkuDate[key].revenue += item.itemPrice
      salesBySkuDate[key].orderIds.add(item.orderId)
      
      uniqueSkus.add(item.sku)
      uniqueOrders.add(item.orderId)
      
      // Group by order
      if (!orderMap[item.orderId]) {
        orderMap[item.orderId] = {
          orderId: item.orderId,
          purchaseDateTime: item.purchaseDateTime,
          status: item.status,
          fulfillmentChannel: item.fulfillmentChannel,
          shipCity: item.shipCity,
          shipState: item.shipState,
          shipCountry: item.shipCountry,
          items: []
        }
      }
      orderMap[item.orderId].items.push(item)
    }

    console.log(`  ${uniqueOrders.size} unique orders`)
    console.log(`  ${uniqueSkus.size} unique SKUs`)
    console.log(`  ${Object.keys(salesBySkuDate).length} SKU-date combinations`)

    // Get existing products for matching
    const existingProducts = await prisma.product.findMany({
      select: { sku: true },
    })
    const existingSkuSet = new Set(existingProducts.map(p => p.sku))

    // Save individual orders and order items
    console.log('\n💾 Saving order data to database...')
    
    let ordersCreated = 0
    let ordersUpdated = 0
    let orderItemsCreated = 0
    
    const orderEntries = Object.values(orderMap)
    for (let i = 0; i < orderEntries.length; i++) {
      const order = orderEntries[i]
      
      try {
        // Parse the date
        let purchaseDate: Date
        try {
          purchaseDate = new Date(order.purchaseDateTime)
          if (isNaN(purchaseDate.getTime())) {
            purchaseDate = new Date()
          }
        } catch {
          purchaseDate = new Date()
        }

        // Upsert the order
        const existingOrder = await prisma.order.findUnique({
          where: { id: order.orderId },
        })
        
        await prisma.order.upsert({
          where: { id: order.orderId },
          update: {
            status: order.status || 'shipped',
            fulfillmentChannel: order.fulfillmentChannel || null,
            shipCity: order.shipCity || null,
            shipState: order.shipState || null,
            shipCountry: order.shipCountry || null,
          },
          create: {
            id: order.orderId,
            purchaseDate: purchaseDate,
            status: order.status || 'shipped',
            fulfillmentChannel: order.fulfillmentChannel || null,
            shipCity: order.shipCity || null,
            shipState: order.shipState || null,
            shipCountry: order.shipCountry || null,
          },
        })
        
        if (existingOrder) {
          ordersUpdated++
        } else {
          ordersCreated++
          
          // Only create order items for new orders
          for (const item of order.items) {
            // Skip if product doesn't exist
            if (!existingSkuSet.has(item.sku)) continue
            
            try {
              await prisma.orderItem.create({
                data: {
                  orderId: order.orderId,
                  masterSku: item.sku,
                  quantity: item.quantity,
                  itemPrice: item.itemPrice,
                  itemTax: item.itemTax,
                  shippingPrice: item.shippingPrice,
                  shippingTax: item.shippingTax,
                  promoDiscount: item.promoDiscount,
                },
              })
              orderItemsCreated++
            } catch (itemErr) {
              // Skip duplicates or foreign key errors
            }
          }
        }
      } catch (err: any) {
        // Skip errors and continue
        if (i < 5) {
          console.log(`  Order ${order.orderId} error: ${err.message?.substring(0, 50)}`)
        }
      }
      
      if ((i + 1) % 5000 === 0) {
        console.log(`  Orders progress: ${i + 1}/${orderEntries.length}`)
      }
    }
    
    console.log(`  Orders: ${ordersCreated} created, ${ordersUpdated} updated`)
    console.log(`  Order items: ${orderItemsCreated} created`)

    // Store in DailyProfit table
    console.log('\n📈 Saving aggregated sales data...')
    
    let created = 0
    let updated = 0
    let skippedNoProduct = 0

    const entries = Object.values(salesBySkuDate)
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      
      // Check if product exists
      if (!existingSkuSet.has(entry.sku)) {
        skippedNoProduct++
        continue
      }

      try {
        const existing = await prisma.dailyProfit.findUnique({
          where: {
            date_masterSku: {
              date: new Date(entry.date),
              masterSku: entry.sku,
            },
          },
        })

        await prisma.dailyProfit.upsert({
          where: {
            date_masterSku: {
              date: new Date(entry.date),
              masterSku: entry.sku,
            },
          },
          update: {
            unitsSold: entry.unitsSold,
            revenue: entry.revenue,
            updatedAt: new Date(),
          },
          create: {
            date: new Date(entry.date),
            masterSku: entry.sku,
            unitsSold: entry.unitsSold,
            revenue: entry.revenue,
            amazonFees: 0,
            cogs: 0,
            ppcSpend: 0,
            refunds: 0,
            promoDiscounts: 0,
            grossProfit: 0,
            netProfit: 0,
            profitMargin: 0,
            roi: 0,
          },
        })
        
        if (existing) {
          updated++
        } else {
          created++
        }
      } catch (err: any) {
        // Log but continue
        if (i < 5) {
          console.log(`  Error saving ${entry.sku} ${entry.date}:`, err.message?.substring(0, 50))
        }
      }

      if ((i + 1) % 1000 === 0) {
        console.log(`  Progress: ${i + 1}/${entries.length}`)
      }
    }

    console.log(`  Skipped ${skippedNoProduct} entries (product not in catalog)`)

    // Update sales velocity for each product
    console.log('\n📈 Calculating sales velocity...')
    
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const ninetyDaysAgo = new Date(now)
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    // Get 7-day velocity
    const velocity7dData = await prisma.dailyProfit.groupBy({
      by: ['masterSku'],
      _sum: { unitsSold: true },
      where: { date: { gte: sevenDaysAgo } },
    })

    // Get 30-day velocity
    const velocity30dData = await prisma.dailyProfit.groupBy({
      by: ['masterSku'],
      _sum: { unitsSold: true },
      where: { date: { gte: thirtyDaysAgo } },
    })

    // Get 90-day velocity
    const velocity90dData = await prisma.dailyProfit.groupBy({
      by: ['masterSku'],
      _sum: { unitsSold: true },
      where: { date: { gte: ninetyDaysAgo } },
    })

    // Create maps for quick lookup
    const velocity7dMap = new Map(velocity7dData.map(v => [v.masterSku, v._sum.unitsSold || 0]))
    const velocity30dMap = new Map(velocity30dData.map(v => [v.masterSku, v._sum.unitsSold || 0]))
    const velocity90dMap = new Map(velocity90dData.map(v => [v.masterSku, v._sum.unitsSold || 0]))

    let velocityUpdated = 0
    for (const sku of existingSkuSet) {
      const v7d = velocity7dMap.get(sku) || 0
      const v30d = velocity30dMap.get(sku) || 0
      const v90d = velocity90dMap.get(sku) || 0

      // Only update if we have sales data
      if (v7d > 0 || v30d > 0 || v90d > 0) {
        try {
          await prisma.salesVelocity.upsert({
            where: { masterSku: sku },
            update: {
              velocity7d: v7d / 7,
              velocity30d: v30d / 30,
              velocity90d: v90d / 90,
              lastCalculated: now,
            },
            create: {
              masterSku: sku,
              velocity7d: v7d / 7,
              velocity30d: v30d / 30,
              velocity90d: v90d / 90,
              lastCalculated: now,
            },
          })
          velocityUpdated++
        } catch (err) {
          // Skip if product doesn't exist
        }
      }
    }

    console.log(`  Updated velocity for ${velocityUpdated} products`)

    await updateSyncStatus('success')

    const message = `Synced ${uniqueOrders.size.toLocaleString()} orders with ${reportItems.length.toLocaleString()} line items. Orders: ${ordersCreated} new, ${ordersUpdated} existing. Order items: ${orderItemsCreated}. Daily sales: ${created} new, ${updated} updated. Velocity updated for ${velocityUpdated} products.`
    console.log(`\n✅ ${message}`)

    return NextResponse.json({
      success: true,
      message,
      stats: {
        ordersProcessed: uniqueOrders.size,
        orderItems: reportItems.length,
        skusFound: uniqueSkus.size,
        ordersCreated,
        ordersUpdated,
        orderItemsCreated,
        dailySalesCreated: created,
        dailySalesUpdated: updated,
        velocityUpdated,
      },
    })

  } catch (error: any) {
    console.error('Sales sync error:', error)
    await updateSyncStatus('failed', error.message)
    
    return NextResponse.json(
      { error: error.message || 'Failed to sync sales history' },
      { status: 500 }
    )
  }
}
