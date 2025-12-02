/**
 * Stockouts Tracking API
 * 
 * GET /api/forecasting/stockouts - List all stockout events
 * POST /api/forecasting/stockouts/analyze - Analyze and detect stockouts
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Root cause categories
const ROOT_CAUSES = {
  FORECAST_LOW: 'Forecast was too low',
  SUPPLIER_DELAY: 'Supplier delayed shipment',
  SPIKE_MISSED: 'Unexpected sales spike not detected',
  FBA_DELAY: 'FBA receiving took longer than expected',
  SAFETY_STOCK_LOW: 'Safety stock was insufficient',
  SEASONAL_MISS: 'Seasonal demand underestimated',
  MANUAL_ERROR: 'Manual order error or delay',
}

// Prevention actions
const PREVENTION_ACTIONS = {
  FORECAST_LOW: 'Increasing safety stock and improving forecast model weight',
  SUPPLIER_DELAY: 'Adding buffer days to supplier lead time',
  SPIKE_MISSED: 'Lowering spike detection threshold for this SKU',
  FBA_DELAY: 'Increasing FBA receiving buffer from 10 to 14 days',
  SAFETY_STOCK_LOW: 'Increasing safety stock Z-score for this SKU',
  SEASONAL_MISS: 'Adjusting seasonal multiplier based on actual sales',
  MANUAL_ERROR: 'Recommend enabling automated reorder alerts',
}

export async function GET(request: NextRequest) {
  try {
    // Get stockout events from the last 90 days
    const days90Ago = new Date()
    days90Ago.setDate(days90Ago.getDate() - 90)

    // Check if stockout_events table exists
    let stockouts: any[] = []
    try {
      stockouts = await prisma.stockoutEvent.findMany({
        where: {
          stockoutDate: { gte: days90Ago },
        },
        orderBy: { stockoutDate: 'desc' },
      })
    } catch (e: any) {
      // Table might not exist yet - try to detect stockouts from inventory data
      if (e.message?.includes('does not exist') || e.message?.includes('Unknown table')) {
        stockouts = await detectStockoutsFromInventory()
      } else {
        throw e
      }
    }

    return NextResponse.json({
      success: true,
      stockouts,
    })

  } catch (error: any) {
    console.error('Stockouts API error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

/**
 * Detect stockouts by analyzing inventory levels and sales patterns
 */
async function detectStockoutsFromInventory(): Promise<any[]> {
  const stockouts: any[] = []
  
  try {
    // Get products that had zero FBA inventory at some point but have sales history
    const products = await prisma.product.findMany({
      where: {
        status: 'active',
        isHidden: false,
      },
      include: {
        inventoryLevels: true,
        salesVelocity: true,
      },
    })

    // For each product, check if there were gaps in sales (potential stockouts)
    for (const product of products) {
      const velocity = product.salesVelocity
      if (!velocity || Number(velocity.velocity30d) === 0) continue

      const daysOutOfStock = velocity.daysOutOfStock30d || 0
      const estimatedLostSales = velocity.estimatedLostSales || 0

      if (daysOutOfStock > 0) {
        // Determine root cause based on available data
        let rootCauseKey = 'FORECAST_LOW'
        
        // Check supplier performance
        const supplier = await prisma.supplier.findFirst({
          where: { products: { some: { sku: product.sku } } },
        })
        
        if (supplier) {
          // Check if supplier has reliability issues
          try {
            const supplierPerf = await prisma.supplierPerformance.findUnique({
              where: { supplierId: supplier.id },
            })
            if (supplierPerf && Number(supplierPerf.onTimeRate) < 0.8) {
              rootCauseKey = 'SUPPLIER_DELAY'
            }
          } catch (e) {
            // Table might not exist
          }
        }

        stockouts.push({
          id: stockouts.length + 1,
          sku: product.sku,
          title: product.title,
          stockoutDate: new Date(Date.now() - daysOutOfStock * 24 * 60 * 60 * 1000).toISOString(),
          daysOutOfStock,
          estimatedLostSales: estimatedLostSales * Number(product.price || 0),
          rootCause: ROOT_CAUSES[rootCauseKey as keyof typeof ROOT_CAUSES],
          preventionAction: PREVENTION_ACTIONS[rootCauseKey as keyof typeof PREVENTION_ACTIONS],
          resolved: daysOutOfStock <= 3, // Consider resolved if back in stock within 3 days
        })
      }
    }
  } catch (error) {
    console.error('Error detecting stockouts:', error)
  }

  return stockouts
}

