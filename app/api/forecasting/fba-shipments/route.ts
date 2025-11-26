import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Generate FBA shipment forecast
 * Analyzes channel-specific SKU sales and inventory
 * Suggests shipments to maintain 45 days of stock
 * Respects capacity constraints and batches shipments
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      daysTarget = 45,
      dailyCapacity = 100, // units per day
      weeklyCapacity = 700, // units per week
      channel = 'amazon_us', // specific channel
      minShipmentSize = 5, // minimum units per SKU in a shipment
      preferredBatchSize = 100, // preferred batch size for batching
    } = body

    // Get all SKU mappings for the specified channel
    const skuMappings = await prisma.skuMapping.findMany({
      where: {
        channel,
        isActive: true,
      },
      include: {
        product: {
          include: {
            inventoryLevels: true,
            salesVelocity: true,
            skuMappings: {
              where: { channel },
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
        },
        channelInventory: true,
      },
    })

    console.log(`[FBA Forecast] Found ${skuMappings.length} SKU mappings for channel ${channel}`)

    const now = new Date()
    const recommendations: any[] = []
    let skippedNoProduct = 0
    let skippedParent = 0
    let skippedNoVelocity = 0
    let skippedEnoughStock = 0

    for (const mapping of skuMappings) {
      const product = mapping.product
      if (!product) {
        skippedNoProduct++
        continue
      }

      // Skip parent products
      if (product.isParent || (product.parentSku === null && (product._count?.variations || 0) > 0)) {
        skippedParent++
        continue
      }

      // Get channel-specific velocity (if available) or use master velocity
      const channelInventory = mapping.channelInventory?.[0]
      const channelVelocity = channelInventory?.velocity30d
        ? Number(channelInventory.velocity30d)
        : Number(product.salesVelocity?.velocity30d || 0)

      if (channelVelocity === 0) {
        skippedNoVelocity++
        continue
      }

      // Get FBA inventory for this SKU (inventoryLevels is an array)
      const inventoryLevel = product.inventoryLevels?.[0] || null
      const inventory = inventoryLevel || {
        fbaAvailable: 0,
        fbaInboundWorking: 0,
        fbaInboundShipped: 0,
        fbaInboundReceiving: 0,
      }

      const fbaInventory =
        Number(inventory.fbaAvailable || 0) +
        Number(inventory.fbaInboundWorking || 0) +
        Number(inventory.fbaInboundShipped || 0) +
        Number(inventory.fbaInboundReceiving || 0)

      // Calculate days of stock
      const daysOfStock = channelVelocity > 0 ? fbaInventory / channelVelocity : 999

      // Calculate seasonality multiplier
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
      const daysToCheck = 30
      
      for (const event of seasonalEvents) {
        const eventStart = new Date(today.getFullYear(), event.startMonth - 1, event.startDay)
        const eventEnd = new Date(today.getFullYear(), event.endMonth - 1, event.endDay)
        
        const daysUntilEvent = Math.ceil((eventStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        if (daysUntilEvent >= 0 && daysUntilEvent <= daysToCheck) {
          const multiplier = Number(event.learnedMultiplier || event.baseMultiplier)
          if (multiplier > seasonalityMultiplier) {
            seasonalityMultiplier = multiplier
            seasonalityNote = `${event.name} coming up (+${((multiplier - 1) * 100).toFixed(0)}%)`
          }
        }
      }

      // Calculate demand for target period (with seasonality)
      const baseDemand = channelVelocity * daysTarget
      const adjustedDemand = baseDemand * seasonalityMultiplier

      // Calculate what we need to ship
      const neededUnits = Math.max(0, adjustedDemand - fbaInventory)

      // Get sales data for the last 30 days
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const recentSales = await prisma.dailyProfit.aggregate({
        where: {
          masterSku: product.sku,
          date: { gte: thirtyDaysAgo },
        },
        _sum: {
          unitsSold: true,
        },
      })
      const unitsSold30d = Number(recentSales._sum.unitsSold || 0)

      if (neededUnits > 0 || daysOfStock < daysTarget) {
        // Calculate shipment batches
        // Prefer larger batches (e.g., 100/month) rather than small daily shipments
        const batches: any[] = []
        let remainingNeeded = neededUnits

        // Calculate how many batches we need
        const totalBatches = Math.ceil(neededUnits / preferredBatchSize)
        const batchSize = Math.max(minShipmentSize, Math.ceil(neededUnits / totalBatches))

        // Distribute batches over time (e.g., monthly)
        const batchInterval = 30 // days between batches
        let batchDate = new Date(now)

        while (remainingNeeded > 0 && batchDate < new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)) {
          const batchQuantity = Math.min(batchSize, remainingNeeded)
          
          if (batchQuantity >= minShipmentSize) {
          batches.push({
            shipDate: new Date(batchDate).toISOString(),
            quantity: batchQuantity,
            projectedFbaInventory: Math.max(0, fbaInventory - (channelVelocity * Math.ceil((batchDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))),
          })
            remainingNeeded -= batchQuantity
          }

          batchDate.setDate(batchDate.getDate() + batchInterval)
        }

        recommendations.push({
          masterSku: product.sku,
          channelSku: mapping.channelSku,
          title: product.title,
          channel,
          currentFbaInventory: fbaInventory,
          channelVelocity,
          daysOfStock: Math.floor(daysOfStock),
          targetDays: daysTarget,
          neededUnits: Math.ceil(neededUnits),
          batches,
          calculationBreakdown: {
            unitsSold30d,
            channelVelocity,
            baseDemand,
            seasonalityMultiplier,
            seasonalityNote,
            adjustedDemand,
            currentFbaInventory: fbaInventory,
            finalNeeded: neededUnits,
          },
        })
      }
    }

    // Group shipments by date to respect capacity
    const capacityAdjustedShipments: any[] = []
    const shipmentsByDate = new Map<string, any[]>()

    for (const rec of recommendations) {
      for (const batch of rec.batches) {
        const batchDate = typeof batch.shipDate === 'string' ? new Date(batch.shipDate) : batch.shipDate
        const dateKey = batchDate.toISOString().split('T')[0]
        if (!shipmentsByDate.has(dateKey)) {
          shipmentsByDate.set(dateKey, [])
        }
        shipmentsByDate.get(dateKey)!.push({
          ...rec,
          batch: {
            ...batch,
            shipDate: batchDate.toISOString(),
          },
        })
      }
    }

    // Adjust for capacity constraints
    for (const [dateKey, shipments] of shipmentsByDate.entries()) {
      const totalUnits = shipments.reduce((sum, s) => sum + s.batch.quantity, 0)
      
      // Check daily capacity
      if (totalUnits > dailyCapacity) {
        // Distribute excess to next day(s)
        let excess = totalUnits - dailyCapacity
        let currentDate = new Date(dateKey)
        let remainingShipments = [...shipments]

        while (excess > 0 && remainingShipments.length > 0) {
          const shipment = remainingShipments.shift()!
          const allocated = Math.min(shipment.batch.quantity, dailyCapacity)
          const deferred = shipment.batch.quantity - allocated

          if (allocated > 0) {
            capacityAdjustedShipments.push({
              ...shipment,
              batch: {
                ...shipment.batch,
                quantity: allocated,
                shipDate: new Date(currentDate).toISOString(),
              },
            })
          }

          if (deferred > 0) {
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1)
            remainingShipments.push({
              ...shipment,
              batch: {
                ...shipment.batch,
                quantity: deferred,
                shipDate: currentDate,
              },
            })
            excess -= allocated
          }
        }
      } else {
        // Within capacity, add all shipments
        capacityAdjustedShipments.push(...shipments.map(s => ({
          ...s,
          batch: {
            ...s.batch,
            shipDate: new Date(dateKey).toISOString(),
          },
        })))
      }
    }

    // Sort by ship date
    capacityAdjustedShipments.sort((a, b) => 
      new Date(a.batch.shipDate).getTime() - new Date(b.batch.shipDate).getTime()
    )

    console.log(`[FBA Forecast] Summary:`, {
      totalMappings: skuMappings.length,
      skippedNoProduct,
      skippedParent,
      skippedNoVelocity,
      skippedEnoughStock,
      recommendations: recommendations.length,
    })

    return NextResponse.json({
      success: true,
      recommendations,
      capacityAdjustedShipments,
      summary: {
        totalSkus: recommendations.length,
        totalUnitsNeeded: recommendations.reduce((sum, r) => sum + r.neededUnits, 0),
        totalShipments: capacityAdjustedShipments.length,
        urgent: recommendations.filter(r => r.daysOfStock < 14).length,
        debug: {
          totalMappings: skuMappings.length,
          skippedNoProduct,
          skippedParent,
          skippedNoVelocity,
          skippedEnoughStock,
        },
      },
    })
  } catch (error: any) {
    console.error('Error generating FBA shipment forecast:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate FBA shipment forecast' },
      { status: 500 }
    )
  }
}

