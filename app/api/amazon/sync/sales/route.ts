import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials, updateSyncStatus, marketplaceToChannel } from '@/lib/amazon-sp-api'

// NOTE: This sync is READ-ONLY. We never push data to Amazon.

async function waitForReport(client: any, reportId: string, maxWaitMinutes = 720): Promise<string | null> {
  // 720 minutes = 12 hours for very large reports
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
  // Fee fields (from settlement/fee reports)
  referralFee: number
  fbaFee: number
  otherFees: number
}

interface SettlementFee {
  orderId: string
  sku: string
  referralFee: number
  fbaFee: number
  otherFees: number
}

function parseSettlementReport(reportContent: string): Map<string, SettlementFee> {
  const feeMap = new Map<string, SettlementFee>()
  const lines = reportContent.split('\n')
  if (lines.length < 2) return feeMap

  const header = lines[0].split('\t').map(h => h.toLowerCase().trim())
  
  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const idx = header.findIndex(h => h === p || h.includes(p))
      if (idx >= 0) return idx
    }
    return -1
  }

  const orderIdIdx = findCol(['order-id', 'amazon-order-id', 'order id'])
  const skuIdx = findCol(['sku', 'seller-sku'])
  const typeIdx = findCol(['amount-type', 'transaction-type', 'type'])
  const descIdx = findCol(['amount-description', 'fee-type', 'description'])
  const amountIdx = findCol(['amount', 'total', 'fee-amount'])

  console.log(`  Settlement columns: orderId=${orderIdIdx}, sku=${skuIdx}, type=${typeIdx}, desc=${descIdx}, amount=${amountIdx}`)

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split('\t')
    const orderId = orderIdIdx >= 0 ? cols[orderIdIdx]?.trim() : ''
    const sku = skuIdx >= 0 ? cols[skuIdx]?.trim() : ''
    const amountType = typeIdx >= 0 ? cols[typeIdx]?.trim().toLowerCase() : ''
    const description = descIdx >= 0 ? cols[descIdx]?.trim().toLowerCase() : ''
    const amount = amountIdx >= 0 ? Math.abs(parseFloat(cols[amountIdx]) || 0) : 0

    if (!orderId || !sku || amount === 0) continue

    const key = `${orderId}|${sku}`
    if (!feeMap.has(key)) {
      feeMap.set(key, { orderId, sku, referralFee: 0, fbaFee: 0, otherFees: 0 })
    }

    const entry = feeMap.get(key)!
    
    // Categorize fees
    if (description.includes('referral') || description.includes('commission')) {
      entry.referralFee += amount
    } else if (description.includes('fba') || description.includes('fulfillment') || 
               description.includes('pick & pack') || description.includes('weight')) {
      entry.fbaFee += amount
    } else if (amountType.includes('fee') || amountType.includes('itemfees') ||
               description.includes('fee') || description.includes('closing')) {
      entry.otherFees += amount
    }
  }

  console.log(`  Parsed fees for ${feeMap.size} order-SKU combinations`)
  return feeMap
}

// ============================================
// RETURNS REPORT PARSING
// ============================================
interface ReturnItem {
  returnId: string
  orderId: string
  sku: string
  returnDate: string
  quantity: number
  reason: string
  disposition: string
  refundAmount: number
  asin: string
  fnsku: string
}

