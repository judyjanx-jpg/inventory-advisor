/**
 * List Recent Reports
 * GET /api/amazon/sync/list-reports
 */

import { NextResponse } from 'next/server'
import { createSpApiClient } from '@/lib/amazon-sp-api'

export async function GET() {
  try {
    const client = await createSpApiClient()
    if (!client) {
      return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
    }

    // Get reports from the last 7 days
    const createdSince = new Date()
    createdSince.setDate(createdSince.getDate() - 7)

    const response = await client.callAPI({
      operation: 'getReports',
      endpoint: 'reports',
      query: {
        reportTypes: [
          'GET_AMAZON_FULFILLED_SHIPMENTS_DATA_GENERAL',
          'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE',
        ].join(','),
        createdSince: createdSince.toISOString(),
        pageSize: 20,
      },
    })

    const reports = response?.reports || []
    
    console.log(`Found ${reports.length} recent reports`)

    return NextResponse.json({
      success: true,
      count: reports.length,
      reports: reports.map((r: any) => ({
        id: r.reportId,
        type: r.reportType,
        status: r.processingStatus,
        documentId: r.reportDocumentId,
        createdAt: r.createdTime,
        startDate: r.dataStartTime,
        endDate: r.dataEndTime,
      })),
    })

  } catch (error: any) {
    console.error('Error listing reports:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

