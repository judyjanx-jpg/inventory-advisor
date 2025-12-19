// app/api/amazon-ads/sync/route.ts
// Manually trigger Amazon Ads sync and manage pending reports

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdsCredentials, refreshAccessToken, saveAdsCredentials } from '@/lib/amazon-ads-api'
import { gunzipSync } from 'zlib'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { startOfDay, subDays } from 'date-fns'

const ADS_API_BASE = 'https://advertising-api.amazon.com'

/**
 * Amazon uses PST/PDT (America/Los_Angeles) for day boundaries
 */
const AMAZON_TIMEZONE = 'America/Los_Angeles'

/**
 * Get a fresh access token, refreshing if needed
 */
async function getFreshAccessToken(credentials: {
  refreshToken: string
  accessToken?: string
  accessTokenExpiry?: number
  clientId: string
  clientSecret: string
  profileId?: string
}): Promise<string> {
  const now = Date.now()

  // Check if current token is still valid (with 5 min buffer)
  if (credentials.accessToken && credentials.accessTokenExpiry && credentials.accessTokenExpiry > now + 300000) {
    return credentials.accessToken
  }

  // Refresh the token
  console.log('[ads-sync] Refreshing access token...')
  const { accessToken, expiresIn } = await refreshAccessToken(credentials.refreshToken)

  // Update stored credentials
  credentials.accessToken = accessToken
  credentials.accessTokenExpiry = now + (expiresIn * 1000)
  await saveAdsCredentials(credentials as any)

  console.log('[ads-sync] Token refreshed successfully')
  return accessToken
}

/**
 * Get a date range in UTC that corresponds to PST day boundaries
 */
function getPSTDateRange(daysBack: number): { startDate: Date; endDate: Date } {
  const nowUTC = new Date()
  const nowInPST = toZonedTime(nowUTC, AMAZON_TIMEZONE)
  const startInPST = startOfDay(subDays(nowInPST, daysBack))
  const endInPST = startOfDay(subDays(nowInPST, 1)) // Yesterday in PST

  return {
    startDate: fromZonedTime(startInPST, AMAZON_TIMEZONE),
    endDate: fromZonedTime(endInPST, AMAZON_TIMEZONE),
  }
}

/**
 * Aggregate ad spend data from adProductSpend into advertising_daily
 */
async function aggregateAdsToDaily(startDateStr: string, endDateStr: string) {
  try {
    const { query } = await import('@/lib/db')

    const aggregated = await query<{
      date: string
      total_impressions: string
      total_clicks: string
      total_spend: string
      total_sales14d: string
      total_orders14d: string
      total_units14d: string
    }>(`
      SELECT
        DATE(aps.start_date)::text as date,
        SUM(aps.impressions)::text as total_impressions,
        SUM(aps.clicks)::text as total_clicks,
        SUM(aps.spend)::text as total_spend,
        SUM(aps.sales)::text as total_sales14d,
        SUM(aps.orders)::text as total_orders14d,
        SUM(aps.units)::text as total_units14d
      FROM ad_product_spend aps
      WHERE aps.start_date >= $1::date
        AND aps.start_date <= $2::date
      GROUP BY DATE(aps.start_date)
    `, [startDateStr, endDateStr])

    let updated = 0
    for (const row of aggregated) {
      const spend = parseFloat(row.total_spend || '0')
      const sales14d = parseFloat(row.total_sales14d || '0')
      const impressions = parseInt(row.total_impressions || '0', 10)
      const clicks = parseInt(row.total_clicks || '0', 10)
      const orders14d = parseInt(row.total_orders14d || '0', 10)
      const units14d = parseInt(row.total_units14d || '0', 10)

      await prisma.advertisingDaily.upsert({
        where: {
          date_campaignType: {
            date: new Date(row.date),
            campaignType: 'SP',
          },
        },
        update: {
          impressions,
          clicks,
          spend,
          sales14d: sales14d > 0 ? sales14d : null,
          orders14d: orders14d > 0 ? orders14d : null,
          unitsSold14d: units14d > 0 ? units14d : null,
          acos: sales14d > 0 ? (spend / sales14d) * 100 : null,
          roas: spend > 0 ? sales14d / spend : null,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
          cpc: clicks > 0 ? spend / clicks : null,
          updatedAt: new Date(),
        },
        create: {
          date: new Date(row.date),
          campaignType: 'SP',
          impressions,
          clicks,
          spend,
          sales14d: sales14d > 0 ? sales14d : null,
          orders14d: orders14d > 0 ? orders14d : null,
          unitsSold14d: units14d > 0 ? units14d : null,
          acos: sales14d > 0 ? (spend / sales14d) * 100 : null,
          roas: spend > 0 ? sales14d / spend : null,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
          cpc: clicks > 0 ? spend / clicks : null,
        },
      })
      updated++
    }
    return updated
  } catch (error: any) {
    console.error('Failed to aggregate to advertising_daily:', error.message)
    return 0
  }
}