function parseReturnsReport(reportContent: string): ReturnItem[] {
  const lines = reportContent.split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split('\t').map(h => h.toLowerCase().trim())
  
  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const idx = header.findIndex(h => h === p || h.includes(p))
      if (idx >= 0) return idx
    }
    return -1
  }

  const returnIdIdx = findCol(['return-id', 'returnid', 'license-plate-number'])
  const orderIdIdx = findCol(['order-id', 'amazon-order-id'])
  const skuIdx = findCol(['sku', 'seller-sku', 'merchant-sku'])
  const asinIdx = findCol(['asin'])
  const fnskuIdx = findCol(['fnsku'])
  const dateIdx = findCol(['return-date', 'return-request-date'])
  const qtyIdx = findCol(['quantity', 'returned-quantity'])
  const reasonIdx = findCol(['reason', 'return-reason', 'detailed-disposition'])
  const dispositionIdx = findCol(['disposition', 'status'])
  const refundIdx = findCol(['refund', 'refund-amount', 'item-refund'])

  const items: ReturnItem[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split('\t')
    
    const returnId = returnIdIdx >= 0 ? cols[returnIdIdx]?.trim() : `RET-${i}`
    const orderId = orderIdIdx >= 0 ? cols[orderIdIdx]?.trim() : ''
    const sku = skuIdx >= 0 ? cols[skuIdx]?.trim() : ''
    const asin = asinIdx >= 0 ? cols[asinIdx]?.trim() : ''
    const fnsku = fnskuIdx >= 0 ? cols[fnskuIdx]?.trim() : ''
    const returnDate = dateIdx >= 0 ? cols[dateIdx]?.trim() : ''
    const quantity = qtyIdx >= 0 ? parseInt(cols[qtyIdx]) || 1 : 1
    const reason = reasonIdx >= 0 ? cols[reasonIdx]?.trim() : ''
    const disposition = dispositionIdx >= 0 ? cols[dispositionIdx]?.trim() : 'unknown'
    const refundAmount = refundIdx >= 0 ? Math.abs(parseFloat(cols[refundIdx]) || 0) : 0

    if (!sku && !asin) continue

    items.push({
      returnId,
      orderId,
      sku,
      returnDate,
      quantity,
      reason,
      disposition,
      refundAmount,
      asin,
      fnsku
    })
  }

  console.log(`  Parsed ${items.length} returns`)
  return items
}

// ============================================
// REIMBURSEMENTS REPORT PARSING
// ============================================
interface ReimbursementItem {
  reimbursementId: string
  caseId: string
  sku: string
  asin: string
  fnsku: string
  approvalDate: string
  reason: string
  condition: string
  quantity: number
  amountPerUnit: number
  amountTotal: number
  currencyCode: string
}

function parseReimbursementsReport(reportContent: string): ReimbursementItem[] {
  const lines = reportContent.split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split('\t').map(h => h.toLowerCase().trim())
  
  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const idx = header.findIndex(h => h === p || h.includes(p))
      if (idx >= 0) return idx
    }
    return -1
  }

  const reimbIdIdx = findCol(['reimbursement-id', 'reimbursementid'])
  const caseIdIdx = findCol(['case-id', 'caseid'])
  const skuIdx = findCol(['sku', 'seller-sku', 'merchant-sku'])
  const asinIdx = findCol(['asin'])
  const fnskuIdx = findCol(['fnsku'])
  const dateIdx = findCol(['approval-date', 'reimbursement-date'])
  const reasonIdx = findCol(['reason', 'reimbursement-reason'])
  const conditionIdx = findCol(['condition'])
  const qtyIdx = findCol(['quantity', 'quantity-reimbursed-inventory', 'quantity-reimbursed'])
  const amountPerUnitIdx = findCol(['amount-per-unit', 'per-unit-amount'])
  const amountTotalIdx = findCol(['amount-total', 'total-amount', 'amount'])
  const currencyIdx = findCol(['currency', 'currency-code'])

  const items: ReimbursementItem[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split('\t')
    
    const reimbursementId = reimbIdIdx >= 0 ? cols[reimbIdIdx]?.trim() : `REIMB-${i}`
    const caseId = caseIdIdx >= 0 ? cols[caseIdIdx]?.trim() : ''
    const sku = skuIdx >= 0 ? cols[skuIdx]?.trim() : ''
    const asin = asinIdx >= 0 ? cols[asinIdx]?.trim() : ''
    const fnsku = fnskuIdx >= 0 ? cols[fnskuIdx]?.trim() : ''
    const approvalDate = dateIdx >= 0 ? cols[dateIdx]?.trim() : ''
    const reason = reasonIdx >= 0 ? cols[reasonIdx]?.trim() : ''
    const condition = conditionIdx >= 0 ? cols[conditionIdx]?.trim() : ''
    const quantity = qtyIdx >= 0 ? parseInt(cols[qtyIdx]) || 1 : 1
    const amountPerUnit = amountPerUnitIdx >= 0 ? parseFloat(cols[amountPerUnitIdx]) || 0 : 0
    let amountTotal = amountTotalIdx >= 0 ? parseFloat(cols[amountTotalIdx]) || 0 : 0
    const currencyCode = currencyIdx >= 0 ? cols[currencyIdx]?.trim() || 'USD' : 'USD'

    if (!amountTotal && amountPerUnit) {
      amountTotal = amountPerUnit * quantity
    }

    if (amountTotal === 0) continue

    items.push({
      reimbursementId,
      caseId,
      sku,
      asin,
      fnsku,
      approvalDate,
      reason,
      condition,
      quantity,
      amountPerUnit,
      amountTotal,
      currencyCode
    })
  }

  console.log(`  Parsed ${items.length} reimbursements`)
  return items
}

