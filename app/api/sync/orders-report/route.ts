// app/api/sync/orders-report/route.ts
// Syncs orders using GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL report
// This gets item details for pending orders (same-day data like Sellerboard)

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, callApiWithTimeout, getAmazonCredentials } from '@/lib/amazon-sp-api'
import * as zlib from 'zlib'
import { promisify } from 'util'

const gunzipAsync = promisify(zlib.gunzip)

const REPORT_TYPE = 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL'

// Type definitions for API responses
interface CreateReportResponse {
  reportId: string
}

interface ReportStatusResponse {
  processingStatus: string
  reportDocumentId?: string
}

interface ReportDocumentResponse {
  url: string
  compressionAlgorithm?: string
}

export async function POST(request: Request) {
  console.log('[Orders Report] POST request received')

  try {
    const body = await request.json().catch(() => ({}))
    const days = body.days || 3 // Default to last 3 days

    console.log(`[Orders Report] Syncing last ${days} days`)

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    console.log(`[Orders Report] Requesting ${REPORT_TYPE} for last ${days} days`)

    const credentials = await getAmazonCredentials()
    if (!credentials) {
      console.log('[Orders Report] No credentials found')
      return NextResponse.json({ error: 'Amazon credentials not configured' }, { status: 400 })
    }

    console.log('[Orders Report] Credentials found, creating client...')

    const client = await createSpApiClient()
    if (!client) {
      console.log('[Orders Report] Failed to create client')
      return NextResponse.json({ error: 'Failed to create SP-API client' }, { status: 500 })
    }

    console.log('[Orders Report] Client created, requesting report...')

    // Step 1: Create report request
    const createResponse = await callApiWithTimeout<CreateReportResponse>(client, {
      endpoint: 'reports',
      operation: 'createReport',
      body: {
        reportType: REPORT_TYPE,
        dataStartTime: startDate.toISOString(),
        dataEndTime: endDate.toISOString(),
        marketplaceIds: [credentials.marketplaceId],
      },
    }, 30000)

    const reportId = createResponse.reportId
    console.log(`[Orders Report] Created report: ${reportId}`)

    // Step 2: Poll for report completion
    let reportDocumentId: string | null = null
    let attempts = 0
    const maxAttempts = 30 // 5 minutes max

    while (!reportDocumentId && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      attempts++

      const statusResponse = await callApiWithTimeout<ReportStatusResponse>(client, {
        endpoint: 'reports',
        operation: 'getReport',
        path: { reportId },
      }, 30000)

      console.log(`[Orders Report] Status: ${statusResponse.processingStatus} (attempt ${attempts})`)

      if (statusResponse.processingStatus === 'DONE') {
        reportDocumentId = statusResponse.reportDocumentId || null
      } else if (statusResponse.processingStatus === 'FATAL' || statusResponse.processingStatus === 'CANCELLED') {
        throw new Error(`Report failed: ${statusResponse.processingStatus}`)
      }
    }

    if (!reportDocumentId) {
      return NextResponse.json({
        error: 'Report timed out - try again later',
        reportId,
        lastStatus: 'IN_PROGRESS'
      }, { status: 408 })
    }

    // Step 3: Get report document URL
    const documentResponse = await callApiWithTimeout<ReportDocumentResponse>(client, {
      endpoint: 'reports',
      operation: 'getReportDocument',
      path: { reportDocumentId },
    }, 30000)

    // Step 4: Download and parse report
    const reportData = await downloadAndParseReport(
      documentResponse.url,
      documentResponse.compressionAlgorithm
    )

    console.log(`[Orders Report] Downloaded ${reportData.length} rows`)

    if (reportData.length === 0) {
      return NextResponse.json({
        success: true,
        reportId,
        days,
        message: 'No orders found in report',
        stats: { ordersProcessed: 0, itemsCreated: 0, itemsUpdated: 0, errors: 0 }
      })
    }

    // Step 5: Process and save to database
    const stats = await processOrdersReport(reportData)

    return NextResponse.json({
      success: true,
      reportId,
      days,
      stats,
    })

  } catch (error: any) {
    console.error('[Orders Report] Error:', error.message)
    console.error('[Orders Report] Stack:', error.stack)
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    )
  }
}