/**
 * Analyze a specific stockout event and determine root cause
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sku, stockoutDate } = body

    if (!sku) {
      return NextResponse.json({ success: false, error: 'SKU required' }, { status: 400 })
    }

    const analysis = await analyzeStockout(sku, new Date(stockoutDate || Date.now()))

    return NextResponse.json({
      success: true,
      analysis,
    })

  } catch (error: any) {
    console.error('Stockout analysis error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

/**
 * Deep analysis of a stockout event
 */
async function analyzeStockout(sku: string, stockoutDate: Date) {
  const daysBeforeStockout = 30
  const startDate = new Date(stockoutDate)
  startDate.setDate(startDate.getDate() - daysBeforeStockout)

  // Get sales velocity before stockout
  const salesBeforeStockout = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku: sku,
      order: {
        purchaseDate: { gte: startDate, lt: stockoutDate },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  const velocityBeforeStockout = (salesBeforeStockout._sum.quantity || 0) / daysBeforeStockout

  // Get product and supplier info
  const product = await prisma.product.findUnique({
    where: { sku },
    include: { supplier: true },
  })

  // Check for recent spikes
  const days7BeforeStockout = new Date(stockoutDate)
  days7BeforeStockout.setDate(days7BeforeStockout.getDate() - 7)
  
  const salesWeekBeforeStockout = await prisma.orderItem.aggregate({
    _sum: { quantity: true },
    where: {
      masterSku: sku,
      order: {
        purchaseDate: { gte: days7BeforeStockout, lt: stockoutDate },
        status: { notIn: ['Cancelled', 'Pending'] },
      },
    },
  })

  const velocityWeekBefore = (salesWeekBeforeStockout._sum.quantity || 0) / 7

  // Determine if there was a spike
  const wasSpike = velocityWeekBefore > velocityBeforeStockout * 1.5

  // Get any forecasts that existed for this period
  let forecastAccuracy = null
  try {
    const forecasts = await prisma.forecastAccuracy.findMany({
      where: {
        masterSku: sku,
        forecastDate: { gte: startDate, lte: stockoutDate },
      },
    })
    
    if (forecasts.length > 0) {
      const avgError = forecasts.reduce((sum, f) => sum + Math.abs(Number(f.percentageError)), 0) / forecasts.length
      forecastAccuracy = 100 - avgError
    }
  } catch (e) {
    // Table might not exist
  }

  // Determine root cause
  let rootCause = 'FORECAST_LOW'
  let details: string[] = []

  if (wasSpike) {
    rootCause = 'SPIKE_MISSED'
    details.push(`Sales increased ${((velocityWeekBefore / velocityBeforeStockout - 1) * 100).toFixed(0)}% in the week before stockout`)
  }

  if (product?.supplier) {
    const leadTime = product.supplier.leadTimeDays || 30
    details.push(`Supplier lead time: ${leadTime} days`)
    
    // Check if PO was placed late
    // (Would need PO data to verify)
  }

  if (forecastAccuracy !== null) {
    details.push(`Forecast accuracy before stockout: ${forecastAccuracy.toFixed(0)}%`)
    if (forecastAccuracy < 70) {
      rootCause = 'FORECAST_LOW'
    }
  }

  return {
    sku,
    stockoutDate: stockoutDate.toISOString(),
    velocityBeforeStockout,
    velocityWeekBefore,
    wasSpike,
    rootCause: ROOT_CAUSES[rootCause as keyof typeof ROOT_CAUSES],
    preventionAction: PREVENTION_ACTIONS[rootCause as keyof typeof PREVENTION_ACTIONS],
    details,
    recommendations: [
      wasSpike ? 'Enable more aggressive spike detection' : null,
      forecastAccuracy && forecastAccuracy < 80 ? 'Review and adjust forecast model' : null,
      'Consider increasing safety stock by 20%',
      'Set up low-stock alerts at 30 days of supply',
    ].filter(Boolean),
  }
}