// ============================================
// REMOVAL ORDERS REPORT PARSING
// ============================================
interface RemovalItem {
  removalOrderId: string
  sku: string
  asin: string
  fnsku: string
  requestDate: string
  lastUpdatedDate: string
  orderType: string
  orderStatus: string
  requestedQuantity: number
  cancelledQuantity: number
  disposedQuantity: number
  shippedQuantity: number
  inProcessQuantity: number
  removalFee: number
}

function parseRemovalsReport(reportContent: string): RemovalItem[] {
  const lines = reportContent.split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split('\t').map(h => h.toLowerCase().trim())
  
  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const idx = header.findIndex(h => h === p || h.includes(p))
      if (idx >= 0) return idx
    }
    return -1
  }

  const removalIdIdx = findCol(['order-id', 'removal-order-id'])
  const skuIdx = findCol(['sku', 'seller-sku', 'merchant-sku'])
  const asinIdx = findCol(['asin'])
  const fnskuIdx = findCol(['fnsku'])
  const requestDateIdx = findCol(['request-date', 'order-date'])
  const lastUpdatedIdx = findCol(['last-updated-date', 'last-updated'])
  const orderTypeIdx = findCol(['order-type', 'removal-order-type'])
  const orderStatusIdx = findCol(['order-status', 'status'])
  const requestedQtyIdx = findCol(['requested-quantity', 'requested'])
  const cancelledQtyIdx = findCol(['cancelled-quantity', 'cancelled'])
  const disposedQtyIdx = findCol(['disposed-quantity', 'disposed'])
  const shippedQtyIdx = findCol(['shipped-quantity', 'shipped'])
  const inProcessQtyIdx = findCol(['in-process-quantity', 'in-process'])
  const feeIdx = findCol(['removal-fee', 'fee'])

  const items: RemovalItem[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split('\t')
    
    const removalOrderId = removalIdIdx >= 0 ? cols[removalIdIdx]?.trim() : ''
    const sku = skuIdx >= 0 ? cols[skuIdx]?.trim() : ''
    const asin = asinIdx >= 0 ? cols[asinIdx]?.trim() : ''
    const fnsku = fnskuIdx >= 0 ? cols[fnskuIdx]?.trim() : ''
    const requestDate = requestDateIdx >= 0 ? cols[requestDateIdx]?.trim() : ''
    const lastUpdatedDate = lastUpdatedIdx >= 0 ? cols[lastUpdatedIdx]?.trim() : ''
    const orderType = orderTypeIdx >= 0 ? cols[orderTypeIdx]?.trim() : 'Return'
    const orderStatus = orderStatusIdx >= 0 ? cols[orderStatusIdx]?.trim() : 'Unknown'
    const requestedQuantity = requestedQtyIdx >= 0 ? parseInt(cols[requestedQtyIdx]) || 0 : 0
    const cancelledQuantity = cancelledQtyIdx >= 0 ? parseInt(cols[cancelledQtyIdx]) || 0 : 0
    const disposedQuantity = disposedQtyIdx >= 0 ? parseInt(cols[disposedQtyIdx]) || 0 : 0
    const shippedQuantity = shippedQtyIdx >= 0 ? parseInt(cols[shippedQtyIdx]) || 0 : 0
    const inProcessQuantity = inProcessQtyIdx >= 0 ? parseInt(cols[inProcessQtyIdx]) || 0 : 0
    const removalFee = feeIdx >= 0 ? parseFloat(cols[feeIdx]) || 0 : 0

    if (!removalOrderId) continue

    items.push({
      removalOrderId,
      sku,
      asin,
      fnsku,
      requestDate,
      lastUpdatedDate,
      orderType,
      orderStatus,
      requestedQuantity,
      cancelledQuantity,
      disposedQuantity,
      shippedQuantity,
      inProcessQuantity,
      removalFee
    })
  }

  console.log(`  Parsed ${items.length} removal orders`)
  return items
}

