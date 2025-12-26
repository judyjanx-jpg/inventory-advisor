// app/api/pricing/route.ts
// API for fetching pricing data with profit calculations

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface PricingItem {
  sku: string
  title: string
  asin: string | null
  currentPrice: number
  cost: number
  totalCost: number // cost + packaging + tariffs
  fbaFee: number
  referralFee: number
  refundPercent: number
  adsPercent: number
  recentOrders: {
    date: string
    price: number
    profit: number
    profitPercent: number
  }[]
  avgRecentProfit: number
  avgRecentProfitPercent: number
  targetPrice: number
  profitAtTarget: number
  profitPercentAtTarget: number
  status: 'green' | 'yellow' | 'red'
  schedule: {
    step: number
    price: number
    scheduledFor: string
    status: string
  }[] | null
  override: {
    targetType: string | null
    targetValue: number | null
    maxRaisePercent: number | null
  } | null
}

// Calculate profit for a given price
function calculateProfit(
  price: number,
  cost: number,
  packagingCost: number,
  tariffPercent: number,
  fbaFee: number,
  referralFeePercent: number,
  refundPercent: number,
  adsPercent: number
): { profit: number; profitPercent: number } {
  const totalCost = cost + packagingCost + (cost * tariffPercent / 100)
  const referralFee = price * referralFeePercent / 100
  const refundCost = price * refundPercent / 100
  const adsCost = price * adsPercent / 100
  
  const profit = price - totalCost - fbaFee - referralFee - refundCost - adsCost
  const profitPercent = price > 0 ? (profit / price) * 100 : 0
  
  return { profit, profitPercent }
}

// Round up to nearest .99 or .49
function roundToNinetyNine(price: number): number {
  const base = Math.floor(price)
  const decimal = price - base
  
  if (decimal <= 0.49) {
    return base + 0.49
  } else {
    return base + 0.99
  }
}

// Calculate target price to achieve desired profit
function calculateTargetPrice(
  cost: number,
  packagingCost: number,
  tariffPercent: number,
  fbaFee: number,
  referralFeePercent: number,
  refundPercent: number,
  adsPercent: number,
  targetType: string,
  targetValue: number
): number {
  const totalCost = cost + packagingCost + (cost * tariffPercent / 100)
  
  if (targetType === 'dollar') {
    // Target profit is a fixed dollar amount
    // price - totalCost - fbaFee - (price * referralFee%) - (price * refund%) - (price * ads%) = targetProfit
    // price * (1 - referralFee% - refund% - ads%) = targetProfit + totalCost + fbaFee
    const feeMultiplier = 1 - (referralFeePercent / 100) - (refundPercent / 100) - (adsPercent / 100)
    const rawPrice = (targetValue + totalCost + fbaFee) / feeMultiplier
    return roundToNinetyNine(rawPrice)
  } else {
    // Target profit is a margin percentage
    // profit / price = targetPercent / 100
    // profit = price * targetPercent / 100
    // price - totalCost - fbaFee - (price * referralFee%) - (price * refund%) - (price * ads%) = price * targetPercent / 100
    // price * (1 - referralFee% - refund% - ads% - targetPercent%) = totalCost + fbaFee
    const feeMultiplier = 1 - (referralFeePercent / 100) - (refundPercent / 100) - (adsPercent / 100) - (targetValue / 100)
    if (feeMultiplier <= 0) {
      // Impossible target, return a high price
      return roundToNinetyNine(totalCost + fbaFee + 100)
    }
    const rawPrice = (totalCost + fbaFee) / feeMultiplier
    return roundToNinetyNine(rawPrice)
  }
}

