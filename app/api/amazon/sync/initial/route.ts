import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

// ============================================
// HELPER FUNCTIONS
// ============================================

function safeFloat(value: any): number {
  if (!value) return 0
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/[,$]/g, '').trim()
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
  console.log('📦 PHASE 1: ORDERS (using Amazon Reports for full history)')
  console.log(`   Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
  console.log('='.repeat(60))
  
  // ✅ FIXED: Added _GENERAL suffix to report types
  const ORDER_REPORT_TYPES = [
    'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
    'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL',
    'GET_FLAT_FILE_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
    'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
  ]
  
  let orderRows: Record<string, string>[] = []
  let usedReportType = ''
  
  // Try each report type until one works
  for (const reportType of ORDER_REPORT_TYPES) {
    console.log(`\n  Trying report type: ${reportType}`)
    const result = await fetchReport(client, reportType, marketplaceId, startDate, endDate)
    
    if (result.success && result.data && result.data.length > 0) {
      orderRows = result.data
      usedReportType = reportType
      console.log(`  ✓ Success! Got ${orderRows.length} rows from ${reportType}`)
      break
    }
  }
  
  if (orderRows.length === 0) {
    console.log('\n  ⚠️ No order data retrieved from any report type')
    console.log('  Possible reasons:')
    console.log('    - Missing report permissions in Seller Central')
    console.log('    - No orders in the date range')
    console.log('    - Report generation failed')
    return { orders: 0, items: 0, reportType: 'none' }
  }
  
  console.log(`\n  Processing ${orderRows.length} order rows...`)
  
  // Log first row headers to debug
  if (orderRows.length > 0) {
    console.log('  Available columns:', Object.keys(orderRows[0]).slice(0, 15).join(', '), '...')
  }
  
  let ordersCreated = 0
  let ordersUpdated = 0
  let itemsCreated = 0
  let productsCreated = 0
  const processedOrders = new Set<string>()
  
  for (let i = 0; i < orderRows.length; i++) {
    const row = orderRows[i]
    
    // Get order ID from various possible field names
    const orderId = getField(row, 
      'amazon-order-id', 
      'order-id', 
      'amazonorderid',
      'merchant-order-id'
    )
    
    if (!orderId) continue
    
    // Get SKU
    const sku = getField(row, 
      'sku', 
      'seller-sku', 
      'merchant-sku',
      'sellersku'
    )
    
    if (!sku) continue
    
    try {
      // Process order if not already done
      if (!processedOrders.has(orderId)) {
        processedOrders.add(orderId)
        
        const purchaseDate = safeDate(getField(row, 
          'purchase-date', 
          'order-date',
          'purchasedate',
          'payments-date'
        )) || new Date()
        
        const existing = await prisma.order.findUnique({ where: { id: orderId } })
        
        await prisma.order.upsert({
          where: { id: orderId },
          update: {
            status: getField(row, 'order-status', 'status', 'orderstatus') || 'Shipped',
            fulfillmentChannel: getField(row, 'fulfillment-channel', 'fulfillmentchannel') || 'Amazon',
            salesChannel: getField(row, 'sales-channel', 'saleschannel') || 'Amazon.com',
            orderType: getField(row, 'order-type', 'ordertype') || null,
            shipCity: getField(row, 'ship-city', 'city', 'recipient-city') || '',
            shipState: getField(row, 'ship-state', 'state', 'recipient-state') || '',
            shipPostalCode: getField(row, 'ship-postal-code', 'postal-code', 'recipient-postal-code') || '',
            shipCountry: getField(row, 'ship-country', 'country', 'recipient-country') || '',
          },
          create: {
            id: orderId,
            purchaseDate,
            status: getField(row, 'order-status', 'status', 'orderstatus') || 'Shipped',
            fulfillmentChannel: getField(row, 'fulfillment-channel', 'fulfillmentchannel') || 'Amazon',
            salesChannel: getField(row, 'sales-channel', 'saleschannel') || 'Amazon.com',
            orderType: getField(row, 'order-type', 'ordertype') || null,
            shipCity: getField(row, 'ship-city', 'city', 'recipient-city') || '',
            shipState: getField(row, 'ship-state', 'state', 'recipient-state') || '',
            shipPostalCode: getField(row, 'ship-postal-code', 'postal-code', 'recipient-postal-code') || '',
            shipCountry: getField(row, 'ship-country', 'country', 'recipient-country') || '',
          },
        })
        
        if (existing) {
          ordersUpdated++
        } else {
          ordersCreated++
        }
      }
      
      // Ensure product exists - create placeholder if not
      let product = await prisma.product.findUnique({ where: { sku } })
      if (!product) {
        try {
          product = await prisma.product.create({
  data: {
    sku: sku,
    title: getField(row, 'product-name', 'title', 'item-name') || `[Historical] ${sku}`,
    asin: getField(row, 'asin') || null,
    status: 'inactive',
    cost: 0,
    price: 0,
  },
})
          productsCreated++
          if (productsCreated <= 10 || productsCreated % 100 === 0) {
            console.log(`    Created placeholder product: ${sku} (${productsCreated} total)`)
          }
        } catch (createErr: any) {
          product = await prisma.product.findUnique({ where: { sku } })
          if (!product) continue
        }
      }
      
      // Parse prices with fallbacks for different column names
      const quantity = safeInt(getField(row, 'quantity', 'quantity-shipped', 'qty')) || 1
      const itemPrice = safeFloat(getField(row, 'item-price', 'price', 'principal', 'product-sales'))
      const itemTax = safeFloat(getField(row, 'item-tax', 'tax', 'product-tax', 'product-sales-tax'))
      const shippingPrice = safeFloat(getField(row, 'shipping-price', 'shipping', 'shipping-credits'))
      const shippingTax = safeFloat(getField(row, 'shipping-tax', 'shipping-credits-tax'))
      const giftWrapPrice = safeFloat(getField(row, 'gift-wrap-price', 'giftwrap', 'gift-wrap-credits'))
      const giftWrapTax = safeFloat(getField(row, 'gift-wrap-tax', 'gift-wrap-credits-tax'))
      const promoDiscount = Math.abs(safeFloat(getField(row, 'item-promotion-discount', 'promotion-discount', 'promotional-rebates')))
      const shipPromoDiscount = Math.abs(safeFloat(getField(row, 'ship-promotion-discount', 'shipping-promotion-discount')))
      const grossRevenue = itemPrice + shippingPrice + giftWrapPrice
      
      // Fees from report (if available)
      const referralFee = Math.abs(safeFloat(getField(row, 'selling-fees', 'referral-fee', 'commission')))
      const fbaFee = Math.abs(safeFloat(getField(row, 'fba-fees', 'fulfillment-fee', 'fba-per-unit-fulfillment-fee')))
      const otherFees = Math.abs(safeFloat(getField(row, 'other-transaction-fees', 'other-fees', 'other')))
      const totalFees = referralFee + fbaFee + otherFees
      
      await prisma.orderItem.upsert({
        where: {
          orderId_masterSku: { orderId, masterSku: sku },
        },
        update: {
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
          referralFee,
          fbaFee,
          otherFees,
          amazonFees: totalFees,
          asin: getField(row, 'asin') || null,
        },
        create: {
          orderId,
          masterSku: sku,
          asin: getField(row, 'asin') || null,
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
          referralFee,
          fbaFee,
          otherFees,
          amazonFees: totalFees,
        },
      })
      itemsCreated++
      
    } catch (error: any) {
      // Continue on error
    }
    
    // Progress logging
    if ((i + 1) % 5000 === 0 || i === orderRows.length - 1) {
      console.log(`  Progress: ${i + 1}/${orderRows.length} rows (${ordersCreated} new orders, ${ordersUpdated} updated, ${itemsCreated} items)`)
    }
  }
  
  console.log(`\n  ✓ Report type used: ${usedReportType}`)
  console.log(`  ✓ Orders: ${ordersCreated} created, ${ordersUpdated} updated (${processedOrders.size} unique)`)
  console.log(`  ✓ Order items: ${itemsCreated} saved`)
  console.log(`  ✓ Placeholder products created: ${productsCreated}`)
  
  return { 
    orders: ordersCreated + ordersUpdated, 
    items: itemsCreated,
    productsCreated,
    reportType: usedReportType 
  }
}

/**
 * ✅ FIXED: Using Financial Events API instead of Settlement Reports
 * Settlement reports can't be created on-demand - they're generated by Amazon.
 * The Financial Events API provides real-time fee data.
 */
async function syncFees(client: any, marketplaceId: string, startDate: Date, endDate: Date) {
  console.log('\n' + '='.repeat(60))
  console.log('💰 PHASE 2: AMAZON FEES (via Financial Events API)')
  console.log(`   Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
  console.log('='.repeat(60))
  
  let nextToken: string | null = null
  let eventsProcessed = 0
  let feesUpdated = 0
  let ordersWithFees = new Set<string>()
  
  // Financial Events API has a 180-day limit per request
  // Split into chunks if date range is larger
  const maxDaysPerRequest = 180
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  const numChunks = Math.ceil(totalDays / maxDaysPerRequest)
  
  console.log(`  Processing ${totalDays} days in ${numChunks} chunk(s)...`)
  
  for (let chunk = 0; chunk < numChunks; chunk++) {
    const chunkStart = new Date(startDate.getTime() + chunk * maxDaysPerRequest * 24 * 60 * 60 * 1000)
    const chunkEnd = new Date(Math.min(
      chunkStart.getTime() + maxDaysPerRequest * 24 * 60 * 60 * 1000,
      endDate.getTime()
    ))
    
    console.log(`\n  Chunk ${chunk + 1}/${numChunks}: ${chunkStart.toISOString().split('T')[0]} to ${chunkEnd.toISOString().split('T')[0]}`)
    
    nextToken = null
    
    do {
      const queryParams: any = {
        PostedAfter: chunkStart.toISOString(),
        PostedBefore: chunkEnd.toISOString(),
        MaxResultsPerPage: 100,
      }
      
      if (nextToken) {
        queryParams.NextToken = nextToken
      }
      
      try {
        const response = await client.callAPI({
          operation: 'listFinancialEvents',
          endpoint: 'finances',
          query: queryParams,
        })
        
        const financialEvents = response?.payload?.FinancialEvents || response?.FinancialEvents || {}
        nextToken = response?.payload?.NextToken || response?.NextToken || null
        
        // Process Shipment Events (main order fees)
        const shipmentEvents = financialEvents.ShipmentEventList || []
        
        for (const event of shipmentEvents) {
          const orderId = event.AmazonOrderId
          if (!orderId) continue
          
          // Process each item in the shipment
          const itemList = event.ShipmentItemList || []
          
          for (const item of itemList) {
            const sku = item.SellerSKU
            if (!sku) continue
            
            // Aggregate fees for this item
            let referralFee = 0
            let fbaFulfillmentFee = 0
            let fbaWeightHandling = 0
            let variableClosingFee = 0
            let otherFees = 0
            
            // Process ItemFeeList
            const itemFees = item.ItemFeeList || []
            for (const fee of itemFees) {
              const feeType = fee.FeeType || ''
              const amount = Math.abs(safeFloat(fee.FeeAmount?.CurrencyAmount))
              
              if (feeType.includes('Commission') || feeType.includes('Referral')) {
                referralFee += amount
              } else if (feeType.includes('FBAPerUnitFulfillment') || feeType.includes('FBAFulfillment')) {
                fbaFulfillmentFee += amount
              } else if (feeType.includes('FBAWeight') || feeType.includes('WeightHandling')) {
                fbaWeightHandling += amount
              } else if (feeType.includes('VariableClosing')) {
                variableClosingFee += amount
              } else if (feeType.includes('Fee')) {
                otherFees += amount
              }
            }
            
            // Process ItemChargeList for revenue
            let itemPrice = 0
            let shippingPrice = 0
            let giftWrapPrice = 0
            let promoDiscount = 0
            
            const itemCharges = item.ItemChargeList || []
            for (const charge of itemCharges) {
              const chargeType = charge.ChargeType || ''
              const amount = safeFloat(charge.ChargeAmount?.CurrencyAmount)
              
              if (chargeType === 'Principal' || chargeType === 'ItemPrice') {
                itemPrice += amount
              } else if (chargeType.includes('Shipping')) {
                shippingPrice += amount
              } else if (chargeType.includes('GiftWrap')) {
                giftWrapPrice += amount
              }
            }
            
            // Process promotions
            const promotionList = item.PromotionList || []
            for (const promo of promotionList) {
              promoDiscount += Math.abs(safeFloat(promo.PromotionAmount?.CurrencyAmount))
            }
            
            const totalFees = referralFee + fbaFulfillmentFee + fbaWeightHandling + variableClosingFee + otherFees
            const grossRevenue = itemPrice + shippingPrice + giftWrapPrice - promoDiscount
            
            // Update order item with fees
            try {
              const result = await prisma.orderItem.updateMany({
                where: { 
                  orderId,
                  masterSku: sku,
                },
                data: {
                  referralFee,
                  fbaFee: fbaFulfillmentFee + fbaWeightHandling,
                  otherFees: variableClosingFee + otherFees,
                  amazonFees: totalFees,
                  itemPrice: itemPrice > 0 ? itemPrice : undefined,
                  shippingPrice: shippingPrice > 0 ? shippingPrice : undefined,
                  giftWrapPrice: giftWrapPrice > 0 ? giftWrapPrice : undefined,
                  promoDiscount: promoDiscount > 0 ? promoDiscount : undefined,
                  grossRevenue: grossRevenue > 0 ? grossRevenue : undefined,
                },
              })
              
              if (result.count > 0) {
                feesUpdated++
                ordersWithFees.add(orderId)
              }
            } catch (e) {
              // Order item might not exist yet - that's OK
            }
            
            eventsProcessed++
          }
        }
        
        // Rate limit
        if (nextToken) {
          await new Promise(r => setTimeout(r, 500))
        }
        
      } catch (error: any) {
        console.log(`  ⚠️ Error fetching financial events: ${error.message}`)
        break
      }
      
    } while (nextToken)
  }
  
  console.log(`\n  ✓ Financial events processed: ${eventsProcessed}`)
  console.log(`  ✓ Order items with fees updated: ${feesUpdated}`)
  console.log(`  ✓ Unique orders with fees: ${ordersWithFees.size}`)
  
  return { 
    processed: feesUpdated,
    eventsProcessed,
    ordersWithFees: ordersWithFees.size 
  }
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

    // Phase 2: Fees (now using Financial Events API)
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
