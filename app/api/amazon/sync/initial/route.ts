import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

// ============================================
// HELPER FUNCTIONS
// ============================================

function safeFloat(value: string | undefined | null): number {
  if (!value) return 0
  const cleaned = value.replace(/[,$]/g, '').trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

function safeInt(value: string | undefined | null): number {
  if (!value) return 0
  const cleaned = value.replace(/[,$]/g, '').trim()
  const parsed = parseInt(cleaned, 10)
  return isNaN(parsed) ? 0 : parsed
}

function safeDate(value: string | undefined | null): Date | null {
  if (!value) return null
  try {
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

function getField(row: Record<string, string>, ...fieldNames: string[]): string {
  for (const name of fieldNames) {
    if (row[name] !== undefined && row[name] !== '') {
      return row[name]
    }
  }
  return ''
}

/**
 * Wait for an Amazon report to complete
 */
async function waitForReport(
  client: any,
  reportId: string,
  maxWaitMinutes = 720
): Promise<string | null> {
  const checkInterval = 30000 // 30 seconds
  const maxAttempts = Math.ceil((maxWaitMinutes * 60 * 1000) / checkInterval)
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await client.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId },
    })
    
    const status = response?.processingStatus
    const elapsed = Math.round((attempt * checkInterval) / 60000)
    
    console.log(`  Report status: ${status} (${elapsed} min elapsed)`)
    
    if (status === 'DONE') {
      return response?.reportDocumentId || null
    }
    
    if (status === 'CANCELLED' || status === 'FATAL') {
      throw new Error(`Report failed: ${status}`)
    }
    
    await new Promise(r => setTimeout(r, checkInterval))
  }
  
  throw new Error(`Report timed out after ${maxWaitMinutes} minutes`)
}

/**
 * Download report content from Amazon
 */
async function downloadReport(client: any, documentId: string): Promise<string> {
  const response = await client.callAPI({
    operation: 'getReportDocument',
    endpoint: 'reports',
    path: { reportDocumentId: documentId },
  })
  
  // Use the library's download method
  const content = await client.download(response)
  return typeof content === 'string' ? content : JSON.stringify(content)
}

/**
 * Parse tab-delimited report into objects
 */
