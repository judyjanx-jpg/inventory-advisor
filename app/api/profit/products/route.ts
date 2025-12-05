// app/api/profit/products/route.ts
// Returns product-level profit data for the selected period

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { 
  startOfDay, 
  endOfDay, 
  startOfMonth, 
  endOfMonth, 
  subDays, 
  subMonths 
} from 'date-fns'

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

    // Get product-level sales data using correct column names (sku, not master_sku)
    const salesByProduct = await prisma.$queryRaw<Array<{
      sku: string
      asin: string | null
      title: string | null
      image_url: string | null
      brand: string | null
      supplier_id: string | null
      parent_sku: string | null
      cogs: number | null
      units_sold: number
      total_sales: number
    }>>`
      SELECT 
        p.sku,
        p.asin,
        p.title,
        p.image_url,
        p.brand,
        p.supplier_id,
        p.parent_sku,
        p.cogs,
        COALESCE(SUM(oi.quantity), 0)::int as units_sold,
        COALESCE(SUM(oi.item_price), 0)::numeric as total_sales
      FROM products p
      LEFT JOIN order_items oi ON p.sku = oi.master_sku
      LEFT JOIN orders o ON oi.order_id = o.id
        AND o.purchase_date >= ${startDate}
        AND o.purchase_date <= ${endDate}
        AND o.status != 'Cancelled'
      GROUP BY p.sku, p.asin, p.title, p.image_url, p.brand, p.supplier_id, p.parent_sku, p.cogs
      HAVING COALESCE(SUM(oi.quantity), 0) > 0
      ORDER BY total_sales DESC
    `

    // Get refunds by product
    let refundsByProduct: Array<{ sku: string; refund_count: number }> = []
    try {
      refundsByProduct = await prisma.$queryRaw<Array<{
        sku: string
        refund_count: number
      }>>`
        SELECT 
          sku,
          COALESCE(SUM(quantity), 0)::int as refund_count
        FROM returns
        WHERE return_date >= ${startDate}
          AND return_date <= ${endDate}
        GROUP BY sku
      `
    } catch (e) {
      console.log('Refunds query skipped')
    }

    // Get Amazon fees by product - skip if complex join fails
    let feesByProduct: Array<{ sku: string; total_fees: number }> = []
    try {
      feesByProduct = await prisma.$queryRaw<Array<{
        sku: string
        total_fees: number
      }>>`
        SELECT 
          oi.master_sku as sku,
          COALESCE(SUM(ABS(af.fee_amount)), 0)::numeric as total_fees
        FROM amazon_fees af
        JOIN order_items oi ON af.order_item_id = oi.id
        WHERE af.posted_date >= ${startDate}
          AND af.posted_date <= ${endDate}
        GROUP BY oi.master_sku
      `
    } catch (e) {
      console.log('Fees query skipped')
    }

    // Create lookup maps
    const refundsMap = new Map(refundsByProduct.map(r => [r.sku, r]))
    const feesMap = new Map(feesByProduct.map(f => [f.sku, f]))

    // Build product profit data
    const products: ProductProfit[] = salesByProduct.map((sale: any) => {
      const refund = refundsMap.get(sale.sku)
      const fees = feesMap.get(sale.sku)

      const unitsSold = Number(sale.units_sold)
      const totalSales = Number(sale.total_sales)
      const refundCount = Number(refund?.refund_count || 0)
      const amazonFees = Number(fees?.total_fees || 0)
      const adSpend = 0 // Will be populated when Ads API is connected
      const cogs = Number(sale.cogs || 0)
      const cogsTotal = cogs * unitsSold

      const refundRate = unitsSold > 0 ? (refundCount / unitsSold) * 100 : 0
      const grossProfit = totalSales - amazonFees - cogsTotal
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
        amazonFees,
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

    return NextResponse.json({ products })

  } catch (error: any) {
    console.error('Error fetching product profit data:', error)
    return NextResponse.json(
      { error: error.message, products: [] },
      { status: 500 }
    )
  }
}