export async function GET() {
  try {
    // Get global settings (with fallback if table doesn't exist)
    let settings = {
      targetType: 'dollar' as string,
      targetValue: 5,
      maxRaisePercent: 8
    }
    
    try {
      const globalSettings = await prisma.pricingSettings.findFirst()
      if (globalSettings) {
        settings = {
          targetType: globalSettings.targetType || 'dollar',
          targetValue: Number(globalSettings.targetValue || 5),
          maxRaisePercent: Number(globalSettings.maxRaisePercent || 8)
        }
      }
    } catch (e) {
      // Table might not exist yet, use defaults
      console.log('PricingSettings not available, using defaults')
    }

    // Get all products with their costs (excluding hidden, discontinued, and parent items)
    // Only show child SKUs, not parent products
    const products = await prisma.product.findMany({
      where: {
        isHidden: false,
        isParent: false, // Only show child SKUs, not parents
        status: { notIn: ['discontinued', 'hidden'] },
        // Exclude products whose parent is hidden
        OR: [
          { parentSku: null }, // No parent (standalone products)
          { parent: { isHidden: false } } // Parent is not hidden
        ]
      },
      select: {
        sku: true,
        title: true,
        asin: true,
        price: true,
        cost: true,
        packagingCost: true,
        tariffPercent: true,
        fbaFeeEstimate: true,
        referralFeePercent: true,
        refundPercent: true,
        adsPercent: true,
      }
    })

    // Get per-SKU overrides (with fallback)
    let overrideMap = new Map<string, any>()
    try {
      const overrides = await prisma.pricingOverride.findMany()
      overrideMap = new Map(overrides.map(o => [o.sku, o]))
    } catch (e) {
      console.log('PricingOverride not available')
    }

    // Get price schedules (with fallback)
    const scheduleMap = new Map<string, any[]>()
    try {
      const schedules = await prisma.priceSchedule.findMany({
        where: { status: 'pending' },
        orderBy: [{ sku: 'asc' }, { stepNumber: 'asc' }]
      })
      schedules.forEach(s => {
        if (!scheduleMap.has(s.sku)) {
          scheduleMap.set(s.sku, [])
        }
        scheduleMap.get(s.sku)!.push(s)
      })
    } catch (e) {
      console.log('PriceSchedule not available')
    }

    // Get recent orders for each product (last 5)
    const recentOrders = await prisma.$queryRaw<{
      master_sku: string
      purchase_date: Date
      item_price: number
      quantity: number
      fba_fee: number
      referral_fee: number
      other_fees: number
    }[]>`
      SELECT 
        oi.master_sku,
        o.purchase_date,
        oi.item_price::numeric,
        oi.quantity,
        COALESCE(oi.fba_fee, 0)::numeric as fba_fee,
        COALESCE(oi.referral_fee, 0)::numeric as referral_fee,
        COALESCE(oi.other_fees, 0)::numeric as other_fees
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'cancelled'
      ORDER BY o.purchase_date DESC
    `

    // Group orders by SKU (last 5 each)
    const ordersBySku = new Map<string, typeof recentOrders>()
    recentOrders.forEach(order => {
      const sku = order.master_sku
      if (!ordersBySku.has(sku)) {
        ordersBySku.set(sku, [])
      }
      const orders = ordersBySku.get(sku)!
      if (orders.length < 5) {
        orders.push(order)
      }
    })

    // Build pricing items
    const pricingItems: PricingItem[] = products.map(product => {
      const override = overrideMap.get(product.sku)
      const effectiveTargetType = override?.targetType || settings.targetType
      const effectiveTargetValue = override?.targetValue ? Number(override.targetValue) : settings.targetValue
      const effectiveMaxRaise = override?.maxRaisePercent ? Number(override.maxRaisePercent) : settings.maxRaisePercent

      const cost = Number(product.cost || 0)
      const packagingCost = Number(product.packagingCost || 0)
      const tariffPercent = Number(product.tariffPercent || 0)
      const fbaFee = Number(product.fbaFeeEstimate || 0)
      const referralFeePercent = Number(product.referralFeePercent || 15)
      const refundPercent = Number(product.refundPercent || 2)
      const adsPercent = Number(product.adsPercent || 0)
      const currentPrice = Number(product.price || 0)

      const totalCost = cost + packagingCost + (cost * tariffPercent / 100)

      // Calculate current profit
      const { profit: currentProfit, profitPercent: currentProfitPercent } = calculateProfit(
        currentPrice, cost, packagingCost, tariffPercent, fbaFee, referralFeePercent, refundPercent, adsPercent
      )

      // Calculate target price
      const targetPrice = calculateTargetPrice(
        cost, packagingCost, tariffPercent, fbaFee, referralFeePercent, refundPercent, adsPercent,
        effectiveTargetType, effectiveTargetValue
      )

      // Calculate profit at target
      const { profit: profitAtTarget, profitPercent: profitPercentAtTarget } = calculateProfit(
        targetPrice, cost, packagingCost, tariffPercent, fbaFee, referralFeePercent, refundPercent, adsPercent
      )

      // Process recent orders
      const skuOrders = ordersBySku.get(product.sku) || []
      const recentOrdersProcessed = skuOrders.map(order => {
        const pricePerUnit = Number(order.item_price) / order.quantity
        const feesPerUnit = (Number(order.fba_fee) + Number(order.referral_fee) + Number(order.other_fees)) / order.quantity
        const orderProfit = pricePerUnit - totalCost - feesPerUnit - (pricePerUnit * refundPercent / 100) - (pricePerUnit * adsPercent / 100)
        
        return {
          date: order.purchase_date.toISOString().split('T')[0],
          price: pricePerUnit,
          profit: orderProfit,
          profitPercent: pricePerUnit > 0 ? (orderProfit / pricePerUnit) * 100 : 0
        }
      })

      const avgRecentProfit = recentOrdersProcessed.length > 0
        ? recentOrdersProcessed.reduce((sum, o) => sum + o.profit, 0) / recentOrdersProcessed.length
        : currentProfit

      const avgRecentProfitPercent = recentOrdersProcessed.length > 0
        ? recentOrdersProcessed.reduce((sum, o) => sum + o.profitPercent, 0) / recentOrdersProcessed.length
        : currentProfitPercent

      // Determine status based on target
      let status: 'green' | 'yellow' | 'red'
      if (effectiveTargetType === 'dollar') {
        if (avgRecentProfit >= effectiveTargetValue * 1.05) status = 'green'
        else if (avgRecentProfit >= effectiveTargetValue * 0.95) status = 'yellow'
        else status = 'red'
      } else {
        if (avgRecentProfitPercent >= effectiveTargetValue * 1.05) status = 'green'
        else if (avgRecentProfitPercent >= effectiveTargetValue * 0.95) status = 'yellow'
        else status = 'red'
      }

      // Get schedule
      const skuSchedule = scheduleMap.get(product.sku)
      const schedule = skuSchedule?.map(s => ({
        step: s.stepNumber,
        price: Number(s.targetPrice),
        scheduledFor: s.scheduledFor.toISOString().split('T')[0],
        status: s.status
      })) || null

      return {
        sku: product.sku,
        title: product.title,
        asin: product.asin,
        currentPrice,
        cost,
        totalCost,
        fbaFee,
        referralFee: currentPrice * referralFeePercent / 100,
        refundPercent,
        adsPercent,
        recentOrders: recentOrdersProcessed,
        avgRecentProfit,
        avgRecentProfitPercent,
        targetPrice,
        profitAtTarget,
        profitPercentAtTarget,
        status,
        schedule,
        override: override ? {
          targetType: override.targetType,
          targetValue: override.targetValue ? Number(override.targetValue) : null,
          maxRaisePercent: override.maxRaisePercent ? Number(override.maxRaisePercent) : null
        } : null
      }
    })

    // Sort by furthest below target (red items first)
    pricingItems.sort((a, b) => {
      const statusOrder = { red: 0, yellow: 1, green: 2 }
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status]
      }
      // Within same status, sort by profit gap
      return a.avgRecentProfit - b.avgRecentProfit
    })

    return NextResponse.json({
      success: true,
      settings,
      items: pricingItems
    })
  } catch (error: any) {
    console.error('Pricing API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

