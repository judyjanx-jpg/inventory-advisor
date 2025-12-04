import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Generate purchasing forecast
 * Analyzes all SKUs, all channels, all sales, all inventory
 * NOW INCLUDES: Pending purchase order quantities
 * Suggests what needs to be ordered and when to maintain 180 days of inventory
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      daysTarget = 180,
      orderFrequency = 'monthly', // 'weekly', 'bi-weekly', 'monthly'
    } = body

    // ========================================
    // STEP 1: Get all pending PO quantities by SKU
    // ========================================
    const pendingPOItems = await prisma.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: {
          status: { in: ['sent', 'confirmed', 'shipped', 'partial'] }
        }
      },
      select: {
        masterSku: true,
        quantityOrdered: true,
        quantityReceived: true,
        purchaseOrder: {
          select: {
            poNumber: true,
            expectedArrivalDate: true,
            status: true,
          }
        }
      }
    })

    // Group by SKU - sum up all pending quantities
    const incomingBySku: Record<string, { 
      totalIncoming: number
      items: Array<{ qty: number; poNumber: string; expectedDate: string | null; status: string }>
    }> = {}

    for (const item of pendingPOItems) {
      const remainingQty = item.quantityOrdered - (item.quantityReceived || 0)
      if (remainingQty <= 0) continue

      if (!incomingBySku[item.masterSku]) {
        incomingBySku[item.masterSku] = { totalIncoming: 0, items: [] }
      }
      
      incomingBySku[item.masterSku].totalIncoming += remainingQty
      incomingBySku[item.masterSku].items.push({
        qty: remainingQty,
        poNumber: item.purchaseOrder.poNumber,
        expectedDate: item.purchaseOrder.expectedArrivalDate?.toISOString() || null,
        status: item.purchaseOrder.status,
      })
    }

    console.log(`[Purchasing Forecast] Found incoming POs for ${Object.keys(incomingBySku).length} SKUs`)

    // ========================================
    // STEP 2: Get all products (excluding parent products)
    // ========================================
    const products = await prisma.product.findMany({
      where: {
        isHidden: false,
        OR: [
          { parentSku: { not: null } },
          {
            AND: [
              { isParent: false },
              { parentSku: null },
            ],
          },
        ],
      },
      include: {
        inventoryLevels: true,
        salesVelocity: true,
        supplier: true,
        skuMappings: {
          include: {
            channelInventory: true,
          },
        },
        _count: {
          select: {
            variations: true,
          },
        },
      },
    })

    // Filter out parent products
    const childProducts = products.filter(p => {
      if (p.parentSku === null && (p.isParent || (p._count?.variations || 0) > 0)) {
        return false
      }
      return true
    })

    const now = new Date()
    const targetDate = new Date(now)
    targetDate.setDate(targetDate.getDate() + daysTarget)

    // Calculate days between orders based on frequency
    const daysBetweenOrders = orderFrequency === 'weekly' ? 7 : orderFrequency === 'bi-weekly' ? 14 : 30

    const recommendations: any[] = []

    for (const product of childProducts) {
      const velocity30d = Number(product.salesVelocity?.velocity30d || 0)
      const velocity90d = Number(product.salesVelocity?.velocity90d || 0)
      const currentVelocity = velocity30d > 0 ? velocity30d : velocity90d > 0 ? velocity90d : 0

      if (currentVelocity === 0) continue // Skip products with no sales

      // Get 30-day sales for reporting
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      let unitsSold30d = 0
      try {
        const recentSales = await prisma.dailyProfit.aggregate({
          where: {
            masterSku: product.sku,
            date: { gte: thirtyDaysAgo },
          },
          _sum: {
            unitsSold: true,
          },
        })
        unitsSold30d = Number(recentSales._sum.unitsSold || 0)
      } catch (e) {
        // Table might not exist
      }

      // Get current inventory across all locations
      // inventoryLevels is an array, get the first one or use defaults
      const inventoryLevel = product.inventoryLevels?.[0] || null

      const inventory = inventoryLevel || {
        fbaAvailable: 0,
        fbaInboundWorking: 0,
        fbaInboundShipped: 0,
        fbaInboundReceiving: 0,
        warehouseAvailable: 0,
      }

      // ========================================
      // UPDATED: Include incoming PO quantities
      // ========================================
      const incomingPO = incomingBySku[product.sku] || { totalIncoming: 0, items: [] }
      
      // Break down inventory components
      const fbaAvailable = Number(inventory.fbaAvailable || 0)
      const fbaInbound = 
        Number(inventory.fbaInboundWorking || 0) +
        Number(inventory.fbaInboundShipped || 0) +
        Number(inventory.fbaInboundReceiving || 0)
      const warehouseAvailable = Number(inventory.warehouseAvailable || 0)
      const incomingFromPO = incomingPO.totalIncoming
      
      const inventoryOnHand = fbaAvailable + fbaInbound + warehouseAvailable
      
      // Total inventory = on hand + incoming from POs
      const totalInventory = inventoryOnHand + incomingFromPO

      // Calculate days of stock
      const daysOfStock = currentVelocity > 0 ? totalInventory / currentVelocity : 999

      // Calculate demand for target period
      const demandForPeriod = currentVelocity * daysTarget

      // Get supplier lead time
      const leadTimeDays = Number(product.supplier?.leadTimeDays || 30)
      const safetyStock = Math.ceil(currentVelocity * Math.max(leadTimeDays, 14))

      // Calculate seasonality multiplier (check if we're approaching a peak)
      let seasonalEvents: any[] = []
      try {
        seasonalEvents = await prisma.seasonalEvent.findMany({
          where: { isActive: true },
        })
      } catch (error: any) {
        // Table doesn't exist yet - that's okay, just skip seasonality
        if (!error.message?.includes('does not exist') && !error.message?.includes('Unknown table')) {
          console.warn('Error fetching seasonal events:', error.message)
        }
      }
      
      let seasonalityMultiplier = 1.0
      let seasonalityNote = ''
      const today = new Date()
      const daysToCheck = 30 // Check next 30 days for upcoming events
      
      for (const event of seasonalEvents) {
        const eventStart = new Date(today.getFullYear(), event.startMonth - 1, event.startDay)
        const eventEnd = new Date(today.getFullYear(), event.endMonth - 1, event.endDay)
        
        // Check if event is coming up in the next 30 days
        const daysUntilEvent = Math.ceil((eventStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        if (daysUntilEvent >= 0 && daysUntilEvent <= daysToCheck) {
          const multiplier = Number(event.learnedMultiplier || event.baseMultiplier)
          if (multiplier > seasonalityMultiplier) {
            seasonalityMultiplier = multiplier
            seasonalityNote = `${event.name} coming up (+${((multiplier - 1) * 100).toFixed(0)}%)`
          }
        }
      }

      // Calculate adjusted demand (with seasonality)
      const adjustedDemandForPeriod = demandForPeriod * seasonalityMultiplier

      // Calculate what we need to order (including safety stock)
      const neededInventory = Math.max(0, adjustedDemandForPeriod + safetyStock - totalInventory)

      // Calculate when to order (order when we'll run out in leadTime + buffer)
      const daysUntilReorder = Math.max(0, daysOfStock - leadTimeDays - 7)

      if (neededInventory > 0 || daysOfStock < daysTarget) {
        // Calculate order quantities for each order cycle
        const orderCycles: any[] = []
        let currentDate = new Date(now)
        let remainingNeeded = neededInventory

        while (currentDate < targetDate && remainingNeeded > 0) {
          // Calculate how much we'll need by this order date
          const daysUntilOrder = Math.ceil((currentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          const projectedInventory = totalInventory - (currentVelocity * daysUntilOrder)
          const projectedNeeded = Math.max(0, (currentVelocity * daysTarget) - projectedInventory)

          if (projectedNeeded > 0) {
            // Round up to reasonable batch sizes
            let orderQty = projectedNeeded
            const moq = product.supplier?.moq || 1
            if (moq > 1) {
              orderQty = Math.ceil(orderQty / moq) * moq
            }

            orderCycles.push({
              orderDate: new Date(currentDate).toISOString(),
              quantity: Math.ceil(orderQty),
              projectedInventory: Math.max(0, Math.floor(projectedInventory)),
              needed: Math.ceil(projectedNeeded),
            })

            remainingNeeded -= orderQty
          }

          // Move to next order cycle
          currentDate.setDate(currentDate.getDate() + daysBetweenOrders)
        }

        recommendations.push({
          masterSku: product.sku,
          title: product.title,
          supplier: product.supplier ? {
            id: product.supplier.id,
            name: product.supplier.name,
            moq: product.supplier.moq || 1,
          } : null,
          currentInventory: totalInventory,
          fbaAvailable,  // NEW: FBA available
          fbaInbound,    // NEW: FBA inbound (working+shipped+receiving)
          warehouseAvailable,  // NEW: Warehouse on hand
          incomingFromPO: incomingPO.totalIncoming,  // What's on order
          incomingPODetails: incomingPO.items,  // PO details
          currentVelocity: currentVelocity,
          daysOfStock: Math.floor(daysOfStock),
          targetDays: daysTarget,
          neededInventory: Math.ceil(neededInventory),
          safetyStock,
          leadTimeDays,
          daysUntilReorder: Math.floor(daysUntilReorder),
          orderCycles,
          unitCost: Number(product.cost || 0),
          calculationBreakdown: {
            unitsSold30d,
            velocity30d: velocity30d,
            velocity90d: velocity90d,
            baseDemand: demandForPeriod,
            seasonalityMultiplier,
            seasonalityNote,
            adjustedDemand: adjustedDemandForPeriod,
            fbaAvailable,  // NEW
            fbaInbound,    // NEW
            warehouseAvailable,  // NEW
            incomingFromPO: incomingPO.totalIncoming,  // NEW
            currentInventory: totalInventory,
            safetyStock,
            totalNeeded: adjustedDemandForPeriod + safetyStock,
            finalNeeded: neededInventory,
          },
        })
      }
    }

    // Sort by urgency (days until reorder, then by needed inventory)
    recommendations.sort((a, b) => {
      if (a.daysUntilReorder !== b.daysUntilReorder) {
        return a.daysUntilReorder - b.daysUntilReorder
      }
      return b.neededInventory - a.neededInventory
    })

    return NextResponse.json({
      success: true,
      recommendations,
      summary: {
        totalSkus: recommendations.length,
        totalNeeded: recommendations.reduce((sum, r) => sum + r.neededInventory, 0),
        urgent: recommendations.filter(r => r.daysUntilReorder < 14).length,
        critical: recommendations.filter(r => r.daysUntilReorder < 7).length,
        skusWithIncomingPO: recommendations.filter(r => r.incomingFromPO > 0).length,
      },
    })
  } catch (error: any) {
    console.error('Error generating purchasing forecast:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate purchasing forecast' },
      { status: 500 }
    )
  }
}
