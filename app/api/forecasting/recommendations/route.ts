/**
 * Forecasting Recommendations API - OPTIMIZED
 * 
 * Handles large datasets (300k+ orders) without freezing
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const TARGETS = {
  fbaTargetDays: 45,
  warehouseTargetDays: 135,
  totalTargetDays: 180,
  fbaReceivingDays: 10,
  defaultLeadTimeDays: 30,
}

const URGENCY_THRESHOLDS = {
  critical: 14,
  high: 30,
  medium: 60,
  low: 90,
}

export async function GET(request: NextRequest) {
  try {
    const now = new Date()
    
    // Use raw SQL for velocity calculation - MUCH faster than groupBy on large tables
    const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const days14Ago = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const days30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const days60Ago = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    const days90Ago = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // Step 1: Get products with inventory (limited fields for speed)
    console.log('Fetching products...')
    const products = await prisma.product.findMany({
      where: {
        status: 'active',
        isHidden: false,
        isParent: false,
      },
      select: {
        sku: true,
        title: true,
        displayName: true,
        cost: true,
        price: true,
        supplier: {
          select: {
            id: true,
            name: true,
            leadTimeDays: true,
            minimumOrderQuantity: true,
          }
        },
        inventoryLevels: {
          select: {
            fbaAvailable: true,
            fbaInboundWorking: true,
            fbaInboundShipped: true,
            fbaInboundReceiving: true,
          },
          take: 1,
        },
        warehouseInventory: {
          select: { available: true },
          where: { available: { gt: 0 } },
        },
      },
    })
    console.log(`Found ${products.length} products`)

    // Step 2: Get velocity data using raw SQL (much faster)
    console.log('Calculating velocities...')
    
    const velocityQuery = `
      SELECT 
        oi.master_sku as sku,
        SUM(CASE WHEN o.purchase_date >= $1 THEN oi.quantity ELSE 0 END) as units_7d,
        SUM(CASE WHEN o.purchase_date >= $2 AND o.purchase_date < $1 THEN oi.quantity ELSE 0 END) as units_prev_7d,
        SUM(CASE WHEN o.purchase_date >= $3 THEN oi.quantity ELSE 0 END) as units_30d,
        SUM(CASE WHEN o.purchase_date >= $4 AND o.purchase_date < $3 THEN oi.quantity ELSE 0 END) as units_prev_30d,
        SUM(CASE WHEN o.purchase_date >= $5 THEN oi.quantity ELSE 0 END) as units_90d
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status NOT IN ('Cancelled', 'Pending')
        AND o.purchase_date >= $5
      GROUP BY oi.master_sku
    `
    
    const velocityData: any[] = await prisma.$queryRawUnsafe(
      velocityQuery,
      days7Ago,
      days14Ago,
      days30Ago,
      days60Ago,
      days90Ago
    )
    console.log(`Got velocity for ${velocityData.length} SKUs`)

    // Create velocity lookup map
    const velocityMap = new Map<string, any>()
    for (const v of velocityData) {
      velocityMap.set(v.sku, {
        units7d: Number(v.units_7d) || 0,
        unitsPrev7d: Number(v.units_prev_7d) || 0,
        units30d: Number(v.units_30d) || 0,
        unitsPrev30d: Number(v.units_prev_30d) || 0,
        units90d: Number(v.units_90d) || 0,
      })
    }

    // Step 3: Process products
    console.log('Processing products...')
    const forecastItems = []

    for (const product of products) {
      const inv = product.inventoryLevels?.[0]
      const velocity = velocityMap.get(product.sku) || {
        units7d: 0, unitsPrev7d: 0, units30d: 0, unitsPrev30d: 0, units90d: 0
      }
      
      // Inventory
      const fbaAvailable = inv?.fbaAvailable || 0
      const fbaInbound = (inv?.fbaInboundWorking || 0) + (inv?.fbaInboundShipped || 0) + (inv?.fbaInboundReceiving || 0)
      const warehouseAvailable = product.warehouseInventory.reduce((sum, w) => sum + w.available, 0)
      const totalInventory = fbaAvailable + fbaInbound + warehouseAvailable

      // Skip products with no sales AND no inventory
      if (velocity.units90d === 0 && totalInventory === 0) {
        continue
      }

      // Velocity calculations
      const velocity7d = velocity.units7d / 7
      const velocity30d = velocity.units30d / 30
      const velocity90d = velocity.units90d / 90

      // Velocity changes
      const velocityChange7d = velocity.unitsPrev7d > 0 
        ? ((velocity.units7d - velocity.unitsPrev7d) / velocity.unitsPrev7d * 100) 
        : 0
      const velocityChange30d = velocity.unitsPrev30d > 0 
        ? ((velocity.units30d - velocity.unitsPrev30d) / velocity.unitsPrev30d * 100) 
        : 0

      // Effective velocity
      let effectiveVelocity = velocity30d
      if (velocity7d > 0 && velocity30d > 0) {
        const ratio = velocity7d / velocity30d
        if (ratio > 1.5 || ratio < 0.5) {
          effectiveVelocity = velocity7d * 0.6 + velocity30d * 0.4
        }
      }

      // Velocity trend
      let velocityTrend: 'rising' | 'stable' | 'declining' = 'stable'
      if (velocity30d > 0) {
        const ratio = velocity7d / velocity30d
        if (ratio > 1.2) velocityTrend = 'rising'
        else if (ratio < 0.8) velocityTrend = 'declining'
      }

      // Days of supply
      const fbaDaysOfSupply = effectiveVelocity > 0 
        ? (fbaAvailable + fbaInbound) / effectiveVelocity 
        : fbaAvailable > 0 ? 999 : 0
      
      const warehouseDaysOfSupply = effectiveVelocity > 0 
        ? warehouseAvailable / effectiveVelocity 
        : warehouseAvailable > 0 ? 999 : 0
      
      const totalDaysOfSupply = effectiveVelocity > 0 
        ? totalInventory / effectiveVelocity 
        : totalInventory > 0 ? 999 : 0

      // Supplier info
      const leadTimeDays = product.supplier?.leadTimeDays || TARGETS.defaultLeadTimeDays
      const supplierName = product.supplier?.name
      const moq = product.supplier?.minimumOrderQuantity
      const cost = Number(product.cost) || 0

      // Safety stock (2 weeks)
      const safetyStock = Math.ceil(effectiveVelocity * 14)

      // Reorder point
      const leadTimeDemand = effectiveVelocity * leadTimeDays
      const reorderPoint = Math.ceil(leadTimeDemand + safetyStock)

      // Recommended order quantity
      const targetInventory = effectiveVelocity * TARGETS.totalTargetDays
      let recommendedOrderQty = Math.ceil(Math.max(0, targetInventory - totalInventory))
      if (moq && recommendedOrderQty > 0 && recommendedOrderQty < moq) {
        recommendedOrderQty = moq
      }

      // Recommended FBA quantity
      const fbaTargetInventory = effectiveVelocity * (TARGETS.fbaTargetDays + TARGETS.fbaReceivingDays)
      const currentFbaInventory = fbaAvailable + fbaInbound
      let recommendedFbaQty = Math.ceil(Math.max(0, fbaTargetInventory - currentFbaInventory))
      recommendedFbaQty = Math.min(recommendedFbaQty, warehouseAvailable)

      // Stockout date
      let stockoutDate: string | undefined
      let daysUntilStockout: number | undefined
      if (effectiveVelocity > 0 && totalDaysOfSupply < 365) {
        daysUntilStockout = Math.floor(totalDaysOfSupply)
        const stockoutDateObj = new Date(now.getTime() + totalDaysOfSupply * 24 * 60 * 60 * 1000)
        stockoutDate = stockoutDateObj.toISOString()
      }

      // Urgency
      const daysUntilMustOrder = totalDaysOfSupply - leadTimeDays - 14
      let urgency: 'critical' | 'high' | 'medium' | 'low' | 'ok' = 'ok'
      
      if (daysUntilMustOrder <= URGENCY_THRESHOLDS.critical) {
        urgency = 'critical'
      } else if (daysUntilMustOrder <= URGENCY_THRESHOLDS.high) {
        urgency = 'high'
      } else if (daysUntilMustOrder <= URGENCY_THRESHOLDS.medium) {
        urgency = 'medium'
      } else if (daysUntilMustOrder <= URGENCY_THRESHOLDS.low) {
        urgency = 'low'
      }

      // No sales = ok unless zero inventory
      if (effectiveVelocity === 0 && totalInventory > 0) {
        urgency = 'ok'
      }

      // Confidence
      let confidence = 0.5
      if (velocity.units90d > 0) {
        const varianceRatio = Math.abs(velocity7d - velocity30d) / Math.max(velocity30d, 0.1)
        const stabilityScore = Math.max(0, 1 - varianceRatio)
        const dataScore = Math.min(1, velocity.units90d / 100)
        confidence = stabilityScore * 0.6 + dataScore * 0.4
      }

      forecastItems.push({
        sku: product.sku,
        title: product.title,
        displayName: product.displayName || undefined,
        
        velocity7d,
        velocity30d,
        velocity90d,
        velocityTrend,
        velocityChange7d,
        velocityChange30d,
        
        fbaAvailable,
        fbaInbound,
        warehouseAvailable,
        totalInventory,
        
        fbaDaysOfSupply: Math.min(fbaDaysOfSupply, 999),
        warehouseDaysOfSupply: Math.min(warehouseDaysOfSupply, 999),
        totalDaysOfSupply: Math.min(totalDaysOfSupply, 999),
        
        supplierId: product.supplier?.id,
        supplierName,
        leadTimeDays,
        cost,
        moq: moq || undefined,
        
        reorderPoint,
        recommendedOrderQty,
        recommendedFbaQty,
        urgency,
        stockoutDate,
        daysUntilStockout,
        
        seasonalityFactor: 1,
        upcomingEvent: undefined,
        confidence,
        safetyStock,
        reasoning: [],
      })
    }

    console.log(`Processed ${forecastItems.length} active items`)

    // Sort by urgency
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3, ok: 4 }
    forecastItems.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])

    // Summary
    const summary = {
      totalProducts: forecastItems.length,
      criticalCount: forecastItems.filter(i => i.urgency === 'critical').length,
      highCount: forecastItems.filter(i => i.urgency === 'high').length,
      mediumCount: forecastItems.filter(i => i.urgency === 'medium').length,
      totalReorderValue: forecastItems.reduce((sum, i) => sum + (i.recommendedOrderQty * i.cost), 0),
      totalFbaShipmentUnits: forecastItems.reduce((sum, i) => sum + i.recommendedFbaQty, 0),
    }

    console.log('Done!', summary)

    return NextResponse.json({
      success: true,
      items: forecastItems,
      summary,
      targets: TARGETS,
    })

  } catch (error: any) {
    console.error('Forecasting API error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