// ============================================
// STORAGE FEES REPORT PARSING
// ============================================
interface StorageFeeItem {
  sku: string
  asin: string
  fnsku: string
  snapshotDate: string
  condition: string
  quantityCharged: number
  inventoryAge: number
  monthlyStorageFee: number
  longTermStorageFee: number
  surcharge: number
  volumeCubicFeet: number
}

function parseStorageFeesReport(reportContent: string): StorageFeeItem[] {
  const lines = reportContent.split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split('\t').map(h => h.toLowerCase().trim())
  
  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const idx = header.findIndex(h => h === p || h.includes(p))
      if (idx >= 0) return idx
    }
    return -1
  }

  const skuIdx = findCol(['sku', 'seller-sku', 'merchant-sku'])
  const asinIdx = findCol(['asin'])
  const fnskuIdx = findCol(['fnsku'])
  const dateIdx = findCol(['snapshot-date', 'month-of-charge', 'date'])
  const conditionIdx = findCol(['condition', 'product-condition'])
  const qtyIdx = findCol(['qty-charged-12-mo-long-term-storage-fee', 'qty', 'quantity'])
  const ageIdx = findCol(['inventory-age', 'age', 'days-of-supply'])
  const monthlyFeeIdx = findCol(['monthly-storage-fee', 'estimated-monthly-storage-fee'])
  const longTermFeeIdx = findCol(['12-mo-long-term-storage-fee', 'long-term-storage-fee', 'aged-inventory-surcharge'])
  const surchargeIdx = findCol(['surcharge', 'storage-surcharge'])
  const volumeIdx = findCol(['volume', 'cubic-feet', 'volume-cubic-feet'])

  const items: StorageFeeItem[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split('\t')
    
    const sku = skuIdx >= 0 ? cols[skuIdx]?.trim() : ''
    const asin = asinIdx >= 0 ? cols[asinIdx]?.trim() : ''
    const fnsku = fnskuIdx >= 0 ? cols[fnskuIdx]?.trim() : ''
    const snapshotDate = dateIdx >= 0 ? cols[dateIdx]?.trim() : new Date().toISOString().split('T')[0]
    const condition = conditionIdx >= 0 ? cols[conditionIdx]?.trim() : 'Sellable'
    const quantityCharged = qtyIdx >= 0 ? parseInt(cols[qtyIdx]) || 0 : 0
    const inventoryAge = ageIdx >= 0 ? parseInt(cols[ageIdx]) || 0 : 0
    const monthlyStorageFee = monthlyFeeIdx >= 0 ? parseFloat(cols[monthlyFeeIdx]) || 0 : 0
    const longTermStorageFee = longTermFeeIdx >= 0 ? parseFloat(cols[longTermFeeIdx]) || 0 : 0
    const surcharge = surchargeIdx >= 0 ? parseFloat(cols[surchargeIdx]) || 0 : 0
    const volumeCubicFeet = volumeIdx >= 0 ? parseFloat(cols[volumeIdx]) || 0 : 0

    if (!sku && !asin && !fnsku) continue

    items.push({
      sku,
      asin,
      fnsku,
      snapshotDate,
      condition,
      quantityCharged,
      inventoryAge,
      monthlyStorageFee,
      longTermStorageFee,
      surcharge,
      volumeCubicFeet
    })
  }

  console.log(`  Parsed ${items.length} storage fee records`)
  return items
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
      promoDiscount: Math.abs(promo), asin,
      referralFee: 0, fbaFee: 0, otherFees: 0 // Will be populated from settlement data
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
    console.log('   Will wait up to 12 hours for report to complete...')

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

    // Fetch settlement/fee data to get Amazon fees
    if (reportSuccess && reportItems.length > 0) {
      console.log('\n💰 Fetching Amazon fee data from settlement reports...')
      
      try {
        // Request settlement report for fee data
        const settlementReportTypes = [
          'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2',
          'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE',
          'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE',
        ]

        let feeMap: Map<string, SettlementFee> = new Map()

        for (const feeReportType of settlementReportTypes) {
          if (feeMap.size > 0) break
          
          console.log(`  Trying fee report: ${feeReportType}`)
          
          try {
            const feeReportResponse = await client.callAPI({
              operation: 'createReport',
              endpoint: 'reports',
              body: {
                reportType: feeReportType,
                marketplaceIds: [credentials.marketplaceId],
                dataStartTime: startDate.toISOString(),
                dataEndTime: endDate.toISOString(),
              },
            })

            const feeReportId = feeReportResponse?.reportId
            if (!feeReportId) {
              console.log(`    No report ID returned`)
              continue
            }

            console.log(`    Fee report ID: ${feeReportId}`)
            
            // Wait for fee report (shorter timeout - 2 hours)
            const feeDocId = await waitForReport(client, feeReportId, 360)
            if (!feeDocId) {
              console.log(`    Fee report completed but no document`)
              continue
            }

            const feeContent = await downloadReport(client, feeDocId)
            console.log(`    Downloaded fee report: ${feeContent.split('\n').length} lines`)
            
            feeMap = parseSettlementReport(feeContent)
            
          } catch (feeErr: any) {
            console.log(`    Fee report ${feeReportType} failed: ${feeErr.message?.substring(0, 80)}`)
          }
        }

        // Merge fee data into order items
        if (feeMap.size > 0) {
          let feesApplied = 0
          for (const item of reportItems) {
            const key = `${item.orderId}|${item.sku}`
            const fees = feeMap.get(key)
            if (fees) {
              item.referralFee = fees.referralFee
              item.fbaFee = fees.fbaFee
              item.otherFees = fees.otherFees
              feesApplied++
            }
          }
          console.log(`  Applied fees to ${feesApplied} order items`)
        } else {
          console.log('  ⚠️ Could not fetch fee data - fees will be estimated later')
        }
        
      } catch (feeError: any) {
        console.log(`  Fee fetch error: ${feeError.message?.substring(0, 100)}`)
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
              // Calculate total Amazon fees
              const totalFees = (item.referralFee || 0) + (item.fbaFee || 0) + (item.otherFees || 0)
              
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
                  amazonFees: totalFees,
                  referralFee: item.referralFee || 0,
                  fbaFee: item.fbaFee || 0,
                  otherFees: item.otherFees || 0,
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

    // ============================================
    // FETCH ADDITIONAL AMAZON DATA
    // ============================================
    
    let returnsCreated = 0
    let reimbursementsCreated = 0
    let removalsCreated = 0
    let storageFeesCreated = 0

    // Build SKU lookup maps for matching by ASIN/FNSKU
    const productsByAsin = new Map<string, string>()
    const productsByFnsku = new Map<string, string>()
    const allProducts = await prisma.product.findMany({
      select: { sku: true, asin: true, fnsku: true }
    })
    for (const p of allProducts) {
      if (p.asin) productsByAsin.set(p.asin, p.sku)
      if (p.fnsku) productsByFnsku.set(p.fnsku, p.sku)
    }

    // Helper to find SKU from various identifiers
    const findSku = (sku: string, asin: string, fnsku: string): string | null => {
      if (sku && existingSkuSet.has(sku)) return sku
      if (asin && productsByAsin.has(asin)) return productsByAsin.get(asin)!
      if (fnsku && productsByFnsku.has(fnsku)) return productsByFnsku.get(fnsku)!
      return null
    }

    // ============================================
    // 1. RETURNS REPORT
    // ============================================
    console.log('\n📦 Fetching returns data...')
    
    try {
      const returnsReportTypes = [
        'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
        'GET_FBA_CUSTOMER_RETURNS_DATA',
      ]

      for (const reportType of returnsReportTypes) {
        console.log(`  Trying: ${reportType}`)
        try {
          const reportResponse = await client.callAPI({
            operation: 'createReport',
            endpoint: 'reports',
            body: {
              reportType,
              marketplaceIds: [credentials.marketplaceId],
              dataStartTime: startDate.toISOString(),
              dataEndTime: endDate.toISOString(),
            },
          })

          const reportId = reportResponse?.reportId
          if (!reportId) continue

          console.log(`    Report ID: ${reportId}`)
          const docId = await waitForReport(client, reportId, 360) // 6 hour timeout
          if (!docId) continue

          const content = await downloadReport(client, docId)
          const returns = parseReturnsReport(content)

          // Save returns
          for (const ret of returns) {
            const masterSku = findSku(ret.sku, ret.asin, ret.fnsku)
            if (!masterSku) continue

            try {
              await prisma.return.upsert({
                where: { returnId: ret.returnId },
                update: {},
                create: {
                  returnId: ret.returnId,
                  orderId: ret.orderId || 'UNKNOWN',
                  masterSku,
                  returnDate: new Date(ret.returnDate || new Date()),
                  quantity: ret.quantity,
                  reason: ret.reason || null,
                  disposition: ret.disposition || 'unknown',
                  refundAmount: ret.refundAmount,
                },
              })
              returnsCreated++
            } catch (e) {
              // Skip duplicates or FK errors
            }
          }

          if (returns.length > 0) break // Got data, stop trying other report types
        } catch (e: any) {
          console.log(`    Failed: ${e.message?.substring(0, 60)}`)
        }
      }
    } catch (e: any) {
      console.log(`  Returns fetch failed: ${e.message?.substring(0, 60)}`)
    }
    console.log(`  Saved ${returnsCreated} returns`)

    // ============================================
    // 2. REIMBURSEMENTS REPORT
    // ============================================
    console.log('\n💵 Fetching reimbursements data...')
    
    try {
      const reimbReportTypes = [
        'GET_FBA_REIMBURSEMENTS_DATA',
      ]

      for (const reportType of reimbReportTypes) {
        console.log(`  Trying: ${reportType}`)
        try {
          const reportResponse = await client.callAPI({
            operation: 'createReport',
            endpoint: 'reports',
            body: {
              reportType,
              marketplaceIds: [credentials.marketplaceId],
              dataStartTime: startDate.toISOString(),
              dataEndTime: endDate.toISOString(),
            },
          })

          const reportId = reportResponse?.reportId
          if (!reportId) continue

          console.log(`    Report ID: ${reportId}`)
          const docId = await waitForReport(client, reportId, 360)
          if (!docId) continue

          const content = await downloadReport(client, docId)
          const reimbursements = parseReimbursementsReport(content)

          // Save reimbursements
          for (const reimb of reimbursements) {
            const masterSku = findSku(reimb.sku, reimb.asin, reimb.fnsku)

            try {
              await prisma.reimbursement.upsert({
                where: { reimbursementId: reimb.reimbursementId },
                update: {},
                create: {
                  reimbursementId: reimb.reimbursementId,
                  caseId: reimb.caseId || null,
                  masterSku: masterSku || null,
                  approvalDate: new Date(reimb.approvalDate || new Date()),
                  reason: reimb.reason || null,
                  condition: reimb.condition || null,
                  quantity: reimb.quantity,
                  amountPerUnit: reimb.amountPerUnit,
                  amountTotal: reimb.amountTotal,
                  currencyCode: reimb.currencyCode,
                  asin: reimb.asin || null,
                  fnsku: reimb.fnsku || null,
                },
              })
              reimbursementsCreated++
            } catch (e) {
              // Skip duplicates
            }
          }

          if (reimbursements.length > 0) break
        } catch (e: any) {
          console.log(`    Failed: ${e.message?.substring(0, 60)}`)
        }
      }
    } catch (e: any) {
      console.log(`  Reimbursements fetch failed: ${e.message?.substring(0, 60)}`)
    }
    console.log(`  Saved ${reimbursementsCreated} reimbursements`)

    // ============================================
    // 3. REMOVAL ORDERS REPORT
    // ============================================
    console.log('\n🚚 Fetching removal orders data...')
    
    try {
      const removalReportTypes = [
        'GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA',
        'GET_FBA_REMOVAL_ORDER_DETAIL_DATA',
      ]

      for (const reportType of removalReportTypes) {
        console.log(`  Trying: ${reportType}`)
        try {
          const reportResponse = await client.callAPI({
            operation: 'createReport',
            endpoint: 'reports',
            body: {
              reportType,
              marketplaceIds: [credentials.marketplaceId],
              dataStartTime: startDate.toISOString(),
              dataEndTime: endDate.toISOString(),
            },
          })

          const reportId = reportResponse?.reportId
          if (!reportId) continue

          console.log(`    Report ID: ${reportId}`)
          const docId = await waitForReport(client, reportId, 360)
          if (!docId) continue

          const content = await downloadReport(client, docId)
          const removals = parseRemovalsReport(content)

          // Save removals
          for (const rem of removals) {
            const masterSku = findSku(rem.sku, rem.asin, rem.fnsku)

            try {
              await prisma.removalOrder.upsert({
                where: { removalOrderId: rem.removalOrderId },
                update: {
                  orderStatus: rem.orderStatus,
                  cancelledQuantity: rem.cancelledQuantity,
                  disposedQuantity: rem.disposedQuantity,
                  shippedQuantity: rem.shippedQuantity,
                  inProcessQuantity: rem.inProcessQuantity,
                  lastUpdatedDate: rem.lastUpdatedDate ? new Date(rem.lastUpdatedDate) : null,
                },
                create: {
                  removalOrderId: rem.removalOrderId,
                  masterSku: masterSku || null,
                  requestDate: new Date(rem.requestDate || new Date()),
                  lastUpdatedDate: rem.lastUpdatedDate ? new Date(rem.lastUpdatedDate) : null,
                  orderType: rem.orderType || 'Return',
                  orderStatus: rem.orderStatus || 'Unknown',
                  requestedQuantity: rem.requestedQuantity,
                  cancelledQuantity: rem.cancelledQuantity,
                  disposedQuantity: rem.disposedQuantity,
                  shippedQuantity: rem.shippedQuantity,
                  inProcessQuantity: rem.inProcessQuantity,
                  removalFee: rem.removalFee || null,
                  asin: rem.asin || null,
                  fnsku: rem.fnsku || null,
                },
              })
              removalsCreated++
            } catch (e) {
              // Skip duplicates
            }
          }

          if (removals.length > 0) break
        } catch (e: any) {
          console.log(`    Failed: ${e.message?.substring(0, 60)}`)
        }
      }
    } catch (e: any) {
      console.log(`  Removals fetch failed: ${e.message?.substring(0, 60)}`)
    }
    console.log(`  Saved ${removalsCreated} removal orders`)

    // ============================================
    // 4. STORAGE FEES REPORT
    // ============================================
    console.log('\n📊 Fetching storage fees data...')
    
    try {
      const storageReportTypes = [
        'GET_FBA_STORAGE_FEE_CHARGES_DATA',
        'GET_FBA_INVENTORY_AGED_DATA',
      ]

      for (const reportType of storageReportTypes) {
        console.log(`  Trying: ${reportType}`)
        try {
          const reportResponse = await client.callAPI({
            operation: 'createReport',
            endpoint: 'reports',
            body: {
              reportType,
              marketplaceIds: [credentials.marketplaceId],
            },
          })

          const reportId = reportResponse?.reportId
          if (!reportId) continue

          console.log(`    Report ID: ${reportId}`)
          const docId = await waitForReport(client, reportId, 360)
          if (!docId) continue

          const content = await downloadReport(client, docId)
          const storageFees = parseStorageFeesReport(content)

          // Save storage fees
          for (const sf of storageFees) {
            const masterSku = findSku(sf.sku, sf.asin, sf.fnsku)
            if (!masterSku) continue

            try {
              // Parse snapshot date
              let snapshotDate: Date
              try {
                snapshotDate = new Date(sf.snapshotDate)
                if (isNaN(snapshotDate.getTime())) snapshotDate = new Date()
              } catch {
                snapshotDate = new Date()
              }

              await prisma.storageFee.upsert({
                where: {
                  masterSku_snapshotDate: {
                    masterSku,
                    snapshotDate,
                  },
                },
                update: {
                  monthlyStorageFee: sf.monthlyStorageFee,
                  longTermStorageFee: sf.longTermStorageFee,
                  surcharge: sf.surcharge,
                },
                create: {
                  masterSku,
                  snapshotDate,
                  asin: sf.asin || null,
                  fnsku: sf.fnsku || null,
                  condition: sf.condition || 'Sellable',
                  quantityCharged: sf.quantityCharged,
                  inventoryAge: sf.inventoryAge || null,
                  monthlyStorageFee: sf.monthlyStorageFee,
                  longTermStorageFee: sf.longTermStorageFee,
                  surcharge: sf.surcharge,
                  volumeCubicFeet: sf.volumeCubicFeet || null,
                },
              })
              storageFeesCreated++
            } catch (e) {
              // Skip duplicates
            }
          }

          if (storageFees.length > 0) break
        } catch (e: any) {
          console.log(`    Failed: ${e.message?.substring(0, 60)}`)
        }
      }
    } catch (e: any) {
      console.log(`  Storage fees fetch failed: ${e.message?.substring(0, 60)}`)
    }
    console.log(`  Saved ${storageFeesCreated} storage fee records`)

    await updateSyncStatus('success')

    const message = `Synced ${uniqueOrders.size.toLocaleString()} orders with ${reportItems.length.toLocaleString()} line items. Orders: ${ordersCreated} new, ${ordersUpdated} existing. Order items: ${orderItemsCreated}. Daily sales: ${created} new, ${updated} updated. Velocity updated for ${velocityUpdated} products. Additional: ${returnsCreated} returns, ${reimbursementsCreated} reimbursements, ${removalsCreated} removals, ${storageFeesCreated} storage fees.`
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
        returnsCreated,
        reimbursementsCreated,
        removalsCreated,
        storageFeesCreated,
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
