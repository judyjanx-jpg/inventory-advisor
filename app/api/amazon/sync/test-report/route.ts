/**
 * Test Report Endpoint
 * 
 * Tests which Amazon report types are available for your account.
 * GET /api/amazon/sync/test-report?days=30
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

const REPORT_TYPES = [
  { type: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE', name: 'All Orders (by order date)' },
  { type: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE', name: 'All Orders (by last update)' },
  { type: 'GET_FLAT_FILE_ORDERS_DATA_BY_ORDER_DATE', name: 'FBA Orders' },
  { type: 'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL', name: 'FBA Shipments' },
  { type: 'GET_MERCHANT_LISTINGS_ALL_DATA', name: 'All Listings' },
  { type: 'GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA', name: 'FBA Inventory' },
  { type: 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA', name: 'Customer Returns' },
  { type: 'GET_FBA_REIMBURSEMENTS_DATA', name: 'Reimbursements' },
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json({ error: 'Amazon credentials not configured' }, { status: 400 })
    }

    const client = await createSpApiClient()
    if (!client) {
      return NextResponse.json({ error: 'Failed to create SP-API client' }, { status: 500 })
    }

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    console.log(`\n🧪 Testing report types (last ${days} days)...\n`)

    const results = []

    for (const report of REPORT_TYPES) {
      console.log(`Testing: ${report.name}...`)
      
      try {
        const response = await client.callAPI({
          operation: 'createReport',
          endpoint: 'reports',
          body: {
            reportType: report.type,
            marketplaceIds: [credentials.marketplaceId],
            dataStartTime: startDate.toISOString(),
            dataEndTime: endDate.toISOString(),
          },
        })

        const reportId = response?.reportId
        if (reportId) {
          console.log(`  ✅ ${report.name}: Report created (ID: ${reportId})`)
          
          // Cancel it immediately since we're just testing
          try {
            await client.callAPI({
              operation: 'cancelReport',
              endpoint: 'reports',
              path: { reportId },
            })
          } catch (e) {
            // Ignore cancel errors
          }

          results.push({
            type: report.type,
            name: report.name,
            status: 'available',
            reportId,
          })
        } else {
          results.push({
            type: report.type,
            name: report.name,
            status: 'no_id_returned',
          })
        }
      } catch (error: any) {
        console.log(`  ❌ ${report.name}: ${error.message}`)
        results.push({
          type: report.type,
          name: report.name,
          status: 'error',
          error: error.message,
        })
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 500))
    }

    const available = results.filter(r => r.status === 'available')
    const unavailable = results.filter(r => r.status !== 'available')

    console.log(`\n✅ Available: ${available.length}`)
    console.log(`❌ Unavailable: ${unavailable.length}\n`)

    return NextResponse.json({
      success: true,
      daysRequested: days,
      dateRange: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      },
      summary: {
        available: available.length,
        unavailable: unavailable.length,
      },
      available: available.map(r => ({ type: r.type, name: r.name })),
      unavailable: unavailable.map(r => ({ type: r.type, name: r.name, error: r.error })),
      allResults: results,
    })

  } catch (error: any) {
    console.error('Test failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}




