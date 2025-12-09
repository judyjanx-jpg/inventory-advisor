/**
 * Financial Events Sync v2 - Incremental Save Version
 * 
 * Improvements:
 * - Saves to database after each page (no data loss on errors)
 * - Uses 7-day batches to minimize pagination
 * - Handles token expiry gracefully by moving to next batch
 * 
 * POST /api/amazon/sync/financial-events?days=30
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAmazonCredentials } from '@/lib/amazon-sp-api'

const syncStatus = {
  isRunning: false,
  phase: '',
  currentBatch: 0,
  totalBatches: 0,
  pagesProcessed: 0,
  itemsProcessed: 0,
  itemsUpdated: 0,
  refundsProcessed: 0,
  refundsUpdated: 0,
  errors: 0,
  startTime: 0,
  message: '',
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function getAccessToken(credentials: any): Promise<string> {
  const response = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`Token failed: ${response.status}`)
  return (await response.json()).access_token
}

async function callFinancesApi(accessToken: string, path: string): Promise<any> {
  const url = `https://sellingpartnerapi-na.amazon.com${path}`
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-amz-access-token': accessToken,
    },
    signal: AbortSignal.timeout(60000),
  })

  if (response.status === 429) {
    return { rateLimited: true }
  }

  if (!response.ok) {
    const text = await response.text()
    // Check for token expiry
    if (text.includes('TTL exceeded') || text.includes('expired')) {
      return { tokenExpired: true }
    }
    throw new Error(`API ${response.status}: ${text.substring(0, 200)}`)
  }

  return await response.json()
}

function safeFloat(value: any): number {
  if (!value) return 0
  if (typeof value === 'number') return value
  const parsed = parseFloat(String(value).replace(/[,$]/g, ''))
  return isNaN(parsed) ? 0 : parsed
}

// Update database with fees for a batch of items
async function updateFeesInDb(feesByOrderSku: Map<string, { referralFee: number; fbaFee: number; otherFees: number }>) {
  let updated = 0
  const entries = Array.from(feesByOrderSku.entries())

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50)

    await Promise.all(batch.map(async ([key, fees]) => {
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
      } catch {
        // Item not in database
      }
    }))
  }

  return updated
}

// Update returns table with refund amounts from RefundEventList
async function updateRefundsInDb(refundsByOrderSku: Map<string, number>) {
  let updated = 0
  const entries = Array.from(refundsByOrderSku.entries())

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50)

    await Promise.all(batch.map(async ([key, refundAmount]) => {
      const [orderId, sku] = key.split('|')

      try {
        // Update existing return records that don't have refund amount set
        const result = await prisma.return.updateMany({
          where: {
            orderId,
            masterSku: sku,
            refundAmount: 0, // Only update if not already set
          },
          data: {
            refundAmount: refundAmount,
          },
        })
        if (result.count > 0) updated++
      } catch {
        // Return record might not exist
      }
    }))
  }

  return updated
}

export async function GET() {
  return NextResponse.json({
    ...syncStatus,
    description: 'Syncs fees from Financial Events API (incremental save)',
    usage: 'POST /api/amazon/sync/financial-events?days=30',
  })
}

export async function POST(request: NextRequest) {
  if (syncStatus.isRunning) {
    return NextResponse.json({ error: 'Already running' }, { status: 409 })
  }

  const { searchParams } = new URL(request.url)
  const totalDays = parseInt(searchParams.get('days') || '30')
  const batchDays = 7 // Smaller batches = less pagination = less chance of token expiry
  const totalBatches = Math.ceil(totalDays / batchDays)

  // Reset status
  syncStatus.isRunning = true
  syncStatus.phase = 'starting'
  syncStatus.currentBatch = 0
  syncStatus.totalBatches = totalBatches
  syncStatus.pagesProcessed = 0
  syncStatus.itemsProcessed = 0
  syncStatus.itemsUpdated = 0
  syncStatus.refundsProcessed = 0
  syncStatus.refundsUpdated = 0
  syncStatus.errors = 0
  syncStatus.startTime = Date.now()
  syncStatus.message = 'Starting...'

  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      syncStatus.isRunning = false
      return NextResponse.json({ error: 'No credentials' }, { status: 400 })
    }

    console.log('\n' + '='.repeat(60))
    console.log('💰 FINANCIAL EVENTS SYNC v2 (Incremental)')
    console.log(`   ${totalDays} days in ${totalBatches} batches of ${batchDays} days`)
    console.log('='.repeat(60))

    let accessToken = await getAccessToken(credentials)
    let tokenTime = Date.now()

    for (let batch = 1; batch <= totalBatches; batch++) {
      if (!syncStatus.isRunning) break

      syncStatus.currentBatch = batch
      syncStatus.phase = 'fetching'

      // Refresh token if needed (every 25 minutes to be safe)
      if (Date.now() - tokenTime > 25 * 60 * 1000) {
        console.log('   Refreshing token...')
        accessToken = await getAccessToken(credentials)
        tokenTime = Date.now()
      }

      // Calculate date range for this batch
      const endDaysAgo = (batch - 1) * batchDays
      const startDaysAgo = Math.min(batch * batchDays, totalDays)

      const endDate = new Date()
      endDate.setDate(endDate.getDate() - endDaysAgo)
      endDate.setMinutes(endDate.getMinutes() - 5)

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - startDaysAgo)

      console.log(`\n📦 Batch ${batch}/${totalBatches}: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
      syncStatus.message = `Batch ${batch}/${totalBatches}: Fetching...`

      let nextToken: string | null = null
      let batchItems = 0
      let pageCount = 0
      const feesBatch = new Map<string, { referralFee: number; fbaFee: number; otherFees: number }>()
      const refundsBatch = new Map<string, number>() // orderId|sku -> refund amount

      // Fetch all pages for this date range
      do {
        if (!syncStatus.isRunning) break

        pageCount++
        let path = `/finances/v0/financialEvents?PostedAfter=${startDate.toISOString()}&PostedBefore=${endDate.toISOString()}&MaxResultsPerPage=100`
        if (nextToken) {
          path += `&NextToken=${encodeURIComponent(nextToken)}`
        }

        const response = await callFinancesApi(accessToken, path)

        // Handle rate limit
        if (response.rateLimited) {
          console.log(`   ⚠️ Rate limited on page ${pageCount}. Saving ${feesBatch.size} items and ${refundsBatch.size} refunds...`)

          // SAVE what we have so far
          if (feesBatch.size > 0) {
            const updated = await updateFeesInDb(feesBatch)
            syncStatus.itemsUpdated += updated
            console.log(`   ✓ Saved ${updated} fee items to database`)
            feesBatch.clear()
          }
          if (refundsBatch.size > 0) {
            const updated = await updateRefundsInDb(refundsBatch)
            syncStatus.refundsUpdated += updated
            console.log(`   ✓ Saved ${updated} refunds to database`)
            refundsBatch.clear()
          }

          // Wait and retry
          syncStatus.message = `Batch ${batch}: Rate limited, waiting 2 min...`
          await delay(2 * 60 * 1000)

          // Refresh token after wait
          accessToken = await getAccessToken(credentials)
          tokenTime = Date.now()

          // Start this batch over (no nextToken since we saved already)
          nextToken = null
          pageCount = 0
          continue
        }

        // Handle token expiry - move to next batch
        if (response.tokenExpired) {
          console.log(`   ⚠️ Token expired. Saving ${feesBatch.size} items and ${refundsBatch.size} refunds...`)

          if (feesBatch.size > 0) {
            const updated = await updateFeesInDb(feesBatch)
            syncStatus.itemsUpdated += updated
            console.log(`   ✓ Saved ${updated} fee items`)
          }
          if (refundsBatch.size > 0) {
            const updated = await updateRefundsInDb(refundsBatch)
            syncStatus.refundsUpdated += updated
            console.log(`   ✓ Saved ${updated} refunds`)
          }
          
          // Refresh token and move on
          accessToken = await getAccessToken(credentials)
          tokenTime = Date.now()
          break
        }

        const financialEvents = response?.payload?.FinancialEvents || {}
        nextToken = response?.payload?.NextToken || null

        const shipmentEvents = financialEvents.ShipmentEventList || []

        for (const event of shipmentEvents) {
          const orderId = event.AmazonOrderId
          if (!orderId) continue

          for (const item of event.ShipmentItemList || []) {
            const sku = item.SellerSKU
            if (!sku) continue

            let referralFee = 0
            let fbaFee = 0
            let otherFees = 0

            for (const fee of (item.ItemFeeList || [])) {
              const feeType = fee.FeeType || ''
              const amount = Math.abs(safeFloat(fee.FeeAmount?.CurrencyAmount))

              if (feeType.includes('Commission') || feeType.includes('Referral')) {
                referralFee += amount
              } else if (feeType.includes('FBA') || feeType.includes('Fulfillment')) {
                fbaFee += amount
              } else if (amount > 0) {
                otherFees += amount
              }
            }

            if (referralFee > 0 || fbaFee > 0 || otherFees > 0) {
              const key = `${orderId}|${sku}`
              const existing = feesBatch.get(key) || { referralFee: 0, fbaFee: 0, otherFees: 0 }
              feesBatch.set(key, {
                referralFee: existing.referralFee + referralFee,
                fbaFee: existing.fbaFee + fbaFee,
                otherFees: existing.otherFees + otherFees,
              })
              batchItems++
              syncStatus.itemsProcessed++
            }
          }
        }

        // Process RefundEventList to get refund amounts for returns
        const refundEvents = financialEvents.RefundEventList || []
        for (const event of refundEvents) {
          const orderId = event.AmazonOrderId
          if (!orderId) continue

          for (const item of event.ShipmentItemAdjustmentList || []) {
            const sku = item.SellerSKU
            if (!sku) continue

            // Calculate total refund from charge adjustments
            let refundAmount = 0
            for (const charge of (item.ItemChargeAdjustmentList || [])) {
              // Refund amounts are typically negative in the API, we want positive
              const amount = Math.abs(safeFloat(charge.ChargeAmount?.CurrencyAmount))
              refundAmount += amount
            }

            if (refundAmount > 0) {
              const key = `${orderId}|${sku}`
              const existing = refundsBatch.get(key) || 0
              refundsBatch.set(key, existing + refundAmount)
              syncStatus.refundsProcessed++
            }
          }
        }

        syncStatus.pagesProcessed++
        syncStatus.message = `Batch ${batch}/${totalBatches}: Page ${pageCount}, ${feesBatch.size} fees, ${refundsBatch.size} refunds`

        if (pageCount % 10 === 0) {
          console.log(`   Page ${pageCount}: ${feesBatch.size} items`)
        }

        // Small delay between pages
        if (nextToken) {
          await delay(300)
        }

      } while (nextToken && syncStatus.isRunning)

      // Save this batch's fees and refunds to database
      if (feesBatch.size > 0) {
        console.log(`   Saving ${feesBatch.size} fee items to database...`)
        const updated = await updateFeesInDb(feesBatch)
        syncStatus.itemsUpdated += updated
        console.log(`   ✓ Batch ${batch}: ${updated} fee items updated`)
      }
      if (refundsBatch.size > 0) {
        console.log(`   Saving ${refundsBatch.size} refunds to database...`)
        const updated = await updateRefundsInDb(refundsBatch)
        syncStatus.refundsUpdated += updated
        console.log(`   ✓ Batch ${batch}: ${updated} refunds updated`)
      }

      // Wait between batches to avoid rate limits
      if (batch < totalBatches && syncStatus.isRunning) {
        syncStatus.message = `Batch ${batch}/${totalBatches}: ✓ Waiting 30s...`
        await delay(30000)
      }
    }

    const elapsed = ((Date.now() - syncStatus.startTime) / 1000 / 60).toFixed(1)
    syncStatus.phase = 'complete'
    syncStatus.isRunning = false
    syncStatus.message = `✅ Done in ${elapsed} min! ${syncStatus.itemsUpdated} fees, ${syncStatus.refundsUpdated} refunds updated`

    console.log('\n' + '='.repeat(60))
    console.log('✅ SYNC COMPLETE')
    console.log(`   Pages: ${syncStatus.pagesProcessed}`)
    console.log(`   Fee items processed: ${syncStatus.itemsProcessed}`)
    console.log(`   Fee items updated: ${syncStatus.itemsUpdated}`)
    console.log(`   Refunds processed: ${syncStatus.refundsProcessed}`)
    console.log(`   Refunds updated: ${syncStatus.refundsUpdated}`)
    console.log(`   Time: ${elapsed} min`)
    console.log('='.repeat(60))

    await prisma.syncLog.create({
      data: {
        syncType: 'financial-events',
        status: 'success',
        startedAt: new Date(syncStatus.startTime),
        completedAt: new Date(),
        recordsProcessed: syncStatus.itemsProcessed + syncStatus.refundsProcessed,
        recordsUpdated: syncStatus.itemsUpdated + syncStatus.refundsUpdated,
        metadata: {
          days: totalDays,
          pages: syncStatus.pagesProcessed,
          feesUpdated: syncStatus.itemsUpdated,
          refundsUpdated: syncStatus.refundsUpdated,
        },
      },
    })

    return NextResponse.json({
      success: true,
      pagesProcessed: syncStatus.pagesProcessed,
      feesProcessed: syncStatus.itemsProcessed,
      feesUpdated: syncStatus.itemsUpdated,
      refundsProcessed: syncStatus.refundsProcessed,
      refundsUpdated: syncStatus.refundsUpdated,
      elapsed: `${elapsed} min`,
    })

  } catch (error: any) {
    console.error('Sync failed:', error)
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