// GET: Check sync status and pending reports
export async function GET() {
  try {
    const credentials = await getAdsCredentials()
    
    const pendingReports = await prisma.adsPendingReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    const campaignStats = await prisma.adCampaign.aggregate({
      _count: true,
      _sum: {
        spend: true,
        sales14d: true,
        impressions: true,
        clicks: true,
      },
    })

    const lastSync = await prisma.syncLog.findFirst({
      where: { syncType: 'scheduled-ads-reports' },
      orderBy: { completedAt: 'desc' },
    })

    return NextResponse.json({
      connected: !!credentials?.profileId,
      profileId: credentials?.profileId,
      pendingReports: pendingReports.map((r: any) => ({
        id: r.id,
        reportId: r.reportId,
        status: r.status,
        reportType: r.reportType,
        dateRange: r.dateRange,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      })),
      campaignStats: {
        totalCampaigns: campaignStats._count,
        totalSpend: campaignStats._sum.spend,
        totalSales: campaignStats._sum.sales14d,
        totalImpressions: campaignStats._sum.impressions,
        totalClicks: campaignStats._sum.clicks,
      },
      lastSync: lastSync ? {
        status: lastSync.status,
        completedAt: lastSync.completedAt,
        metadata: lastSync.metadata,
      } : null,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Request a new report and/or check pending ones
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || 'sync' // 'sync', 'request', 'check', 'seed', 'clear'

    const credentials = await getAdsCredentials()
    if (!credentials?.profileId || !credentials.refreshToken) {
      return NextResponse.json({ error: 'Not connected to Amazon Ads' }, { status: 400 })
    }

    // Get a fresh access token (refreshes if expired)
    const accessToken = await getFreshAccessToken(credentials as any)

    const profileId = credentials.profileId
    const results: any = { action }

    // Action: Seed existing report IDs into tracking table
    if (action === 'seed' && body.reportIds) {
      const reportIds = body.reportIds as string[]
      let seeded = 0
      for (const reportId of reportIds) {
        const existing = await prisma.adsPendingReport.findUnique({ where: { reportId } })
        if (!existing) {
          await prisma.adsPendingReport.create({
            data: {
              reportId,
              profileId,
              reportType: 'SP_CAMPAIGNS',
              status: 'PENDING',
            },
          })
          seeded++
        }
      }
      results.seeded = seeded
    }

    // Action: Clear stuck pending reports (older than specified hours)
    if (action === 'clear') {
      const hoursOld = body.hoursOld || 24 // Default to 24 hours
      const cutoffDate = new Date(Date.now() - hoursOld * 60 * 60 * 1000)

      const stuckReports = await prisma.adsPendingReport.updateMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: cutoffDate },
        },
        data: {
          status: 'FAILED',
          failureReason: `Marked as failed - stuck pending for over ${hoursOld} hours`,
        },
      })

      results.cleared = stuckReports.count
      results.message = `Cleared ${stuckReports.count} stuck reports older than ${hoursOld} hours`
    }

    // Action: Check all pending reports
    if (action === 'sync' || action === 'check') {
      const pendingReports = await prisma.adsPendingReport.findMany({
        where: { status: 'PENDING' },
      })

      results.checked = 0
      results.completed = 0
      results.campaignsUpdated = 0
      results.productsUpdated = 0

      for (const report of pendingReports) {
        results.checked++

        const statusResponse = await fetch(`${ADS_API_BASE}/reporting/reports/${report.reportId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
            'Amazon-Advertising-API-Scope': profileId,
            'Accept': 'application/json',
          },
        })

        if (!statusResponse.ok) {
          // Track failed status checks for debugging
          if (!results.statusCheckErrors) results.statusCheckErrors = []
          const errorBody = await statusResponse.text().catch(() => 'Unable to read body')
          results.statusCheckErrors.push({
            reportId: report.reportId,
            status: statusResponse.status,
            error: errorBody.substring(0, 200), // Truncate long errors
          })

          // If 404, the report doesn't exist on Amazon anymore - mark as failed
          if (statusResponse.status === 404) {
            await prisma.adsPendingReport.update({
              where: { id: report.id },
              data: { status: 'FAILED', failureReason: 'Report not found (404) - may have expired' },
            })
          }
          continue
        }

        const status = await statusResponse.json()

        // Track the actual status from Amazon for debugging
        if (!results.reportStatuses) results.reportStatuses = []
        results.reportStatuses.push({
          reportId: report.reportId,
          amazonStatus: status.status,
          hasUrl: !!status.url,
        })

        // Handle FAILED reports from Amazon
        if (status.status === 'FAILED') {
          await prisma.adsPendingReport.update({
            where: { id: report.id },
            data: {
              status: 'FAILED',
              failureReason: status.failureReason || 'Report failed on Amazon side',
            },
          })
          continue
        }

        // Handle EXPIRED reports
        if (status.status === 'EXPIRED') {
          await prisma.adsPendingReport.update({
            where: { id: report.id },
            data: {
              status: 'FAILED',
              failureReason: 'Report expired on Amazon side',
            },
          })
          continue
        }

        if (status.status === 'COMPLETED' && status.url) {
          // Download and store
          const downloadResponse = await fetch(status.url)
          const gzipBuffer = await downloadResponse.arrayBuffer()
          const jsonBuffer = gunzipSync(Buffer.from(gzipBuffer))
          const data = JSON.parse(jsonBuffer.toString('utf-8'))

          // Parse date range from report - handle both "date" and "date to date" formats
          let startDateStr: string
          let endDateStr: string
          if (report.dateRange?.includes(' to ')) {
            const dateRangeParts = report.dateRange.split(' to ')
            startDateStr = dateRangeParts[0]
            endDateStr = dateRangeParts[1]
          } else {
            // Single date format (legacy) - use same date for start and end
            startDateStr = report.dateRange || new Date().toISOString().split('T')[0]
            endDateStr = startDateStr
          }

          if (Array.isArray(data)) {
            // Handle based on report type
            if (report.reportType === 'SP_PRODUCTS') {
              // Product-level report - store in AdProductSpend
              for (const item of data) {
                const asin = item.advertisedAsin
                if (!asin) continue

                const spend = parseFloat(item.spend) || 0
                const sales = parseFloat(item.sales14d) || 0

                await prisma.adProductSpend.upsert({
                  where: {
                    asin_startDate_endDate: {
                      asin,
                      startDate: new Date(startDateStr),
                      endDate: new Date(endDateStr),
                    },
                  },
                  update: {
                    sku: item.advertisedSku || null,
                    impressions: item.impressions || 0,
                    clicks: item.clicks || 0,
                    spend,
                    sales,
                    orders: item.purchases14d || 0,
                    units: item.unitsSoldClicks14d || 0,
                    acos: sales > 0 ? (spend / sales) * 100 : null,
                    updatedAt: new Date(),
                  },
                  create: {
                    asin,
                    sku: item.advertisedSku || null,
                    startDate: new Date(startDateStr),
                    endDate: new Date(endDateStr),
                    impressions: item.impressions || 0,
                    clicks: item.clicks || 0,
                    spend,
                    sales,
                    orders: item.purchases14d || 0,
                    units: item.unitsSoldClicks14d || 0,
                    acos: sales > 0 ? (spend / sales) * 100 : null,
                  },
                })
                results.productsUpdated++
              }
            } else {
              // Campaign-level report - store in AdCampaign AND aggregate totals to advertising_daily
              // This captures the FULL ad spend (not just product-attributed spend)
              let totalSpend = 0
              let totalImpressions = 0
              let totalClicks = 0
              let totalSales14d = 0
              let totalOrders14d = 0
              let totalUnits14d = 0

              for (const campaign of data) {
                const campaignId = campaign.campaignId?.toString()
                if (!campaignId) continue

                const spend = parseFloat(campaign.cost) || 0
                const sales = parseFloat(campaign.sales14d) || 0

                totalSpend += spend
                totalImpressions += campaign.impressions || 0
                totalClicks += campaign.clicks || 0
                totalSales14d += sales
                totalOrders14d += campaign.purchases14d || 0
                totalUnits14d += campaign.unitsSoldClicks14d || 0

                await prisma.adCampaign.upsert({
                  where: { campaignId },
                  update: {
                    campaignName: campaign.campaignName || 'Unknown',
                    campaignStatus: campaign.campaignStatus || 'UNKNOWN',
                    campaignType: 'SP',
                    budgetAmount: parseFloat(campaign.campaignBudgetAmount) || 0,
                    budgetType: campaign.campaignBudgetType || 'DAILY',
                    impressions: campaign.impressions || 0,
                    clicks: campaign.clicks || 0,
                    spend,
                    sales14d: sales,
                    orders14d: campaign.purchases14d || 0,
                    units14d: campaign.unitsSoldClicks14d || 0,
                    acos: sales > 0 ? (spend / sales) * 100 : null,
                    roas: spend > 0 ? sales / spend : null,
                    lastSyncedAt: new Date(),
                  },
                  create: {
                    campaignId,
                    campaignName: campaign.campaignName || 'Unknown',
                    campaignStatus: campaign.campaignStatus || 'UNKNOWN',
                    campaignType: 'SP',
                    budgetAmount: parseFloat(campaign.campaignBudgetAmount) || 0,
                    budgetType: campaign.campaignBudgetType || 'DAILY',
                    impressions: campaign.impressions || 0,
                    clicks: campaign.clicks || 0,
                    spend,
                    sales14d: sales,
                    orders14d: campaign.purchases14d || 0,
                    units14d: campaign.unitsSoldClicks14d || 0,
                    acos: sales > 0 ? (spend / sales) * 100 : null,
                    roas: spend > 0 ? sales / spend : null,
                    lastSyncedAt: new Date(),
                  },
                })
                results.campaignsUpdated++
              }

              // Store TOTAL campaign spend in advertising_daily (this is the accurate total)
              if (totalSpend > 0) {
                const acos = totalSales14d > 0 ? (totalSpend / totalSales14d) * 100 : null
                const roas = totalSpend > 0 ? totalSales14d / totalSpend : null
                const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null
                const cpc = totalClicks > 0 ? totalSpend / totalClicks : null

                await prisma.advertisingDaily.upsert({
                  where: {
                    date_campaignType: {
                      date: new Date(startDateStr),
                      campaignType: 'SP',
                    },
                  },
                  update: {
                    impressions: totalImpressions,
                    clicks: totalClicks,
                    spend: totalSpend,
                    sales14d: totalSales14d > 0 ? totalSales14d : null,
                    orders14d: totalOrders14d > 0 ? totalOrders14d : null,
                    unitsSold14d: totalUnits14d > 0 ? totalUnits14d : null,
                    acos,
                    roas,
                    ctr,
                    cpc,
                    updatedAt: new Date(),
                  },
                  create: {
                    date: new Date(startDateStr),
                    campaignType: 'SP',
                    impressions: totalImpressions,
                    clicks: totalClicks,
                    spend: totalSpend,
                    sales14d: totalSales14d > 0 ? totalSales14d : null,
                    orders14d: totalOrders14d > 0 ? totalOrders14d : null,
                    unitsSold14d: totalUnits14d > 0 ? totalUnits14d : null,
                    acos,
                    roas,
                    ctr,
                    cpc,
                  },
                })
                results.dailyTotalSpend = (results.dailyTotalSpend || 0) + totalSpend
              }
            }
          }

          await prisma.adsPendingReport.update({
            where: { id: report.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          })
          results.completed++

          // Aggregate to advertising_daily after processing product reports (for product-level detail)
          if (report.reportType === 'SP_PRODUCTS') {
            const dailyUpdated = await aggregateAdsToDaily(startDateStr, endDateStr)
            results.dailyAggregated = (results.dailyAggregated || 0) + dailyUpdated
          }

        } else if (status.status === 'FAILED') {
          await prisma.adsPendingReport.update({
            where: { id: report.id },
            data: { status: 'FAILED', failureReason: status.failureReason },
          })
        }
      }
    }

    // Action: Request new reports (campaign + product level)
    if (action === 'sync' || action === 'request') {
      const days = body.days || 1
      // Use PST day boundaries for ads reports
      const { startDate, endDate } = getPSTDateRange(days)

      // Format dates in PST for the report request
      const startDateStr = toZonedTime(startDate, AMAZON_TIMEZONE).toISOString().split('T')[0]
      const endDateStr = toZonedTime(endDate, AMAZON_TIMEZONE).toISOString().split('T')[0]

      // Request campaign-level report
      const campaignReportConfig = {
        name: `Sync_SP_Campaign_${Date.now()}`,
        startDate: startDateStr,
        endDate: endDateStr,
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          groupBy: ['campaign'],
          columns: [
            'campaignName',
            'campaignId',
            'campaignStatus',
            'campaignBudgetAmount',
            'campaignBudgetType',
            'impressions',
            'clicks',
            'cost',
            'purchases14d',
            'sales14d',
            'unitsSoldClicks14d',
          ],
          reportTypeId: 'spCampaigns',
          timeUnit: 'SUMMARY',
          format: 'GZIP_JSON',
        },
      }

      // Request product-level report (for profit calculation)
      const productReportConfig = {
        name: `Sync_SP_Product_${Date.now()}`,
        startDate: startDateStr,
        endDate: endDateStr,
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          groupBy: ['advertiser'],
          columns: [
            'advertisedAsin',
            'advertisedSku',
            'impressions',
            'clicks',
            'spend',
            'sales14d',
            'purchases14d',
            'unitsSoldClicks14d',
          ],
          reportTypeId: 'spAdvertisedProduct',
          timeUnit: 'SUMMARY',
          format: 'GZIP_JSON',
        },
      }

      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Amazon-Advertising-API-ClientId': process.env.AMAZON_ADS_CLIENT_ID!,
        'Amazon-Advertising-API-Scope': profileId,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.createasyncreport.v3+json',
      }

      // Request campaign report
      const campaignResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify(campaignReportConfig),
      })

      const campaignResponseText = await campaignResponse.text()
      let campaignReportId: string | null = null

      if (campaignResponse.status === 425) {
        const match = campaignResponseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
        if (match) campaignReportId = match[1]
        results.campaignReportDuplicate = true
      } else if (campaignResponse.ok) {
        const data = JSON.parse(campaignResponseText)
        campaignReportId = data.reportId
      }

      if (campaignReportId) {
        const existing = await prisma.adsPendingReport.findUnique({ where: { reportId: campaignReportId } })
        if (!existing) {
          await prisma.adsPendingReport.create({
            data: {
              reportId: campaignReportId,
              profileId,
              reportType: 'SP_CAMPAIGNS',
              status: 'PENDING',
              dateRange: `${startDateStr} to ${endDateStr}`,
            },
          })
        }
        results.campaignReportId = campaignReportId
      }

      // Request product report
      const productResponse = await fetch(`${ADS_API_BASE}/reporting/reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify(productReportConfig),
      })

      const productResponseText = await productResponse.text()
      let productReportId: string | null = null

      if (productResponse.status === 425) {
        const match = productResponseText.match(/duplicate of\s*:\s*([a-f0-9-]+)/i)
        if (match) productReportId = match[1]
        results.productReportDuplicate = true
      } else if (productResponse.ok) {
        const data = JSON.parse(productResponseText)
        productReportId = data.reportId
      }

      if (productReportId) {
        const existing = await prisma.adsPendingReport.findUnique({ where: { reportId: productReportId } })
        if (!existing) {
          await prisma.adsPendingReport.create({
            data: {
              reportId: productReportId,
              profileId,
              reportType: 'SP_PRODUCTS',
              status: 'PENDING',
              dateRange: `${startDateStr} to ${endDateStr}`,
            },
          })
        }
        results.productReportId = productReportId
      }

      results.dateRange = `${startDateStr} to ${endDateStr}`
    }

    return NextResponse.json(results)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
