/**
 * Upload Report Endpoint
 * 
 * Upload Amazon report files (TSV/TXT) and process them into the database.
 * POST /api/amazon/sync/upload-report - Upload a report file
 * GET /api/amazon/sync/upload-report - Get upload status
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Track processing status
let uploadStatus = {
  processing: false,
  lastFile: '',
  ordersCreated: 0,
  ordersUpdated: 0,
  itemsProcessed: 0,
  skipped: 0,
  errors: 0,
  message: '',
}

export async function GET() {
  return NextResponse.json(uploadStatus)
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log(`\n📁 Processing uploaded file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`)

    // Reset status
    uploadStatus = {
      processing: true,
      lastFile: file.name,
      ordersCreated: 0,
      ordersUpdated: 0,
      itemsProcessed: 0,
      skipped: 0,
      errors: 0,
      message: 'Processing...',
    }

    // Read file content
    const content = await file.text()
    
    // Parse TSV
    const lines = content.split('\n').filter(l => l.trim())
    if (lines.length < 2) {
      uploadStatus.processing = false
      uploadStatus.message = 'File is empty or has no data rows'
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    // Parse headers - normalize them
    const rawHeaders = lines[0].split('\t')
    const headers = rawHeaders.map(h => 
      h.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    )
    
    console.log(`   Headers (${headers.length}): ${headers.slice(0, 8).join(', ')}...`)

    // Parse rows
    const rows: Record<string, string>[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t')
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => {
        row[h] = values[idx]?.trim() || ''
      })
      rows.push(row)
    }

    console.log(`   Parsed ${rows.length} data rows`)

    // Helper to get field with multiple possible names
    const getField = (row: Record<string, string>, ...names: string[]): string => {
      for (const name of names) {
        const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (row[normalized]) return row[normalized]
      }
      return ''
    }

    // Group rows by order ID
    const orderGroups = new Map<string, Record<string, string>[]>()
    for (const row of rows) {
      const orderId = getField(row, 
        'amazon-order-id', 'amazonorderid', 'order-id', 'orderid'
      )
      if (!orderId) {
        uploadStatus.skipped++
        continue
      }
      if (!orderGroups.has(orderId)) orderGroups.set(orderId, [])
      orderGroups.get(orderId)!.push(row)
    }

    console.log(`   Found ${orderGroups.size} unique orders`)
    uploadStatus.message = `Processing ${orderGroups.size} orders...`

    // Process each order
    for (const [orderId, orderRows] of orderGroups) {
      const firstRow = orderRows[0]

      try {
        // Parse order fields
        const purchaseDateStr = getField(firstRow, 
          'purchase-date', 'purchasedate', 'shipment-date', 'shipmentdate', 'order-date'
        )
        const purchaseDate = purchaseDateStr ? new Date(purchaseDateStr) : new Date()

        const shipDateStr = getField(firstRow, 
          'ship-date', 'shipdate', 'shipment-date', 'shipmentdate'
        )
        const shipDate = shipDateStr ? new Date(shipDateStr) : null

        const shipCity = getField(firstRow, 'ship-city', 'shipcity', 'city')
        const shipState = getField(firstRow, 'ship-state', 'shipstate', 'state')
        const shipPostalCode = getField(firstRow, 'ship-postal-code', 'shippostalcode', 'postalcode')
        const shipCountry = getField(firstRow, 'ship-country', 'shipcountry', 'country')

        const status = getField(firstRow, 'order-status', 'orderstatus', 'status') || 'Shipped'
        const fulfillment = getField(firstRow, 'fulfillment-channel', 'fulfillmentchannel', 'fulfillment')
        const salesChannel = getField(firstRow, 'sales-channel', 'saleschannel') || 'Amazon.com'

        // Check if order exists
        const existing = await prisma.order.findUnique({ where: { id: orderId } })

        // Upsert order
        await prisma.order.upsert({
          where: { id: orderId },
          create: {
            id: orderId,
            purchaseDate,
            shipDate,
            status: normalizeStatus(status),
            fulfillmentChannel: fulfillment?.includes('FBA') || fulfillment?.includes('AFN') ? 'FBA' : 'MFN',
            salesChannel,
            shipCity,
            shipState,
            shipPostalCode,
            shipCountry,
            currency: 'USD',
          },
          update: {
            shipDate,
            status: normalizeStatus(status),
          },
        })

        if (existing) {
          uploadStatus.ordersUpdated++
        } else {
          uploadStatus.ordersCreated++
        }

        // Process order items
        for (const itemRow of orderRows) {
          const sku = getField(itemRow, 
            'sku', 'seller-sku', 'sellersku', 'merchant-sku', 'merchantsku'
          )
          if (!sku) {
            uploadStatus.skipped++
            continue
          }

          // Check if product exists
          const product = await prisma.product.findUnique({ where: { sku } })
          if (!product) {
            uploadStatus.skipped++
            continue
          }

          const asin = getField(itemRow, 'asin', 'asin1')
          const quantity = parseInt(getField(itemRow, 
            'quantity-shipped', 'quantityshipped', 'quantity', 'qty'
          )) || 1

          const itemPrice = parseFloat(getField(itemRow, 
            'item-price', 'itemprice', 'price'
          )) || 0
          const itemTax = parseFloat(getField(itemRow, 'item-tax', 'itemtax', 'tax')) || 0
          const shippingPrice = parseFloat(getField(itemRow, 
            'shipping-price', 'shippingprice', 'ship-price'
          )) || 0
          const shippingTax = parseFloat(getField(itemRow, 'shipping-tax', 'shippingtax')) || 0
          const giftWrapPrice = parseFloat(getField(itemRow, 
            'gift-wrap-price', 'giftwrapprice'
          )) || 0
          const giftWrapTax = parseFloat(getField(itemRow, 'gift-wrap-tax', 'giftwraptax')) || 0
          const promoDiscount = Math.abs(parseFloat(getField(itemRow, 
            'item-promotion-discount', 'itempromotion-discount', 'promo-discount'
          )) || 0)
          const shipPromoDiscount = Math.abs(parseFloat(getField(itemRow, 
            'ship-promotion-discount', 'shippromotion-discount'
          )) || 0)

          const grossRevenue = itemPrice + shippingPrice + giftWrapPrice - promoDiscount - shipPromoDiscount

          try {
            await prisma.orderItem.upsert({
              where: { orderId_masterSku: { orderId, masterSku: sku } },
              create: {
                orderId,
                masterSku: sku,
                asin,
                quantity,
                itemPrice,
                itemTax,
                shippingPrice,
                shippingTax,
                giftWrapPrice,
                giftWrapTax,
                promoDiscount,
                shipPromoDiscount,
                grossRevenue,
              },
              update: {
                asin,
                quantity,
                itemPrice,
                itemTax,
                shippingPrice,
                shippingTax,
                giftWrapPrice,
                giftWrapTax,
                promoDiscount,
                shipPromoDiscount,
                grossRevenue,
              },
            })
            uploadStatus.itemsProcessed++
          } catch (err) {
            uploadStatus.errors++
          }
        }

        // Progress logging
        const total = uploadStatus.ordersCreated + uploadStatus.ordersUpdated
        if (total % 500 === 0) {
          console.log(`   Processed ${total} orders...`)
          uploadStatus.message = `Processed ${total} orders...`
        }

      } catch (err: any) {
        uploadStatus.errors++
        console.error(`   Error processing order ${orderId}:`, err.message)
      }
    }

    // Done
    uploadStatus.processing = false
    uploadStatus.message = `✅ Complete! ${uploadStatus.ordersCreated} created, ${uploadStatus.ordersUpdated} updated, ${uploadStatus.itemsProcessed} items`

    console.log(`\n✅ Upload complete!`)
    console.log(`   Orders created: ${uploadStatus.ordersCreated}`)
    console.log(`   Orders updated: ${uploadStatus.ordersUpdated}`)
    console.log(`   Items: ${uploadStatus.itemsProcessed}`)
    console.log(`   Skipped: ${uploadStatus.skipped}`)
    console.log(`   Errors: ${uploadStatus.errors}`)

    return NextResponse.json({
      success: true,
      file: file.name,
      ordersCreated: uploadStatus.ordersCreated,
      ordersUpdated: uploadStatus.ordersUpdated,
      itemsProcessed: uploadStatus.itemsProcessed,
      skipped: uploadStatus.skipped,
      errors: uploadStatus.errors,
    })

  } catch (error: any) {
    console.error('Upload error:', error)
    uploadStatus.processing = false
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

