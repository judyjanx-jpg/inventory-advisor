import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Check if a single SKU is ready for a push
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { masterSku, pushMultiplier, durationDays } = body

    if (!masterSku || !pushMultiplier || !durationDays) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: masterSku, pushMultiplier, durationDays' },
        { status: 400 }
      )
    }

    // Get product inventory and velocity data
    const product = await prisma.product.findUnique({
      where: { sku: masterSku },
      include: {
        skuMappings: true,
      },
    })

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 })
    }

    // Get velocity from SkuAnalytics
    const analytics = await prisma.skuAnalytics.findUnique({
      where: { masterSku },
    })

    const currentVelocity = analytics ? Number(analytics.velocity30d) : 0

    // Get inventory levels
    const [fbaInventory, warehouseInventory] = await Promise.all([
      prisma.channelInventory.findFirst({
        where: { masterSku },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.warehouseInventory.findFirst({
        where: { masterSku },
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    const fbaAvailable = fbaInventory ? Number(fbaInventory.fulfillableQty || 0) : 0
    const fbaInbound = fbaInventory ? Number(fbaInventory.inboundQty || 0) : 0
    const warehouseAvailable = warehouseInventory ? warehouseInventory.quantityAvailable : 0

    // Get pending PO quantities
    const pendingPOs = await prisma.purchaseOrderItem.aggregate({
      where: {
        masterSku,
        purchaseOrder: {
          status: { in: ['pending', 'ordered', 'in_transit'] },
        },
      },
      _sum: { quantity: true },
    })
    const incomingFromPO = pendingPOs._sum.quantity || 0

    const totalInventory = fbaAvailable + fbaInbound + warehouseAvailable + incomingFromPO

    // Get lead time
    const supplierPerformance = await prisma.supplierPerformance.findFirst({
      where: { supplierId: product.supplierId || 0 },
    })
    const leadTimeDays = supplierPerformance
      ? Number(supplierPerformance.avgActualLeadTimeDays)
      : (product.supplierLeadTimeDays || 14)

    // Calculate push readiness
    const pushedVelocity = currentVelocity * pushMultiplier
    const inventoryNeededForPush = pushedVelocity * durationDays
    const remainingAfterPush = totalInventory - inventoryNeededForPush
    const daysOfBufferAtNormalVelocity = currentVelocity > 0 ? remainingAfterPush / currentVelocity : 999
    const bufferAfterLeadTime = daysOfBufferAtNormalVelocity - leadTimeDays

    const ready = bufferAfterLeadTime > 0

    let message = ''
    let recommendation = ''

    if (ready) {
      message = `Ready — you have ${Math.round(bufferAfterLeadTime)} days of buffer after the push`
      if (bufferAfterLeadTime > 60) {
        recommendation = 'Strong buffer. You can safely run this push.'
      } else if (bufferAfterLeadTime > 30) {
        recommendation = 'Moderate buffer. Consider placing a PO soon after the push.'
      } else {
        recommendation = 'Tight buffer. Place a PO before or during the push.'
      }
    } else {
      message = `Not ready — would run out ${Math.abs(Math.round(bufferAfterLeadTime))} days before restock`
      recommendation = `You need approximately ${Math.ceil(inventoryNeededForPush - totalInventory + (currentVelocity * leadTimeDays))} more units to safely run this push.`
    }

    // Log the check
    await prisma.pushReadinessCheck.create({
      data: {
        masterSku,
        pushMultiplier,
        durationDays,
        checkResult: ready,
        daysOfBuffer: Math.round(bufferAfterLeadTime),
        message,
      },
    })

    return NextResponse.json({
      success: true,
      result: {
        ready,
        daysOfBuffer: Math.round(bufferAfterLeadTime),
        message,
        recommendation,
        details: {
          currentVelocity,
          pushedVelocity,
          totalInventory,
          inventoryNeededForPush: Math.round(inventoryNeededForPush),
          remainingAfterPush: Math.round(remainingAfterPush),
          leadTimeDays,
        },
      },
    })
  } catch (error) {
    console.error('Failed to check push readiness:', error)
    return NextResponse.json({ success: false, error: 'Failed to check push readiness' }, { status: 500 })
  }
}

// Get bulk push readiness for all SKUs
export async function GET() {
  try {
    // Get all products with analytics
    const analytics = await prisma.skuAnalytics.findMany({
      take: 200,
      orderBy: { velocity30d: 'desc' },
    })

    const results = await Promise.all(
      analytics.map(async (item: { masterSku: string; velocity30d: unknown }) => {
        const product = await prisma.product.findUnique({
          where: { sku: item.masterSku },
        })

        // Get inventory
        const [fbaInventory, warehouseInventory] = await Promise.all([
          prisma.channelInventory.findFirst({
            where: { masterSku: item.masterSku },
            orderBy: { updatedAt: 'desc' },
          }),
          prisma.warehouseInventory.findFirst({
            where: { masterSku: item.masterSku },
            orderBy: { updatedAt: 'desc' },
          }),
        ])

        const fbaAvailable = fbaInventory ? Number(fbaInventory.fulfillableQty || 0) : 0
        const fbaInbound = fbaInventory ? Number(fbaInventory.inboundQty || 0) : 0
        const warehouseAvailable = warehouseInventory ? warehouseInventory.quantityAvailable : 0

        const totalInventory = fbaAvailable + fbaInbound + warehouseAvailable
        const velocity = Number(item.velocity30d)
        const leadTimeDays = product?.supplierLeadTimeDays || 14

        const daysOfSupply = velocity > 0 ? totalInventory / velocity : 999
        const availableForPush = daysOfSupply - leadTimeDays
        const maxSustainablePush = availableForPush > 0 ? Math.min(5, availableForPush / 30) : 1

        let status: 'ready' | 'limited' | 'not_ready'
        let limitingFactor: string | undefined

        if (maxSustainablePush >= 3) {
          status = 'ready'
        } else if (maxSustainablePush >= 1.5) {
          status = 'limited'
          if (warehouseAvailable < velocity * 30) {
            limitingFactor = 'warehouse stock'
          } else if (leadTimeDays > 21) {
            limitingFactor = 'lead time'
          }
        } else {
          status = 'not_ready'
          if (totalInventory < velocity * leadTimeDays) {
            limitingFactor = 'insufficient inventory'
          } else {
            limitingFactor = 'low buffer'
          }
        }

        return {
          sku: item.masterSku,
          currentVelocity: velocity,
          maxSustainablePush: Math.max(1, Math.round(maxSustainablePush * 10) / 10),
          daysOfBuffer: Math.round(daysOfSupply - leadTimeDays),
          status,
          limitingFactor,
        }
      })
    )

    return NextResponse.json({
      success: true,
      items: results,
    })
  } catch (error) {
    console.error('Failed to get bulk push readiness:', error)
    return NextResponse.json({ success: false, error: 'Failed to get push readiness' }, { status: 500 })
  }
}