function parseReport(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []
  
  const headers = lines[0]
    .split('\t')
    .map(h => h.toLowerCase().trim().replace(/['"]/g, ''))
  
  const rows: Record<string, string>[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t').map(v => v.trim().replace(/['"]/g, ''))
    const row: Record<string, string> = {}
    
    headers.forEach((header, idx) => {
      row[header] = values[idx] || ''
    })
    
    rows.push(row)
  }
  
  return rows
}

/**
 * Request a report and download when ready
 */
async function fetchReport(
  client: any,
  reportType: string,
  marketplaceId: string,
  startDate?: Date,
  endDate?: Date
): Promise<{ success: boolean; data?: Record<string, string>[]; error?: string }> {
  try {
    console.log(`\n📄 Requesting report: ${reportType}`)
    
    const body: any = {
      reportType,
      marketplaceIds: [marketplaceId],
    }
    
    if (startDate) body.dataStartTime = startDate.toISOString()
    if (endDate) body.dataEndTime = endDate.toISOString()
    
    const createResponse = await client.callAPI({
      operation: 'createReport',
      endpoint: 'reports',
      body,
    })
    
    const reportId = createResponse?.reportId
    if (!reportId) {
      return { success: false, error: 'No reportId returned' }
    }
    
    console.log(`  Report ID: ${reportId}`)
    console.log(`  Waiting for completion (may take hours for large reports)...`)
    
    const documentId = await waitForReport(client, reportId)
    if (!documentId) {
      return { success: false, error: 'No documentId' }
    }
    
    console.log(`  Downloading report...`)
    const content = await downloadReport(client, documentId)
    const data = parseReport(content)
    
    console.log(`  ✓ Got ${data.length} rows`)
    return { success: true, data }
    
  } catch (error: any) {
    console.log(`  ✗ Failed: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * Try multiple report types until one works
 */
async function fetchReportWithFallback(
  client: any,
  reportTypes: string[],
  marketplaceId: string,
  startDate?: Date,
  endDate?: Date
): Promise<Record<string, string>[]> {
  for (const reportType of reportTypes) {
    const result = await fetchReport(client, reportType, marketplaceId, startDate, endDate)
    if (result.success && result.data && result.data.length > 0) {
      return result.data
    }
  }
  return []
}

// ============================================
// SYNC PHASES
// ============================================

async function syncOrders(client: any, marketplaceId: string, startDate: Date, endDate: Date) {
  console.log('\n' + '='.repeat(60))
  console.log('📦 PHASE 1: ORDERS & ORDER ITEMS')
  console.log(`   Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
  console.log('='.repeat(60))
  
  const ORDER_REPORT_TYPES = [
    'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
    'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE',
    'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
    'GET_FLAT_FILE_ACTIONABLE_ORDER_DATA_SHIPPING',
  ]
  
  const orderRows = await fetchReportWithFallback(
    client, ORDER_REPORT_TYPES, marketplaceId, startDate, endDate
  )
  
  if (orderRows.length === 0) {
    console.log('⚠️ No order data retrieved from any report type')
    return { orders: 0, items: 0 }
  }
  
  // Group rows by order ID
  const orderMap = new Map<string, {
    orderId: string
    purchaseDate: Date
    status: string
    fulfillmentChannel: string
    salesChannel: string
    shipCity: string
    shipState: string
    shipPostalCode: string
    shipCountry: string
    items: any[]
  }>()
  
  for (const row of orderRows) {
    const orderId = getField(row, 'amazon-order-id', 'order-id')
    const sku = getField(row, 'sku', 'seller-sku', 'merchant-sku')
    
    if (!orderId || !sku) continue
    
    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, {
        orderId,
        purchaseDate: safeDate(getField(row, 'purchase-date', 'order-date', 'payments-date')) || new Date(),
        status: getField(row, 'order-status', 'status') || 'Shipped',
        fulfillmentChannel: getField(row, 'fulfillment-channel', 'fulfillment-channel-code') || 'Amazon',
        salesChannel: getField(row, 'sales-channel') || 'Amazon.com',
        shipCity: getField(row, 'ship-city', 'recipient-city') || '',
        shipState: getField(row, 'ship-state', 'recipient-state', 'ship-state-or-region') || '',
        shipPostalCode: getField(row, 'ship-postal-code', 'recipient-postal-code') || '',
        shipCountry: getField(row, 'ship-country', 'recipient-country') || '',
        items: [],
      })
    }
    
    orderMap.get(orderId)!.items.push({
      sku,
      asin: getField(row, 'asin') || null,
      quantity: safeInt(getField(row, 'quantity-purchased', 'quantity-shipped', 'quantity')) || 1,
      itemPrice: safeFloat(getField(row, 'item-price', 'product-sales')),
      itemTax: safeFloat(getField(row, 'item-tax', 'product-sales-tax')),
      shippingPrice: safeFloat(getField(row, 'shipping-price', 'shipping-credits')),
      shippingTax: safeFloat(getField(row, 'shipping-tax', 'shipping-credits-tax')),
      giftWrapPrice: safeFloat(getField(row, 'gift-wrap-price', 'giftwrap-credits')),
      giftWrapTax: safeFloat(getField(row, 'gift-wrap-tax', 'giftwrap-credits-tax')),
      promoDiscount: Math.abs(safeFloat(getField(row, 'item-promotion-discount', 'promotional-rebates'))),
      shipPromoDiscount: Math.abs(safeFloat(getField(row, 'ship-promotion-discount'))),
    })
  }
  
  console.log(`\n  Processing ${orderMap.size} orders...`)
  
  let ordersCreated = 0
  let ordersUpdated = 0
  let itemsCreated = 0
  let processed = 0
  
  for (const [orderId, order] of orderMap) {
    try {
      const existing = await prisma.order.findUnique({ where: { id: orderId } })
      
      await prisma.order.upsert({
        where: { id: orderId },
        update: {
          status: order.status,
          fulfillmentChannel: order.fulfillmentChannel,
          salesChannel: order.salesChannel,
          shipCity: order.shipCity,
          shipState: order.shipState,
          shipPostalCode: order.shipPostalCode,
          shipCountry: order.shipCountry,
        },
        create: {
          id: orderId,
          purchaseDate: order.purchaseDate,
          status: order.status,
          fulfillmentChannel: order.fulfillmentChannel,
          salesChannel: order.salesChannel,
          shipCity: order.shipCity,
          shipState: order.shipState,
          shipPostalCode: order.shipPostalCode,
          shipCountry: order.shipCountry,
        },
      })
      
      if (existing) {
        ordersUpdated++
      } else {
        ordersCreated++
      }
      
      // Upsert order items
      for (const item of order.items) {
        try {
          // Check if product exists
          const product = await prisma.product.findUnique({ where: { sku: item.sku } })
          if (!product) continue // Skip if product doesn't exist
          
          const grossRevenue = item.itemPrice + item.shippingPrice + item.giftWrapPrice
          
          await prisma.orderItem.upsert({
            where: {
              orderId_masterSku: { orderId, masterSku: item.sku },
            },
            update: {
              quantity: item.quantity,
              itemPrice: item.itemPrice,
              itemTax: item.itemTax,
              shippingPrice: item.shippingPrice,
              shippingTax: item.shippingTax,
              giftWrapPrice: item.giftWrapPrice,
              giftWrapTax: item.giftWrapTax,
              promoDiscount: item.promoDiscount,
              shipPromoDiscount: item.shipPromoDiscount,
              grossRevenue,
            },
            create: {
              orderId,
              masterSku: item.sku,
              asin: item.asin,
              quantity: item.quantity,
              itemPrice: item.itemPrice,
              itemTax: item.itemTax,
              shippingPrice: item.shippingPrice,
              shippingTax: item.shippingTax,
              giftWrapPrice: item.giftWrapPrice,
              giftWrapTax: item.giftWrapTax,
              promoDiscount: item.promoDiscount,
              shipPromoDiscount: item.shipPromoDiscount,
              grossRevenue,
            },
          })
          itemsCreated++
        } catch (e) {
          // Skip errors
        }
      }
      
      processed++
      if (processed % 5000 === 0) {
        console.log(`  Progress: ${processed}/${orderMap.size} orders`)
      }
    } catch (e) {
      // Continue on error
    }
  }
  
  console.log(`\n  ✓ Orders: ${ordersCreated} created, ${ordersUpdated} updated`)
  console.log(`  ✓ Order items: ${itemsCreated} saved`)
  
  return { orders: ordersCreated + ordersUpdated, items: itemsCreated }
}

async function syncFees(client: any, marketplaceId: string, startDate: Date, endDate: Date) {
  console.log('\n' + '='.repeat(60))
  console.log('💰 PHASE 2: AMAZON FEES')
  console.log('='.repeat(60))
  
  const FEE_REPORT_TYPES = [
    'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2',
    'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE',
  ]
  
  const feeRows = await fetchReportWithFallback(
    client, FEE_REPORT_TYPES, marketplaceId, startDate, endDate
  )
  
  if (feeRows.length === 0) {
    console.log('⚠️ No fee data retrieved - fees will need to be estimated')
    return { processed: 0 }
  }
  
  // Group fees by order-SKU
  const feeMap = new Map<string, {
    referralFee: number
    fbaFee: number
    otherFees: number
  }>()
  
  for (const row of feeRows) {
    const orderId = getField(row, 'order-id', 'amazon-order-id')
    const sku = getField(row, 'sku', 'seller-sku')
    const amountType = getField(row, 'amount-type', 'transaction-type').toLowerCase()
    const description = getField(row, 'amount-description', 'fee-type', 'description').toLowerCase()
    const amount = Math.abs(safeFloat(getField(row, 'amount', 'total', 'fee-amount')))
    
    if (!orderId || !sku || amount === 0) continue
    
    const key = `${orderId}|${sku}`
    if (!feeMap.has(key)) {
      feeMap.set(key, { referralFee: 0, fbaFee: 0, otherFees: 0 })
    }
    
    const fees = feeMap.get(key)!
    
    if (description.includes('commission') || description.includes('referral')) {
      fees.referralFee += amount
    } else if (
      description.includes('fba') || 
      description.includes('fulfillment') ||
      description.includes('pick & pack') ||
      description.includes('weight handling')
    ) {
      fees.fbaFee += amount
    } else if (amountType.includes('fee') || description.includes('fee')) {
      fees.otherFees += amount
    }
  }
  
  console.log(`\n  Applying fees to ${feeMap.size} order-SKU combinations...`)
  
  let updated = 0
  
  for (const [key, fees] of feeMap) {
    const [orderId, sku] = key.split('|')
    const totalFees = fees.referralFee + fees.fbaFee + fees.otherFees
    
    try {
      const result = await prisma.orderItem.updateMany({
        where: { orderId, masterSku: sku },
        data: {
          referralFee: fees.referralFee,
          fbaFee: fees.fbaFee,
          otherFees: fees.otherFees,
          amazonFees: totalFees,
        },
      })
      
      if (result.count > 0) updated++
    } catch (e) {
      // Continue on error
    }
  }
  
  console.log(`  ✓ Updated fees for ${updated} order items`)
  
  return { processed: updated }
}

async function syncReturns(client: any, marketplaceId: string, startDate: Date, endDate: Date) {
  console.log('\n' + '='.repeat(60))
  console.log('🔄 PHASE 3: CUSTOMER RETURNS')
  console.log('='.repeat(60))
  
  const RETURN_REPORT_TYPES = [
    'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
    'GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE',
  ]
  
  const returnRows = await fetchReportWithFallback(
    client, RETURN_REPORT_TYPES, marketplaceId, startDate, endDate
  )
  
  if (returnRows.length === 0) {
    console.log('⚠️ No return data retrieved')
    return { created: 0 }
  }
  
  let created = 0
  
  for (const row of returnRows) {
    const lpn = getField(row, 'license-plate-number', 'return-id', 'lpn')
    const sku = getField(row, 'sku', 'seller-sku', 'merchant-sku')
    const orderId = getField(row, 'order-id', 'amazon-order-id')
    
    if (!sku && !getField(row, 'asin')) continue
    if (!orderId) continue
    
    // Generate unique ID if none provided
    const returnId = lpn || `RET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    try {
      // Check if order and product exist
      const order = await prisma.order.findUnique({ where: { id: orderId } })
      const product = sku ? await prisma.product.findUnique({ where: { sku } }) : null
      
      if (!order || !product) continue
      
      await prisma.return.upsert({
        where: { returnId },
        update: {
          quantity: safeInt(getField(row, 'quantity', 'returned-quantity')) || 1,
          reason: getField(row, 'reason', 'return-reason') || null,
          disposition: getField(row, 'disposition', 'product-condition', 'detailed-disposition') || 'unknown',
        },
        create: {
          returnId,
          orderId,
          masterSku: sku,
          returnDate: safeDate(getField(row, 'return-date', 'return-request-date')) || new Date(),
          quantity: safeInt(getField(row, 'quantity', 'returned-quantity')) || 1,
          reason: getField(row, 'reason', 'return-reason') || null,
          customerComments: getField(row, 'customer-comments') || null,
          disposition: getField(row, 'disposition', 'product-condition', 'detailed-disposition') || 'unknown',
          refundAmount: safeFloat(getField(row, 'refund-amount', 'amount')),
        },
      })
      created++
    } catch (e) {
      // Skip duplicates or errors
    }
  }
  
  console.log(`  ✓ Returns: ${created} saved`)
  
  return { created }
}

async function syncReimbursements(client: any, marketplaceId: string, startDate: Date, endDate: Date) {
  console.log('\n' + '='.repeat(60))
  console.log('💵 PHASE 4: REIMBURSEMENTS')
  console.log('='.repeat(60))
  
  const result = await fetchReport(
    client,
    'GET_FBA_REIMBURSEMENTS_DATA',
    marketplaceId,
    startDate,
    endDate
  )
  
  if (!result.success || !result.data?.length) {
    console.log('⚠️ No reimbursement data retrieved')
    return { created: 0, totalAmount: 0 }
  }
  
  let created = 0
  let totalAmount = 0
  
  for (const row of result.data) {
    const reimbursementId = getField(row, 'reimbursement-id')
    const amount = safeFloat(getField(row, 'amount-total', 'total-amount', 'amount'))
    
    if (!reimbursementId || amount === 0) continue
    
    try {
      await prisma.reimbursement.upsert({
        where: { reimbursementId },
        update: {
          amountTotal: amount,
          quantity: safeInt(getField(row, 'quantity-reimbursed-inventory', 'quantity')) || 1,
        },
        create: {
          reimbursementId,
          approvalDate: safeDate(getField(row, 'approval-date', 'reimbursement-date')) || new Date(),
          masterSku: getField(row, 'sku', 'seller-sku', 'merchant-sku') || null,
          asin: getField(row, 'asin') || null,
          fnsku: getField(row, 'fnsku') || null,
          caseId: getField(row, 'case-id') || null,
          reason: getField(row, 'reason', 'reimbursement-reason') || null,
          condition: getField(row, 'condition') || null,
          quantity: safeInt(getField(row, 'quantity-reimbursed-inventory', 'quantity')) || 1,
          amountPerUnit: safeFloat(getField(row, 'amount-per-unit', 'per-unit-amount')),
          amountTotal: amount,
          currencyCode: getField(row, 'currency-unit', 'currency') || 'USD',
        },
      })
      created++
      totalAmount += amount
    } catch (e) {
      // Skip duplicates
    }
  }
  
  console.log(`  ✓ Reimbursements: ${created} saved, $${totalAmount.toFixed(2)} total`)
  
  return { created, totalAmount }
}

async function syncRemovals(client: any, marketplaceId: string, startDate: Date, endDate: Date) {
  console.log('\n' + '='.repeat(60))
  console.log('🚚 PHASE 5: REMOVAL ORDERS')
  console.log('='.repeat(60))
  
  const REMOVAL_REPORT_TYPES = [
    'GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA',
    'GET_FBA_FULFILLMENT_REMOVAL_SHIPMENT_DETAIL_DATA',
  ]
  
  const removalRows = await fetchReportWithFallback(
    client, REMOVAL_REPORT_TYPES, marketplaceId, startDate, endDate
  )
  
  if (removalRows.length === 0) {
    console.log('⚠️ No removal data retrieved')
    return { created: 0 }
  }
  
  let created = 0
  
  for (const row of removalRows) {
    const removalOrderId = getField(row, 'order-id', 'removal-order-id')
    
    if (!removalOrderId) continue
    
    try {
      await prisma.removalOrder.upsert({
        where: { removalOrderId },
        update: {
          orderStatus: getField(row, 'order-status', 'status') || 'Unknown',
          lastUpdatedDate: safeDate(getField(row, 'last-updated-date')),
          shippedQuantity: safeInt(getField(row, 'shipped-quantity')),
          disposedQuantity: safeInt(getField(row, 'disposed-quantity')),
          cancelledQuantity: safeInt(getField(row, 'cancelled-quantity')),
        },
        create: {
          removalOrderId,
          requestDate: safeDate(getField(row, 'request-date', 'order-date')) || new Date(),
          lastUpdatedDate: safeDate(getField(row, 'last-updated-date')),
          masterSku: getField(row, 'sku', 'seller-sku', 'merchant-sku') || null,
          asin: getField(row, 'asin') || null,
          fnsku: getField(row, 'fnsku') || null,
          orderType: getField(row, 'order-type', 'removal-order-type') || 'Return',
          orderStatus: getField(row, 'order-status', 'status') || 'Unknown',
          requestedQuantity: safeInt(getField(row, 'requested-quantity')),
          shippedQuantity: safeInt(getField(row, 'shipped-quantity')),
          disposedQuantity: safeInt(getField(row, 'disposed-quantity')),
          cancelledQuantity: safeInt(getField(row, 'cancelled-quantity')),
          inProcessQuantity: safeInt(getField(row, 'in-process-quantity')),
          removalFee: safeFloat(getField(row, 'removal-fee', 'fee')),
          trackingNumber: getField(row, 'tracking-number') || null,
          carrier: getField(row, 'carrier') || null,
        },
      })
      created++
    } catch (e) {
      // Skip duplicates
    }
  }
  
  console.log(`  ✓ Removal orders: ${created} saved`)
  
  return { created }
}

async function syncStorageFees(client: any, marketplaceId: string) {
  console.log('\n' + '='.repeat(60))
  console.log('📦 PHASE 6: STORAGE FEES')
  console.log('='.repeat(60))
  
  const result = await fetchReport(
    client,
    'GET_FBA_STORAGE_FEE_CHARGES_DATA',
    marketplaceId
  )
  
  if (!result.success || !result.data?.length) {
    console.log('⚠️ No storage fee data retrieved')
    return { created: 0 }
  }
  
  let created = 0
  
  for (const row of result.data) {
    const sku = getField(row, 'sku', 'seller-sku', 'merchant-sku')
    if (!sku) continue
    
    const snapshotDate = safeDate(getField(row, 'month-of-charge', 'snapshot-date', 'charge-date')) || new Date()
    
    try {
      await prisma.storageFee.upsert({
        where: {
          masterSku_snapshotDate: { masterSku: sku, snapshotDate },
        },
        update: {
          monthlyStorageFee: safeFloat(getField(row, 'estimated-monthly-storage-fee', 'monthly-storage-fee')),
          longTermStorageFee: safeFloat(getField(row, '12-mo-long-term-storage-fee', 'aged-inventory-surcharge', 'long-term-storage-fee')),
          quantityCharged: safeInt(getField(row, 'average-quantity-on-hand', 'qty-charged')),
          volumeCubicFeet: safeFloat(getField(row, 'average-volume-cubic-feet', 'volume-cubic-feet')),
        },
        create: {
          snapshotDate,
          masterSku: sku,
          asin: getField(row, 'asin') || null,
          fnsku: getField(row, 'fnsku') || null,
          condition: getField(row, 'condition') || null,
          quantityCharged: safeInt(getField(row, 'average-quantity-on-hand', 'qty-charged')),
          monthlyStorageFee: safeFloat(getField(row, 'estimated-monthly-storage-fee', 'monthly-storage-fee')),
          longTermStorageFee: safeFloat(getField(row, '12-mo-long-term-storage-fee', 'aged-inventory-surcharge')),
          volumeCubicFeet: safeFloat(getField(row, 'average-volume-cubic-feet', 'volume-cubic-feet')),
        },
      })
      created++
    } catch (e) {
      // Skip duplicates
    }
  }
  
  console.log(`  ✓ Storage fee records: ${created} saved`)
  
  return { created }
}

async function calculateSalesVelocity() {
  console.log('\n' + '='.repeat(60))
  console.log('📈 PHASE 7: SALES VELOCITY CALCULATION')
  console.log('='.repeat(60))
  
  // Get all unique SKUs from order items
  const skus = await prisma.orderItem.findMany({
    select: { masterSku: true },
    distinct: ['masterSku'],
  })
  
  const now = new Date()
  const days7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const days90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  
  let updated = 0
  
  for (const { masterSku } of skus) {
    const [stats7, stats30, stats90] = await Promise.all([
      prisma.orderItem.aggregate({
        where: {
          masterSku,
          order: { purchaseDate: { gte: days7 } },
        },
        _sum: { quantity: true, grossRevenue: true },
      }),
      prisma.orderItem.aggregate({
        where: {
          masterSku,
          order: { purchaseDate: { gte: days30 } },
        },
        _sum: { quantity: true, grossRevenue: true },
      }),
      prisma.orderItem.aggregate({
        where: {
          masterSku,
          order: { purchaseDate: { gte: days90 } },
        },
        _sum: { quantity: true, grossRevenue: true },
      }),
    ])
    
    const units7 = stats7._sum.quantity || 0
    const units30 = stats30._sum.quantity || 0
    const units90 = stats90._sum.quantity || 0
    
    try {
      await prisma.salesVelocity.upsert({
        where: { masterSku },
        update: {
          velocity7d: units7 / 7,
          velocity30d: units30 / 30,
          velocity90d: units90 / 90,
        },
        create: {
          masterSku,
          velocity7d: units7 / 7,
          velocity30d: units30 / 30,
          velocity90d: units90 / 90,
        },
      })
      updated++
    } catch (e) {
      // Skip errors
    }
  }
  
  console.log(`  ✓ Sales velocity updated for ${updated} SKUs`)
  
  return { updated }
}

async function aggregateDailyProfits() {
  console.log('\n' + '='.repeat(60))
  console.log('📊 PHASE 8: DAILY PROFIT AGGREGATION')
  console.log('='.repeat(60))
  
  // Get all order items grouped by date and SKU
  const orderItems = await prisma.orderItem.findMany({
    include: {
      order: {
        select: { purchaseDate: true },
      },
      product: {
        select: { cost: true },
      },
    },
  })
  
  // Group by date + SKU
  const dailyMap = new Map<string, {
    date: Date
    masterSku: string
    unitsSold: number
    revenue: number
    amazonFees: number
    cogs: number
    promoDiscounts: number
  }>()
  
  for (const item of orderItems) {
    const date = new Date(item.order.purchaseDate)
    date.setHours(0, 0, 0, 0)
    const dateStr = date.toISOString().split('T')[0]
    const key = `${dateStr}|${item.masterSku}`
    
    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        date,
        masterSku: item.masterSku,
        unitsSold: 0,
        revenue: 0,
        amazonFees: 0,
        cogs: 0,
        promoDiscounts: 0,
      })
    }
    
    const daily = dailyMap.get(key)!
    const cost = Number(item.product?.cost || 0)
    
    daily.unitsSold += item.quantity
    daily.revenue += Number(item.grossRevenue || 0)
    daily.amazonFees += Number(item.amazonFees || 0)
    daily.cogs += item.quantity * cost
    daily.promoDiscounts += Number(item.promoDiscount || 0)
  }
  
  console.log(`  Saving ${dailyMap.size} daily records...`)
  
  let created = 0
  
  for (const [_, daily] of dailyMap) {
    const grossProfit = daily.revenue - daily.amazonFees - daily.promoDiscounts
    const netProfit = grossProfit - daily.cogs
    const profitMargin = daily.revenue > 0 ? (netProfit / daily.revenue) * 100 : 0
    
    try {
      await prisma.dailyProfit.upsert({
        where: {
          date_masterSku: { date: daily.date, masterSku: daily.masterSku },
        },
        update: {
          unitsSold: daily.unitsSold,
          revenue: daily.revenue,
          amazonFees: daily.amazonFees,
          cogs: daily.cogs,
          promoDiscounts: daily.promoDiscounts,
          grossProfit,
          netProfit,
          profitMargin,
        },
        create: {
          date: daily.date,
          masterSku: daily.masterSku,
          unitsSold: daily.unitsSold,
          revenue: daily.revenue,
          amazonFees: daily.amazonFees,
          cogs: daily.cogs,
          promoDiscounts: daily.promoDiscounts,
          grossProfit,
          netProfit,
          profitMargin,
        },
      })
      created++
    } catch (e) {
      // Skip errors
    }
  }
  
  console.log(`  ✓ Daily profit records: ${created} saved`)
  
  return { created }
}

// ============================================
// MAIN SYNC ENDPOINT
// ============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { searchParams } = new URL(request.url)
    const daysBack = parseInt(searchParams.get('days') || '730') // Default 2 years
    
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json({ error: 'Amazon credentials not configured' }, { status: 400 })
    }

    const client = await createSpApiClient()
    if (!client) {
      throw new Error('Failed to create SP-API client')
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    console.log('\n' + '╔' + '═'.repeat(58) + '╗')
    console.log('║' + '   AMAZON 2-YEAR HISTORICAL SYNC - INITIAL SETUP'.padEnd(58) + '║')
    console.log('║' + `   Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`.padEnd(58) + '║')
    console.log('║' + '   This may take several hours for large accounts'.padEnd(58) + '║')
    console.log('╚' + '═'.repeat(58) + '╝\n')

    // Log sync start (gracefully handle if SyncLog model doesn't exist)
    let syncLogId: number | null = null
    try {
      const syncLog = await prisma.syncLog.create({
        data: {
          syncType: 'initial-full',
          status: 'running',
        },
      })
      syncLogId = syncLog.id
    } catch (e) {
      console.log('Note: SyncLog table not available, continuing without tracking...')
    }

    const results: Record<string, any> = {}

    // Phase 1: Orders
    results.orders = await syncOrders(client, credentials.marketplaceId, startDate, endDate)

    // Phase 2: Fees
    results.fees = await syncFees(client, credentials.marketplaceId, startDate, endDate)

    // Phase 3: Returns
    results.returns = await syncReturns(client, credentials.marketplaceId, startDate, endDate)

    // Phase 4: Reimbursements
    results.reimbursements = await syncReimbursements(client, credentials.marketplaceId, startDate, endDate)

    // Phase 5: Removals
    results.removals = await syncRemovals(client, credentials.marketplaceId, startDate, endDate)

    // Phase 6: Storage Fees
    results.storageFees = await syncStorageFees(client, credentials.marketplaceId)

    // Phase 7: Sales Velocity
    results.velocity = await calculateSalesVelocity()

    // Phase 8: Daily Aggregation
    results.dailyProfits = await aggregateDailyProfits()

    // Calculate elapsed time
    const elapsedMs = Date.now() - startTime
    const elapsedMinutes = Math.round(elapsedMs / 60000)

    // Update sync log
    if (syncLogId) {
      try {
        await prisma.syncLog.update({
          where: { id: syncLogId },
          data: {
            status: 'success',
            completedAt: new Date(),
            metadata: results,
          },
        })
      } catch (e) {
        // Ignore if table doesn't exist
      }
    }

    console.log('\n' + '╔' + '═'.repeat(58) + '╗')
    console.log('║' + '   ✅ INITIAL SYNC COMPLETE'.padEnd(58) + '║')
    console.log('║' + `   Total time: ${elapsedMinutes} minutes`.padEnd(58) + '║')
    console.log('╚' + '═'.repeat(58) + '╝\n')

    return NextResponse.json({
      success: true,
      message: `Initial sync complete in ${elapsedMinutes} minutes`,
      elapsedMinutes,
      results,
    })

  } catch (error: any) {
    console.error('\n❌ SYNC FAILED:', error.message)
    
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    )
  }
}

// GET endpoint to check sync status
export async function GET() {
  try {
    const latestSync = await prisma.syncLog.findFirst({
      where: { syncType: 'initial-full' },
      orderBy: { startedAt: 'desc' },
    })

    return NextResponse.json({
      status: latestSync?.status || 'never-run',
      startedAt: latestSync?.startedAt,
      completedAt: latestSync?.completedAt,
      results: latestSync?.metadata,
    })
  } catch (e) {
    // SyncLog model might not exist yet
    return NextResponse.json({
      status: 'never-run',
      startedAt: null,
      completedAt: null,
      results: null,
    })
  }
}

