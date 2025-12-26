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

// Round UP to nearest .99 or .49 - ensures price meets or exceeds target
function roundToNinetyNine(price: number): number {
  const base = Math.floor(price)
  const decimal = price - base

  // Use small epsilon for floating point comparison
  const EPSILON = 0.001

  // If decimal is at or below .49 (with epsilon), round up to .49
  // If decimal is above .49, round up to .99
  if (decimal <= 0.49 + EPSILON) {
    // But if decimal is almost exactly .49, just return .49
    // If decimal is tiny (like 0.001), we still need .49 to exceed target
    return base + 0.49
  } else {
    return base + 0.99
  }
}

// Calculate multi-step schedule if target exceeds max raise %
function calculateMultiStepSchedule(
  currentPrice: number,
  targetPrice: number,
  maxRaisePercent: number
): { step: number; price: number; scheduledFor: string }[] | null {
  if (currentPrice <= 0 || targetPrice <= currentPrice) return null
  
  // Calculate max allowed price increase per step
  const maxIncrease = currentPrice * maxRaisePercent / 100
  const totalIncrease = targetPrice - currentPrice
  
  // If total increase is within max raise %, no schedule needed
  if (totalIncrease <= maxIncrease) return null
  
  // Calculate number of steps needed
  const steps: { step: number; price: number; scheduledFor: string }[] = []
  let price = currentPrice
  let stepNum = 1
  const today = new Date()
  
  while (price < targetPrice) {
    // Calculate next step price
    const nextPrice = price * (1 + maxRaisePercent / 100)
    const roundedPrice = roundToNinetyNine(nextPrice)
    
    // If this step would exceed target, use target price for final step
    const finalPrice = roundedPrice >= targetPrice ? roundToNinetyNine(targetPrice) : roundedPrice
    
    // Calculate date (stepNum weeks from now)
    const stepDate = new Date(today)
    stepDate.setDate(stepDate.getDate() + (stepNum - 1) * 7)
    
    steps.push({
      step: stepNum,
      price: finalPrice,
      scheduledFor: stepDate.toISOString().split('T')[0]
    })
    
    if (finalPrice >= targetPrice) break
    
    price = roundedPrice
    stepNum++
    
    // Safety limit to prevent infinite loops
    if (stepNum > 20) break
  }
  
  return steps.length > 0 ? steps : null
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Check for query params (override from frontend)
    const queryTargetType = searchParams.get('targetType')
    const queryTargetValue = searchParams.get('targetValue')
    const queryMaxRaise = searchParams.get('maxRaisePercent')
    
    // Get global settings (with fallback if table doesn't exist)
    let settings = {
      targetType: 'dollar' as string,
      targetValue: 5,
      maxRaisePercent: 8
    }
    
    // If query params provided, use those (allows immediate application of changes)
    if (queryTargetType || queryTargetValue || queryMaxRaise) {
      settings = {
        targetType: queryTargetType || 'dollar',
        targetValue: queryTargetValue ? parseFloat(queryTargetValue) : 5,
        maxRaisePercent: queryMaxRaise ? parseFloat(queryMaxRaise) : 8
      }
    } else {
      // Try to read from database
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

    // Get latest PO unit costs as fallback for products with $0 cost
    const poCosts = await prisma.$queryRaw<{ master_sku: string, unit_cost: number }[]>`
      SELECT DISTINCT ON (poi.master_sku) 
        poi.master_sku, 
        poi.unit_cost::numeric
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE po.status NOT IN ('cancelled')
      ORDER BY poi.master_sku, po.created_at DESC
    `
    const poCostMap = new Map(poCosts.map(p => [p.master_sku, Number(p.unit_cost)]))

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

      // Use product cost, fallback to latest PO unit cost if $0
      let cost = Number(product.cost || 0)
      if (cost === 0) {
        cost = poCostMap.get(product.sku) || 0
      }
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
      const recentOrdersProcessed = skuOrders
        .filter(order => order.item_price && order.item_price > 0) // Filter out orders with no price
        .map(order => {
          const pricePerUnit = Number(order.item_price) / order.quantity
          const feesPerUnit = (Number(order.fba_fee || 0) + Number(order.referral_fee || 0) + Number(order.other_fees || 0)) / order.quantity
          const orderProfit = pricePerUnit - totalCost - feesPerUnit - (pricePerUnit * refundPercent / 100) - (pricePerUnit * adsPercent / 100)
          
          return {
            date: order.purchase_date.toISOString().split('T')[0],
            price: pricePerUnit,
            profit: orderProfit,
            profitPercent: pricePerUnit > 0 ? (orderProfit / pricePerUnit) * 100 : 0
          }
        })

      // Filter out any NaN values and calculate averages
      const validProfits = recentOrdersProcessed.filter(o => !isNaN(o.profit) && o.profit !== null)
      const avgRecentProfit = validProfits.length > 0
        ? validProfits.reduce((sum, o) => sum + o.profit, 0) / validProfits.length
        : currentProfit

      const validProfitPercents = recentOrdersProcessed.filter(o => !isNaN(o.profitPercent) && o.profitPercent !== null)
      const avgRecentProfitPercent = validProfitPercents.length > 0
        ? validProfitPercents.reduce((sum, o) => sum + o.profitPercent, 0) / validProfitPercents.length
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

      // Get schedule - first check for existing saved schedule, then calculate proposed schedule
      const skuSchedule = scheduleMap.get(product.sku)
      let schedule: { step: number; price: number; scheduledFor: string; status?: string }[] | null = null
      
      if (skuSchedule && skuSchedule.length > 0) {
        // Use saved schedule from database
        schedule = skuSchedule.map(s => ({
          step: s.stepNumber,
          price: Number(s.targetPrice),
          scheduledFor: s.scheduledFor.toISOString().split('T')[0],
          status: s.status
        }))
      } else if (targetPrice > currentPrice) {
        // Calculate proposed multi-step schedule if needed
        schedule = calculateMultiStepSchedule(currentPrice, targetPrice, effectiveMaxRaise)
      }

      // Calculate all fee breakdowns based on current price
      const referralFeeAmount = currentPrice * referralFeePercent / 100
      const refundCostAmount = currentPrice * refundPercent / 100
      const adsCostAmount = currentPrice * adsPercent / 100
      const tariffAmount = cost * tariffPercent / 100

      return {
        sku: product.sku,
        title: product.title,
        asin: product.asin,
        currentPrice,
        cost,
        totalCost,
        fbaFee,
        referralFee: referralFeeAmount,
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
        } : null,
        // Detailed breakdown for collapsible view
        breakdown: {
          revenue: currentPrice,
          productCost: cost,
          packagingCost: packagingCost,
          tariffPercent: tariffPercent,
          tariffAmount: tariffAmount,
          totalCOGS: totalCost,
          fbaFee: fbaFee,
          referralFeePercent: referralFeePercent,
          referralFeeAmount: referralFeeAmount,
          refundPercent: refundPercent,
          refundCostAmount: refundCostAmount,
          adsPercent: adsPercent,
          adsCostAmount: adsCostAmount,
          totalFees: fbaFee + referralFeeAmount + refundCostAmount + adsCostAmount,
          grossProfit: currentPrice - totalCost,
          netProfit: currentPrice - totalCost - fbaFee - referralFeeAmount - refundCostAmount - adsCostAmount,
          netMargin: currentPrice > 0 ? ((currentPrice - totalCost - fbaFee - referralFeeAmount - refundCostAmount - adsCostAmount) / currentPrice) * 100 : 0
        }
      }
    })

    // Sort by furthest below target (red items first)
    // Calculate gap from target for proper sorting
    pricingItems.sort((a, b) => {
      const statusOrder = { red: 0, yellow: 1, green: 2 }
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status]
      }
      // Within same status, sort by gap from target (largest gap first)
      // Gap = target - actual (positive means below target)
      const aGap = a.profitAtTarget - a.avgRecentProfit
      const bGap = b.profitAtTarget - b.avgRecentProfit
      return bGap - aGap // Larger gaps first
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

