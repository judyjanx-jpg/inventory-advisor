// app/api/profit/products/route.ts
// Returns product-level profit data for the selected period

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getQuickFeeEstimate } from '@/lib/fee-estimation'
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  subMonths
} from 'date-fns'

export const dynamic = 'force-dynamic'

interface ProductProfit {
  id: string
  sku: string
  asin: string
  parentAsin?: string
  title: string
  imageUrl?: string
  brand?: string
  supplier?: string
  channel?: string
  unitsSold: number
  refunds: number
  refundRate: number
  sales: number
  adSpend: number
  cogs: number
  cogsTotal: number
  amazonFees: number
  amazonFeesEstimated: number  // Portion that was estimated
  netProfit: number
  margin: number
  roi: number
  realAcos: number | null
  sessions: number
  unitSessionPct: number
  bsr?: number
  bsrChange?: number
}

function getDateRange(period: string): { startDate: Date; endDate: Date } {
  const now = new Date()
  
  switch (period) {
    case 'today':
      return { startDate: startOfDay(now), endDate: endOfDay(now) }
    case 'yesterday':
      return { startDate: startOfDay(subDays(now, 1)), endDate: endOfDay(subDays(now, 1)) }
    case 'mtd':
    case 'forecast':
      return { startDate: startOfMonth(now), endDate: endOfDay(now) }
    case 'lastMonth':
      return { startDate: startOfMonth(subMonths(now, 1)), endDate: endOfMonth(subMonths(now, 1)) }
    default:
      return { startDate: startOfDay(subDays(now, 1)), endDate: endOfDay(subDays(now, 1)) }
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'yesterday'
    const groupBy = searchParams.get('groupBy') || 'sku'

    const { startDate, endDate } = getDateRange(period)

    // Get product-level data with fees directly from OrderItem table
    // This is where financial-events sync stores the actual fees
    // IMPORTANT: Use INNER JOINs with WHERE clause for date filtering
    // (not LEFT JOIN with date in ON clause, which would include ALL order_items)
    const salesByProduct = await prisma.$queryRaw<Array<{
      sku: string
      asin: string | null
      title: string | null
      image_url: string | null
      brand: string | null
      supplier_id: string | null
      parent_sku: string | null
      cost: string | null
      units_sold: number
      total_sales: string
      actual_fees: string
      items_with_fees: number
      total_items: number
    }>>`
      SELECT
        p.sku,
        p.asin,
        p.title,
        p.image_url,
        p.brand,
        p.supplier_id,
        p.parent_sku,
        p.cost::text,
        COALESCE(SUM(oi.quantity), 0)::int as units_sold,
        COALESCE(SUM(oi.item_price), 0)::text as total_sales,
        COALESCE(SUM(oi.amazon_fees), 0)::text as actual_fees,
        COUNT(CASE WHEN oi.amazon_fees > 0 THEN 1 END)::int as items_with_fees,
        COUNT(oi.id)::int as total_items
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      INNER JOIN products p ON oi.master_sku = p.sku
      WHERE o.purchase_date >= ${startDate}
        AND o.purchase_date <= ${endDate}
        AND o.status != 'Cancelled'
      GROUP BY p.sku, p.asin, p.title, p.image_url, p.brand, p.supplier_id, p.parent_sku, p.cost
      ORDER BY SUM(oi.item_price) DESC
    `

    // Get refunds by product
    let refundsByProduct: Array<{ sku: string; refund_count: number }> = []
    try {
      refundsByProduct = await prisma.$queryRaw<Array<{
        sku: string
        refund_count: number
      }>>`
        SELECT
          master_sku as sku,
          COALESCE(SUM(quantity), 0)::int as refund_count
        FROM returns
        WHERE return_date >= ${startDate}
          AND return_date <= ${endDate}
        GROUP BY master_sku
      `
    } catch (e) {
      // Returns table might not have data
    }

    // Create lookup map for refunds
    const refundsMap = new Map(refundsByProduct.map(r => [r.sku, r]))

    // Build product profit data with fee estimation
    const products: ProductProfit[] = salesByProduct.map((sale: any) => {
      const refund = refundsMap.get(sale.sku)

      const unitsSold = Number(sale.units_sold)
      const totalSales = parseFloat(sale.total_sales || '0')
      const refundCount = Number(refund?.refund_count || 0)
      const actualFees = parseFloat(sale.actual_fees || '0')
      const itemsWithFees = Number(sale.items_with_fees || 0)
      const totalItems = Number(sale.total_items || 0)
      const adSpend = 0 // Will be populated when Ads API is connected
      const cogs = parseFloat(sale.cost || '0')
      const cogsTotal = cogs * unitsSold

      // Calculate estimated fees for items without actual fees
      let estimatedFees = 0
      const itemsWithoutFees = totalItems - itemsWithFees
      if (itemsWithoutFees > 0 && totalSales > 0) {
        // Estimate based on average sale price per item
        const avgPricePerItem = totalSales / totalItems
        const estimatedSalesWithoutFees = avgPricePerItem * itemsWithoutFees
        const estimate = getQuickFeeEstimate(estimatedSalesWithoutFees, itemsWithoutFees)
        estimatedFees = estimate.totalFees
      }

      const totalFees = actualFees + estimatedFees

      const refundRate = unitsSold > 0 ? (refundCount / unitsSold) * 100 : 0
      const grossProfit = totalSales - totalFees - cogsTotal
      const netProfit = grossProfit - adSpend
      const margin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0
      const roi = cogsTotal > 0 ? (netProfit / cogsTotal) * 100 : 0
      const realAcos = netProfit > 0 && adSpend > 0 ? (adSpend / netProfit) * 100 : null

      return {
        id: sale.sku,
        sku: sale.sku,
        asin: sale.asin || '',
        parentAsin: sale.parent_sku || undefined,
        title: sale.title || sale.sku,
        imageUrl: sale.image_url || undefined,
        brand: sale.brand || undefined,
        supplier: sale.supplier_id || undefined,
        channel: 'Amazon',
        unitsSold,
        refunds: refundCount,
        refundRate,
        sales: totalSales,
        adSpend,
        cogs,
        cogsTotal,
        amazonFees: totalFees,
        amazonFeesEstimated: estimatedFees,
        netProfit,
        margin,
        roi,
        realAcos,
        sessions: 0,
        unitSessionPct: 0,
        bsr: undefined,
        bsrChange: undefined,
      }
    })

    // Sort by net profit descending
    products.sort((a, b) => b.netProfit - a.netProfit)

    // Calculate summary stats
    const totalEstimatedFees = products.reduce((sum, p) => sum + p.amazonFeesEstimated, 0)
    const totalActualFees = products.reduce((sum, p) => sum + (p.amazonFees - p.amazonFeesEstimated), 0)
    const totalFees = totalEstimatedFees + totalActualFees
    const feeEstimationRate = totalFees > 0 ? (totalEstimatedFees / totalFees) * 100 : 0

    return NextResponse.json({
      products,
      meta: {
        totalActualFees: Number(totalActualFees.toFixed(2)),
        totalEstimatedFees: Number(totalEstimatedFees.toFixed(2)),
        feeEstimationRate: Number(feeEstimationRate.toFixed(1)),
        note: feeEstimationRate > 10
          ? 'Some fees are estimated. Run financial-events sync for actual fees.'
          : undefined,
      },
    })

  } catch (error: any) {
    console.error('Error fetching product profit data:', error)
    return NextResponse.json(
      { error: error.message, products: [] },
      { status: 500 }
    )
  }
}
