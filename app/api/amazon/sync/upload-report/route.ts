/**
 * Ultra-Fast Upload Report Endpoint
 * 
 * Optimized for 300,000+ orders using:
 * - Bulk createMany with skipDuplicates (no individual updates)
 * - Minimal database queries
 * - Large batch sizes
 * - No transactions (faster for bulk inserts)
 * 
 * POST /api/amazon/sync/upload-report - Upload a report file
 * GET /api/amazon/sync/upload-report - Get upload status
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Track processing status
let uploadStatus = {
  processing: false,
  lastFile: '',
  totalRows: 0,
  ordersProcessed: 0,
  itemsProcessed: 0,
  skipped: 0,
  errors: 0,
  message: '',
  startTime: 0,
  phase: '',
}

export async function GET() {
  const elapsed = uploadStatus.startTime ? ((Date.now() - uploadStatus.startTime) / 1000).toFixed(0) : 0
  return NextResponse.json({ ...uploadStatus, elapsedSeconds: elapsed })
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const fileSizeMB = (file.size / 1024 / 1024).toFixed(1)
    console.log(`\n📁 Processing: ${file.name} (${fileSizeMB} MB)`)

    // Reset status
    uploadStatus = {
      processing: true,
      lastFile: file.name,
      totalRows: 0,
      ordersProcessed: 0,
      itemsProcessed: 0,
      skipped: 0,
      errors: 0,
      message: 'Reading file...',
      startTime: Date.now(),
      phase: 'reading',
    }

    // Read file content
    const content = await file.text()
    
    // Parse TSV
    uploadStatus.phase = 'parsing'
    uploadStatus.message = 'Parsing file...'
    
    const lines = content.split('\n')
    const dataLines = lines.filter(l => l.trim())
    
    if (dataLines.length < 2) {
      uploadStatus.processing = false
      uploadStatus.message = 'File is empty'
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    // Parse headers
    const headers = dataLines[0].split('\t').map(h => 
      h.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    )
    
    uploadStatus.totalRows = dataLines.length - 1
    console.log(`   ${uploadStatus.totalRows} data rows, ${headers.length} columns`)

    // Helper to get field with multiple possible names
    const getField = (row: Record<string, string>, ...names: string[]): string => {
      for (const name of names) {
        const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (row[normalized]) return row[normalized]
      }
      return ''
    }

    const safeFloat = (val: string): number => {
      const parsed = parseFloat(val?.replace(/[,$"]/g, '') || '0')
      return isNaN(parsed) ? 0 : parsed
    }

    const safeInt = (val: string): number => {
      const parsed = parseInt(val?.replace(/[,$"]/g, '') || '0', 10)
      return isNaN(parsed) ? 0 : parsed
    }

    // PHASE 1: Parse all rows and group by order
    uploadStatus.phase = 'grouping'
    uploadStatus.message = 'Grouping orders...'
    
    const orderMap = new Map<string, { order: any; items: any[] }>()
    const allSkus = new Set<string>()

    for (let i = 1; i < dataLines.length; i++) {
      const values = dataLines[i].split('\t')
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => {
        row[h] = values[idx]?.trim() || ''
      })

      const orderId = getField(row, 'amazon-order-id', 'amazonorderid', 'order-id', 'orderid')
      if (!orderId) {
        uploadStatus.skipped++
        continue
      }

      const sku = getField(row, 'sku', 'seller-sku', 'sellersku', 'merchant-sku', 'merchantsku')
      if (sku) allSkus.add(sku)

      if (!orderMap.has(orderId)) {
        // Parse order data from first row
        const purchaseDateStr = getField(row, 'purchase-date', 'purchasedate', 'shipment-date', 'order-date')
        const shipDateStr = getField(row, 'ship-date', 'shipdate', 'shipment-date')
        const status = getField(row, 'order-status', 'orderstatus', 'status') || 'Shipped'
        const fulfillment = getField(row, 'fulfillment-channel', 'fulfillmentchannel', 'fulfillment')

        orderMap.set(orderId, {
          order: {
            id: orderId,
            purchaseDate: purchaseDateStr ? new Date(purchaseDateStr) : new Date(),
            shipDate: shipDateStr ? new Date(shipDateStr) : null,
            orderTotal: 0, // Will calculate from items
            currency: 'USD',
            status: normalizeStatus(status),
            fulfillmentChannel: fulfillment?.includes('FBA') || fulfillment?.includes('AFN') ? 'FBA' : 'MFN',
            salesChannel: getField(row, 'sales-channel', 'saleschannel') || 'Amazon.com',
            shipCity: getField(row, 'ship-city', 'shipcity', 'city'),
            shipState: getField(row, 'ship-state', 'shipstate', 'state'),
            shipPostalCode: getField(row, 'ship-postal-code', 'shippostalcode', 'postalcode'),
            shipCountry: getField(row, 'ship-country', 'shipcountry', 'country'),
          },
          items: [],
        })
      }

      // Add item if SKU exists
      if (sku) {
        const itemPrice = safeFloat(getField(row, 'item-price', 'itemprice', 'price'))
        const shippingPrice = safeFloat(getField(row, 'shipping-price', 'shippingprice'))
        const promoDiscount = Math.abs(safeFloat(getField(row, 'item-promotion-discount', 'promo-discount')))
        const shipPromoDiscount = Math.abs(safeFloat(getField(row, 'ship-promotion-discount')))

        orderMap.get(orderId)!.items.push({
          orderId,
          masterSku: sku,
          asin: getField(row, 'asin', 'asin1'),
          quantity: safeInt(getField(row, 'quantity-shipped', 'quantity', 'qty')) || 1,
          itemPrice,
          itemTax: safeFloat(getField(row, 'item-tax', 'itemtax')),
          shippingPrice,
          shippingTax: safeFloat(getField(row, 'shipping-tax', 'shippingtax')),
          giftWrapPrice: safeFloat(getField(row, 'gift-wrap-price', 'giftwrapprice')),
          giftWrapTax: safeFloat(getField(row, 'gift-wrap-tax', 'giftwraptax')),
          promoDiscount,
          shipPromoDiscount,
          grossRevenue: itemPrice + shippingPrice - promoDiscount - shipPromoDiscount,
        })
      }

      // Progress every 50K rows
      if (i % 50000 === 0) {
        console.log(`   Parsed ${i.toLocaleString()} rows...`)
        uploadStatus.message = `Parsing: ${i.toLocaleString()} / ${uploadStatus.totalRows.toLocaleString()} rows`
      }
    }

    console.log(`   ${orderMap.size.toLocaleString()} unique orders, ${allSkus.size.toLocaleString()} unique SKUs`)

    // PHASE 2: Load valid SKUs (products that exist in database)
    uploadStatus.phase = 'validating'
    uploadStatus.message = 'Validating SKUs...'
    
    const skuArray = Array.from(allSkus)
    const validSkus = new Set<string>()
    
    // Query in chunks to avoid query size limits
    const SKU_CHUNK_SIZE = 10000
    for (let i = 0; i < skuArray.length; i += SKU_CHUNK_SIZE) {
      const chunk = skuArray.slice(i, i + SKU_CHUNK_SIZE)
      const products = await prisma.product.findMany({
        where: { sku: { in: chunk } },
        select: { sku: true },
      })
      products.forEach(p => validSkus.add(p.sku))
    }
    
    console.log(`   ${validSkus.size.toLocaleString()} valid SKUs found in database`)

    // PHASE 3: Prepare orders for bulk insert
    uploadStatus.phase = 'preparing'
    uploadStatus.message = 'Preparing orders...'
    
    const allOrders: any[] = []
    const allItems: any[] = []
    const seenItemKeys = new Set<string>() // Deduplicate items

    for (const [orderId, data] of orderMap) {
      // Calculate order total from items
      let orderTotal = 0
      for (const item of data.items) {
        if (validSkus.has(item.masterSku)) {
          orderTotal += item.grossRevenue
        }
      }
      
      allOrders.push({
        ...data.order,
        orderTotal,
      })

      // Filter items to only valid SKUs and deduplicate
      for (const item of data.items) {
        if (!validSkus.has(item.masterSku)) {
          uploadStatus.skipped++
          continue
        }

        const itemKey = `${item.orderId}|${item.masterSku}`
        if (seenItemKeys.has(itemKey)) continue // Skip duplicate
        seenItemKeys.add(itemKey)

        allItems.push(item)
      }
    }

    console.log(`   ${allOrders.length.toLocaleString()} orders, ${allItems.length.toLocaleString()} items to insert`)

    // PHASE 4: Bulk insert orders
    uploadStatus.phase = 'inserting_orders'
    uploadStatus.message = 'Inserting orders...'
    
    const ORDER_BATCH_SIZE = 10000
    let ordersInserted = 0

    for (let i = 0; i < allOrders.length; i += ORDER_BATCH_SIZE) {
      const batch = allOrders.slice(i, i + ORDER_BATCH_SIZE)
      
      try {
        const result = await prisma.order.createMany({
          data: batch,
          skipDuplicates: true, // This handles existing orders - just skips them
        })
        ordersInserted += result.count
      } catch (err: any) {
        console.error(`   Order batch error at ${i}:`, err.message)
        uploadStatus.errors++
      }

      uploadStatus.ordersProcessed = i + batch.length
      uploadStatus.message = `Orders: ${uploadStatus.ordersProcessed.toLocaleString()} / ${allOrders.length.toLocaleString()}`
      
      if ((i + batch.length) % 50000 === 0) {
        console.log(`   Inserted ${(i + batch.length).toLocaleString()} orders...`)
      }
    }

    console.log(`   ✓ ${ordersInserted.toLocaleString()} new orders inserted (${allOrders.length - ordersInserted} already existed)`)

    // PHASE 5: Bulk insert items
    uploadStatus.phase = 'inserting_items'
    uploadStatus.message = 'Inserting items...'
    
    const ITEM_BATCH_SIZE = 10000
    let itemsInserted = 0

    for (let i = 0; i < allItems.length; i += ITEM_BATCH_SIZE) {
      const batch = allItems.slice(i, i + ITEM_BATCH_SIZE)
      
      try {
        const result = await prisma.orderItem.createMany({
          data: batch,
          skipDuplicates: true, // Handles existing items
        })
        itemsInserted += result.count
      } catch (err: any) {
        console.error(`   Item batch error at ${i}:`, err.message)
        uploadStatus.errors++
      }

      uploadStatus.itemsProcessed = i + batch.length
      uploadStatus.message = `Items: ${uploadStatus.itemsProcessed.toLocaleString()} / ${allItems.length.toLocaleString()}`
      
      if ((i + batch.length) % 50000 === 0) {
        console.log(`   Inserted ${(i + batch.length).toLocaleString()} items...`)
      }
    }

    console.log(`   ✓ ${itemsInserted.toLocaleString()} new items inserted (${allItems.length - itemsInserted} already existed)`)

    // Done!
    const elapsed = ((Date.now() - uploadStatus.startTime) / 1000).toFixed(1)
    uploadStatus.processing = false
    uploadStatus.phase = 'complete'
    uploadStatus.message = `✅ Done in ${elapsed}s! ${ordersInserted.toLocaleString()} orders, ${itemsInserted.toLocaleString()} items`

    console.log(`\n✅ Upload complete in ${elapsed} seconds`)
    console.log(`   Orders: ${ordersInserted.toLocaleString()} new (${allOrders.length - ordersInserted} skipped)`)
    console.log(`   Items: ${itemsInserted.toLocaleString()} new (${allItems.length - itemsInserted} skipped)`)
    console.log(`   Skipped (no product): ${uploadStatus.skipped.toLocaleString()}`)

    // Log to sync_logs
    await prisma.syncLog.create({
      data: {
        syncType: 'upload-report',
        status: 'success',
        startedAt: new Date(uploadStatus.startTime),
        completedAt: new Date(),
        recordsProcessed: allOrders.length,
        recordsCreated: ordersInserted,
        recordsUpdated: 0,
        recordsSkipped: allOrders.length - ordersInserted + uploadStatus.skipped,
        metadata: {
          file: file.name,
          totalRows: uploadStatus.totalRows,
          itemsCreated: itemsInserted,
          elapsed: `${elapsed}s`,
        },
      },
    })

    return NextResponse.json({
      success: true,
      file: file.name,
      elapsed: `${elapsed}s`,
      orders: {
        total: allOrders.length,
        inserted: ordersInserted,
        skipped: allOrders.length - ordersInserted,
      },
      items: {
        total: allItems.length,
        inserted: itemsInserted,
        skipped: allItems.length - itemsInserted,
      },
      skippedNoProduct: uploadStatus.skipped,
      errors: uploadStatus.errors,
    })

  } catch (error: any) {
    console.error('Upload error:', error)
    uploadStatus.processing = false
    uploadStatus.phase = 'error'
    uploadStatus.message = `Error: ${error.message}`
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function normalizeStatus(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('ship')) return 'Shipped'
  if (s.includes('cancel')) return 'Cancelled'
  if (s.includes('pend')) return 'Pending'
  if (s.includes('deliver')) return 'Delivered'
  if (s.includes('return')) return 'Returned'
  return 'Shipped'
}