async function downloadAndParseReport(url: string, compression?: string): Promise<any[]> {
  console.log(`[Orders Report] Downloading from ${url.substring(0, 50)}...`)

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download report: ${response.status}`)
  }

  let text: string
  if (compression === 'GZIP') {
    const buffer = await response.arrayBuffer()
    const decompressed = await gunzipAsync(Buffer.from(buffer))
    text = decompressed.toString('utf-8')
  } else {
    text = await response.text()
  }

  // Parse TSV
  const lines = text.trim().split('\n')
  if (lines.length < 2) {
    console.log('[Orders Report] Report is empty or has only headers')
    return []
  }

  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().replace(/-/g, '_'))
  console.log(`[Orders Report] Headers: ${headers.slice(0, 10).join(', ')}...`)

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t')
    const row: any = {}
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() || null
    })
    rows.push(row)
  }

  return rows
}

async function processOrdersReport(rows: any[]): Promise<{
  ordersProcessed: number
  itemsCreated: number
  itemsUpdated: number
  errors: number
}> {
  let ordersProcessed = 0
  let itemsCreated = 0
  let itemsUpdated = 0
  let errors = 0

  // Group by order ID
  const orderMap = new Map<string, any[]>()
  for (const row of rows) {
    const orderId = row['amazon_order_id'] || row['order_id']
    if (!orderId) continue

    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, [])
    }
    orderMap.get(orderId)!.push(row)
  }

  console.log(`[Orders Report] Processing ${orderMap.size} unique orders`)

  // Get existing products for foreign key validation
  const allSkus = new Set<string>()
  for (const [, items] of orderMap) {
    for (const item of items) {
      const sku = item['sku'] || item['seller_sku']
      if (sku) allSkus.add(sku)
    }
  }

  const existingProducts = await prisma.product.findMany({
    where: { sku: { in: Array.from(allSkus) } },
    select: { sku: true },
  })
  const existingSkuSet = new Set(existingProducts.map((p: any) => p.sku))
  console.log(`[Orders Report] Found ${existingSkuSet.size} existing products out of ${allSkus.size} SKUs`)

  // Process orders in batches using Prisma transactions
  const orderIds = Array.from(orderMap.keys())
  const batchSize = 100

  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize)

    try {
      await prisma.$transaction(async (tx: any) => {
        for (const orderId of batch) {
          const items = orderMap.get(orderId)!
          const firstItem = items[0]

          try {
            const purchaseDate = parseDate(firstItem['purchase_date'])
            const status = firstItem['order_status'] || 'Unknown'

            let orderTotal = 0
            for (const item of items) {
              orderTotal += parseFloat(item['item_price'] || '0')
            }

            // Upsert order using Prisma (safe from SQL injection)
            await tx.order.upsert({
              where: { id: orderId },
              update: {
                status,
                orderTotal,
                shipCity: firstItem['ship_city'] || null,
                shipState: firstItem['ship_state'] || null,
                shipCountry: firstItem['ship_country'] || null,
                shipPostalCode: firstItem['ship_postal_code'] || null,
                fulfillmentChannel: firstItem['fulfillment_channel'] || null,
                salesChannel: firstItem['sales_channel'] || null,
              },
              create: {
                id: orderId,
                purchaseDate,
                status,
                orderTotal,
                currency: firstItem['currency'] || 'USD',
                shipCity: firstItem['ship_city'] || null,
                shipState: firstItem['ship_state'] || null,
                shipCountry: firstItem['ship_country'] || null,
                shipPostalCode: firstItem['ship_postal_code'] || null,
                fulfillmentChannel: firstItem['fulfillment_channel'] || null,
                salesChannel: firstItem['sales_channel'] || null,
              },
            })

            // Delete existing order items for this order
            await tx.orderItem.deleteMany({
              where: { orderId },
            })

            // Aggregate items by SKU (in case of duplicates)
            const itemsBySku = new Map<string, any>()
            for (const item of items) {
              const sku = item['sku'] || item['seller_sku']
              if (!sku) continue

              // Skip items for products that don't exist (foreign key constraint)
              if (!existingSkuSet.has(sku)) {
                console.log(`[Orders Report] Skipping item for unknown SKU: ${sku}`)
                continue
              }

              const itemPrice = parseFloat(item['item_price'] || '0')
              const shippingPrice = parseFloat(item['shipping_price'] || '0')
              const giftWrapPrice = parseFloat(item['gift_wrap_price'] || '0')
              const promoDiscount = Math.abs(parseFloat(item['item_promotion_discount'] || '0'))
              const shipPromoDiscount = Math.abs(parseFloat(item['ship_promotion_discount'] || '0'))

              if (itemsBySku.has(sku)) {
                const existing = itemsBySku.get(sku)
                existing.quantity += parseInt(item['quantity'] || item['quantity_purchased'] || '1')
                existing.itemPrice += itemPrice
                existing.itemTax += parseFloat(item['item_tax'] || '0')
                existing.shippingPrice += shippingPrice
                existing.shippingTax += parseFloat(item['shipping_tax'] || '0')
                existing.promoDiscount += promoDiscount + shipPromoDiscount
                existing.shipPromoDiscount += shipPromoDiscount
                existing.giftWrapPrice += giftWrapPrice
                existing.giftWrapTax += parseFloat(item['gift_wrap_tax'] || '0')
                existing.grossRevenue += itemPrice + shippingPrice + giftWrapPrice
              } else {
                itemsBySku.set(sku, {
                  orderId,
                  masterSku: sku,
                  asin: item['asin'] || null,
                  quantity: parseInt(item['quantity'] || item['quantity_purchased'] || '1'),
                  itemPrice,
                  itemTax: parseFloat(item['item_tax'] || '0'),
                  shippingPrice,
                  shippingTax: parseFloat(item['shipping_tax'] || '0'),
                  promoDiscount: promoDiscount + shipPromoDiscount,
                  shipPromoDiscount,
                  giftWrapPrice,
                  giftWrapTax: parseFloat(item['gift_wrap_tax'] || '0'),
                  grossRevenue: itemPrice + shippingPrice + giftWrapPrice,
                })
              }
            }

            // Create order items using Prisma createMany (safe from SQL injection)
            const itemsToCreate = Array.from(itemsBySku.values())
            if (itemsToCreate.length > 0) {
              await tx.orderItem.createMany({
                data: itemsToCreate,
              })
              itemsCreated += itemsToCreate.length
            }

            ordersProcessed++
          } catch (err: any) {
            console.error(`[Orders Report] Error processing order ${orderId}:`, err.message)
            errors++
          }
        }
      })
    } catch (txError: any) {
      console.error(`[Orders Report] Transaction error for batch starting at ${i}:`, txError.message)
      errors += batch.length
    }

    const progress = Math.min(100, Math.round(((i + batchSize) / orderIds.length) * 100))
    console.log(`[Orders Report] Progress: ${progress}% (${ordersProcessed} orders, ${itemsCreated} items)`)
  }

  return { ordersProcessed, itemsCreated, itemsUpdated, errors }
}

function parseDate(dateStr: string | null): Date {
  if (!dateStr) return new Date()

  // Handle various Amazon date formats
  const parsed = new Date(dateStr)
  return isNaN(parsed.getTime()) ? new Date() : parsed
}

// GET endpoint to check recent data
export async function GET() {
  try {
    // Get recent sync stats
    const recentOrders = await prisma.$queryRaw`
      SELECT
        DATE(purchase_date) as date,
        COUNT(DISTINCT o.id)::int as orders,
        COUNT(oi.id)::int as items,
        COALESCE(SUM(oi.item_price), 0)::numeric as sales
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE purchase_date >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(purchase_date)
      ORDER BY date DESC
    `

    return NextResponse.json({
      reportType: REPORT_TYPE,
      description: 'Use POST with {"days": 3} to sync recent orders',
      recentData: recentOrders,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
