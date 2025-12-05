import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const skusParam = searchParams.get('skus') // comma-separated SKUs
    const sku = searchParams.get('sku') // single SKU (backwards compatible)
    
    // Support both single SKU and multiple SKUs
    const skus = skusParam 
      ? skusParam.split(',').map(s => s.trim()).filter(Boolean)
      : sku 
        ? [sku]
        : []
    
    if (skus.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No SKUs provided' 
      }, { status: 400 })
    }

    // Get products for the SKUs
    const products = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { sku: true }
    })

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        trends: []
      })
    }

    const validSkus = products.map((p: any) => p.sku)

    // Get monthly sales data for the last 24 months
    const endDate = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - 24)

    const monthlySales = await prisma.$queryRaw<Array<{
      master_sku: string
      month: Date
      units: bigint
    }>>`
      SELECT
        oi.master_sku,
        DATE_TRUNC('month', o.purchase_date) as month,
        SUM(oi.quantity)::bigint as units
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.master_sku = ANY(${validSkus})
        AND o.purchase_date >= ${startDate}
        AND o.purchase_date <= ${endDate}
        AND o.status NOT IN ('Cancelled', 'Pending')
      GROUP BY oi.master_sku, DATE_TRUNC('month', o.purchase_date)
      ORDER BY month ASC
    `

    // Build the trends array with all months
    const monthsSet = new Set<string>()
    const salesBySku: Record<string, Record<string, number>> = {}

    // Initialize salesBySku for each requested SKU
    for (const sku of skus) {
      salesBySku[sku] = {}
    }

    // Populate with data
    for (const row of monthlySales) {
      const monthStr = new Date(row.month).toLocaleString('default', { month: 'short', year: '2-digit' })
      monthsSet.add(monthStr)

      const sku = row.master_sku
      if (sku && salesBySku[sku]) {
        salesBySku[sku][monthStr] = Number(row.units)
      }
    }

    // Sort months chronologically
    const allMonths: string[] = []
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const monthStr = currentDate.toLocaleString('default', { month: 'short', year: '2-digit' })
      allMonths.push(monthStr)
      currentDate.setMonth(currentDate.getMonth() + 1)
    }

    // Build final trends array
    const trends = allMonths.map(month => {
      const dataPoint: Record<string, any> = { month }
      for (const sku of skus) {
        dataPoint[sku] = salesBySku[sku]?.[month] || 0
      }
      return dataPoint
    })

    return NextResponse.json({
      success: true,
      trends,
      skus: skus,
    })

  } catch (error: any) {
    console.error('Trends API error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 })
  }
}
