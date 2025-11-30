// Save this as: app/api/amazon/test-report/route.ts

import { NextResponse } from 'next/server'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'

export async function GET() {
  try {
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json({ error: 'No credentials' }, { status: 400 })
    }

    const client = await createSpApiClient()
    if (!client) {
      return NextResponse.json({ error: 'No client' }, { status: 400 })
    }

    // Test with just 1 month of data
    const startDate = '2024-10-01T00:00:00Z'
    const endDate = '2024-10-31T23:59:59Z'

    const reportTypesToTest = [
      'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
      'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE',
      'GET_XML_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
      'GET_FLAT_FILE_ORDERS_DATA_BY_ORDER_DATE_GENERAL',
    ]

    const results: Record<string, any> = {}

    for (const reportType of reportTypesToTest) {
      console.log(`\nTesting: ${reportType}`)
      
      try {
        const response = await client.callAPI({
          operation: 'createReport',
          endpoint: 'reports',
          body: {
            reportType,
            marketplaceIds: [credentials.marketplaceId],
            dataStartTime: startDate,
            dataEndTime: endDate,
          },
        })

        results[reportType] = {
          success: true,
          reportId: response?.reportId,
          fullResponse: response,
        }
        
        console.log(`  ✓ Success! Report ID: ${response?.reportId}`)
        
        // If one works, we don't need to test the others
        break
        
      } catch (error: any) {
        results[reportType] = {
          success: false,
          error: error.message,
          code: error.code,
          details: error.details || error.response?.data,
        }
        console.log(`  ✗ Failed: ${error.message}`)
      }
      
      // Small delay between attempts
      await new Promise(r => setTimeout(r, 1000))
    }

    return NextResponse.json({
      marketplaceId: credentials.marketplaceId,
      dateRange: { startDate, endDate },
      results,
    }, { status: 200 })

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 })
  }
}
