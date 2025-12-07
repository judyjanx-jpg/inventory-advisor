/**
 * Returns Sync Endpoint
 *
 * Syncs returns data from Amazon's FBA Returns Report
 * and populates refund amounts from Financial Events API.
 *
 * POST /api/amazon/sync/returns?days=90
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

const syncStatus = {
  isRunning: false,
  phase: '',
  progress: 0,
  returnsProcessed: 0,
  returnsCreated: 0,
  returnsUpdated: 0,
  refundsUpdated: 0,
  message: '',
  startTime: 0,
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function waitForReport(client: any, reportId: string, maxWaitMinutes = 60): Promise<string | null> {
  const maxAttempts = maxWaitMinutes * 2
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts++

    const reportResponse = await client.callAPI({
      operation: 'getReport',
      endpoint: 'reports',
      path: { reportId },
    })

    const status = reportResponse?.processingStatus
    const minutesElapsed = Math.floor(attempts * 0.5)
    console.log(`    Report status: ${status} (${minutesElapsed}/${maxWaitMinutes} minutes)`)
    syncStatus.message = `Waiting for report: ${status} (${minutesElapsed} min)`

    if (status === 'DONE') {
      return reportResponse?.reportDocumentId || null
    }

    if (status === 'CANCELLED' || status === 'FATAL') {
      throw new Error(`Report failed with status: ${status}`)
    }

    await delay(30000)
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
  if (!url) throw new Error('No download URL in report document')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download report: ${response.status}`)

  return await response.text()
}

interface ReturnItem {
  returnId: string
  orderId: string
  sku: string
  returnDate: string
  quantity: number
  reason: string
  disposition: string
  asin: string
  fnsku: string
}

function parseReturnsReport(reportContent: string): ReturnItem[] {
  const lines = reportContent.split('\n')
  if (lines.length < 2) return []

  // Log the actual header for debugging
  console.log(`  Report header: ${lines[0].substring(0, 500)}`)

  const header = lines[0].split('\t').map(h => h.toLowerCase().trim().replace(/-/g, '').replace(/_/g, ''))

  const findCol = (patterns: string[]) => {
    for (const p of patterns) {
      const normalizedPattern = p.toLowerCase().replace(/-/g, '').replace(/_/g, '')
      const idx = header.findIndex(h => h === normalizedPattern || h.includes(normalizedPattern))
      if (idx >= 0) return idx
    }
    return -1
  }

  // More flexible column matching - Amazon uses various naming conventions
  const returnIdIdx = findCol(['returnrequestid', 'returnid', 'licenseplate', 'licenseplatenumber', 'lpn'])
  const orderIdIdx = findCol(['orderid', 'amazonorderid', 'order'])
  const skuIdx = findCol(['sku', 'sellersku', 'merchantsku'])
  const asinIdx = findCol(['asin'])
  const fnskuIdx = findCol(['fnsku'])
  const dateIdx = findCol(['returnrequestdate', 'returndate', 'requestdate', 'date'])
  const qtyIdx = findCol(['quantity', 'returnedquantity', 'qty'])
  const reasonIdx = findCol(['reason', 'returnreason', 'detaileddisposition', 'customercomments'])
  const dispositionIdx = findCol(['disposition', 'status', 'detaileddisposition'])

  console.log(`  Normalized header sample: ${header.slice(0, 10).join(', ')}`)
  console.log(`  Report columns: returnId=${returnIdIdx}, orderId=${orderIdIdx}, sku=${skuIdx}, date=${dateIdx}, fnsku=${fnskuIdx}`)

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

    if (!sku && !asin) continue

    items.push({
      returnId,
      orderId,
      sku,
      returnDate,
      quantity,
      reason,
      disposition,
      asin,
      fnsku
    })
  }

  return items
}

function safeFloat(value: any): number {
  if (!value) return 0
  if (typeof value === 'number') return value
  const parsed = parseFloat(String(value).replace(/[,$]/g, ''))
  return isNaN(parsed) ? 0 : parsed
}

export async function GET() {
  return NextResponse.json({
    ...syncStatus,
    description: 'Syncs returns from Amazon FBA Returns Report and refund amounts from Financial Events',
    usage: 'POST /api/amazon/sync/returns?days=90',
  })
}

export async function POST(request: NextRequest) {
  if (syncStatus.isRunning) {
    return NextResponse.json({ error: 'Already running', status: syncStatus }, { status: 409 })
  }

  const { searchParams } = new URL(request.url)
  const daysBack = parseInt(searchParams.get('days') || '90')

  // Reset status
  syncStatus.isRunning = true
  syncStatus.phase = 'starting'
  syncStatus.progress = 0
  syncStatus.returnsProcessed = 0
  syncStatus.returnsCreated = 0
  syncStatus.returnsUpdated = 0
  syncStatus.refundsUpdated = 0
  syncStatus.startTime = Date.now()
  syncStatus.message = 'Starting...'

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      syncStatus.isRunning = false
      return NextResponse.json({ error: 'No credentials' }, { status: 400 })
    }

    const client = await createSpApiClient()
    if (!client) {
      syncStatus.isRunning = false
      return NextResponse.json({ error: 'Failed to create API client' }, { status: 500 })
    }

    console.log('\n' + '='.repeat(60))
    console.log('📦 RETURNS SYNC')
    console.log(`   ${daysBack} days`)
    console.log('='.repeat(60))

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)
    const endDate = new Date()
    endDate.setMinutes(endDate.getMinutes() - 5) // Amazon requires end date to be at least 2 min in past

    // Build SKU lookup maps
    syncStatus.phase = 'loading products'
    syncStatus.message = 'Loading product catalog...'

    const existingProducts = await prisma.product.findMany({
      select: { sku: true, asin: true, fnsku: true }
    })
    const existingSkuSet = new Set(existingProducts.map(p => p.sku))
    const productsByAsin = new Map<string, string>()
    const productsByFnsku = new Map<string, string>()
    for (const p of existingProducts) {
      if (p.asin) productsByAsin.set(p.asin, p.sku)
      if (p.fnsku) productsByFnsku.set(p.fnsku, p.sku)
    }

    const findSku = (sku: string, asin: string, fnsku: string): string | null => {
      if (sku && existingSkuSet.has(sku)) return sku
      if (asin && productsByAsin.has(asin)) return productsByAsin.get(asin)!
      if (fnsku && productsByFnsku.has(fnsku)) return productsByFnsku.get(fnsku)!
      return null
    }

    // ============================================
    // PHASE 1: Sync returns from report
    // ============================================
    syncStatus.phase = 'fetching returns report'
    syncStatus.message = 'Requesting returns report from Amazon...'

    const reportTypes = [
      'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
      'GET_FBA_CUSTOMER_RETURNS_DATA',
    ]

    for (const reportType of reportTypes) {
      if (!syncStatus.isRunning) break
      console.log(`\n📋 Trying: ${reportType}`)

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
        if (!reportId) {
          console.log('   No report ID returned')
          continue
        }

        console.log(`   Report ID: ${reportId}`)

        const docId = await waitForReport(client, reportId, 60)
        if (!docId) {
          console.log('   Report completed but no document ID')
          continue
        }

        syncStatus.message = 'Downloading returns report...'
        const content = await downloadReport(client, docId)
        const returns = parseReturnsReport(content)
        console.log(`   Parsed ${returns.length} returns`)

        syncStatus.phase = 'saving returns'
        syncStatus.returnsProcessed = returns.length

        // Save returns to database
        for (let i = 0; i < returns.length; i++) {
          if (!syncStatus.isRunning) break
          const ret = returns[i]
          const masterSku = findSku(ret.sku, ret.asin, ret.fnsku)
          if (!masterSku) continue

          try {
            const existingReturn = await prisma.return.findUnique({
              where: { returnId: ret.returnId },
            })

            if (existingReturn) {
              if (!existingReturn.reason && ret.reason) {
                await prisma.return.update({
                  where: { returnId: ret.returnId },
                  data: { reason: ret.reason, disposition: ret.disposition },
                })
                syncStatus.returnsUpdated++
              }
            } else {
              await prisma.return.create({
                data: {
                  returnId: ret.returnId,
                  orderId: ret.orderId || 'UNKNOWN',
                  masterSku,
                  returnDate: new Date(ret.returnDate || new Date()),
                  quantity: ret.quantity,
                  reason: ret.reason || null,
                  disposition: ret.disposition || 'unknown',
                  refundAmount: 0,
                },
              })
              syncStatus.returnsCreated++
            }
          } catch (e) {
            // Skip duplicates
          }

          if ((i + 1) % 100 === 0) {
            syncStatus.progress = Math.floor((i / returns.length) * 50)
            syncStatus.message = `Saving returns: ${i + 1}/${returns.length}`
          }
        }

        console.log(`   ✓ Created ${syncStatus.returnsCreated}, Updated ${syncStatus.returnsUpdated}`)
        if (returns.length > 0) break
      } catch (e: any) {
        console.log(`   Failed: ${e.message?.substring(0, 80)}`)
      }
    }

    // ============================================
    // PHASE 2: Populate refund amounts from Financial Events
    // ============================================
    if (syncStatus.isRunning) {
      syncStatus.phase = 'fetching refund amounts'
      syncStatus.message = 'Fetching refund amounts from Financial Events API...'
      console.log('\n💰 Fetching refund amounts from Financial Events...')

      let nextToken: string | null = null
      let pageCount = 0
      const refundsBatch = new Map<string, number>()

      do {
        if (!syncStatus.isRunning) break
        pageCount++

        let path = `/finances/v0/financialEvents?PostedAfter=${startDate.toISOString()}&PostedBefore=${endDate.toISOString()}&MaxResultsPerPage=100`
        if (nextToken) {
          path += `&NextToken=${encodeURIComponent(nextToken)}`
        }

        const response = await client.callAPI({
          operation: 'listFinancialEvents',
          endpoint: 'finances',
          query: {
            PostedAfter: startDate.toISOString(),
            PostedBefore: endDate.toISOString(),
            MaxResultsPerPage: 100,
            ...(nextToken ? { NextToken: nextToken } : {}),
          },
        })

        const events = response?.payload?.FinancialEvents || response?.FinancialEvents || {}
        nextToken = response?.payload?.NextToken || response?.NextToken || null

        // Process RefundEventList
        for (const event of events.RefundEventList || []) {
          const orderId = event.AmazonOrderId
          if (!orderId) continue

          for (const item of event.ShipmentItemAdjustmentList || []) {
            const sku = item.SellerSKU
            if (!sku) continue

            let refundAmount = 0
            for (const charge of (item.ItemChargeAdjustmentList || [])) {
              refundAmount += Math.abs(safeFloat(charge.ChargeAmount?.CurrencyAmount))
            }

            if (refundAmount > 0) {
              const key = `${orderId}|${sku}`
              refundsBatch.set(key, (refundsBatch.get(key) || 0) + refundAmount)
            }
          }
        }

        syncStatus.progress = 50 + Math.min(pageCount * 2, 40)
        syncStatus.message = `Fetching refunds: page ${pageCount}, found ${refundsBatch.size} refunds`

        if (nextToken) await delay(300)
      } while (nextToken && syncStatus.isRunning)

      // Update returns with refund amounts
      syncStatus.message = `Updating ${refundsBatch.size} refund amounts...`
      console.log(`   Found ${refundsBatch.size} refund records`)

      for (const [key, refundAmount] of refundsBatch) {
        const [orderId, sku] = key.split('|')
        try {
          const result = await prisma.return.updateMany({
            where: {
              orderId,
              masterSku: sku,
              refundAmount: 0,
            },
            data: { refundAmount },
          })
          if (result.count > 0) syncStatus.refundsUpdated++
        } catch (e) {
          // Skip errors
        }
      }

      console.log(`   ✓ Updated ${syncStatus.refundsUpdated} refund amounts`)
    }

    const elapsed = ((Date.now() - syncStatus.startTime) / 1000 / 60).toFixed(1)
    syncStatus.phase = 'complete'
    syncStatus.progress = 100
    syncStatus.isRunning = false
    syncStatus.message = `✅ Done in ${elapsed} min! ${syncStatus.returnsCreated} returns created, ${syncStatus.refundsUpdated} refunds updated`

    console.log('\n' + '='.repeat(60))
    console.log('✅ RETURNS SYNC COMPLETE')
    console.log(`   Returns created: ${syncStatus.returnsCreated}`)
    console.log(`   Returns updated: ${syncStatus.returnsUpdated}`)
    console.log(`   Refunds updated: ${syncStatus.refundsUpdated}`)
    console.log(`   Time: ${elapsed} min`)
    console.log('='.repeat(60))

    // Log the sync
    await prisma.syncLog.create({
      data: {
        syncType: 'returns',
        status: 'success',
        startedAt: new Date(syncStatus.startTime),
        completedAt: new Date(),
        recordsProcessed: syncStatus.returnsProcessed,
        recordsUpdated: syncStatus.returnsCreated + syncStatus.refundsUpdated,
        metadata: {
          days: daysBack,
          returnsCreated: syncStatus.returnsCreated,
          returnsUpdated: syncStatus.returnsUpdated,
          refundsUpdated: syncStatus.refundsUpdated,
        },
      },
    })

    return NextResponse.json({
      success: true,
      returnsProcessed: syncStatus.returnsProcessed,
      returnsCreated: syncStatus.returnsCreated,
      returnsUpdated: syncStatus.returnsUpdated,
      refundsUpdated: syncStatus.refundsUpdated,
      elapsed: `${elapsed} min`,
    })

  } catch (error: any) {
    console.error('Returns sync failed:', error)
    syncStatus.isRunning = false
    syncStatus.phase = 'error'
    syncStatus.message = `Error: ${error.message}`
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE() {
  syncStatus.isRunning = false
  syncStatus.message = 'Stopped'
  return NextResponse.json({ success: true })
}
