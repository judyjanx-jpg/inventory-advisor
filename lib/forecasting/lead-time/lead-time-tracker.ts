/**
 * Lead Time Management System
 *
 * Tracks three types of lead times per supplier:
 * - Stated lead time (what supplier promises)
 * - Average actual lead time (calculated from PO history)
 * - Worst-case lead time (95th percentile)
 *
 * Also tracks FBA receiving times and alerts on reliability degradation.
 */

import { prisma } from '@/lib/prisma'
import { LeadTimeData, LeadTimeAlert, AlertSeverity } from '../types'

/**
 * Calculate and update supplier lead time performance
 */
export async function updateSupplierPerformance(
  supplierId: number
): Promise<LeadTimeData | null> {
  // Get supplier info
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  })

  if (!supplier) return null

  // Get completed POs for this supplier
  const completedPOs = await prisma.purchaseOrder.findMany({
    where: {
      supplierId,
      status: 'received',
      actualArrivalDate: { not: null },
      orderDate: { not: null },
    },
    orderBy: { actualArrivalDate: 'desc' },
    take: 100, // Last 100 POs for calculation
  })

  if (completedPOs.length < 3) {
    // Not enough data
    return {
      supplierId,
      supplierName: supplier.name,
      statedLeadTime: supplier.leadTimeDays || 30,
      avgActualLeadTime: supplier.leadTimeDays || 30,
      worstCaseLeadTime: (supplier.leadTimeDays || 30) * 1.5,
      onTimeRate: 1.0,
      leadTimeVariance: 0,
      reliabilityScore: 0.5,
      avgFbaReceivingTime: 10,
      worstCaseFbaReceivingTime: 14,
      isGettingWorse: false,
      trendPercent: 0,
      poCount: completedPOs.length,
      lastCalculated: new Date(),
    }
  }

  // Calculate lead times
  const leadTimes: number[] = []

  for (const po of completedPOs) {
    if (po.orderDate && po.actualArrivalDate) {
      const diffDays = Math.ceil(
        (po.actualArrivalDate.getTime() - po.orderDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )
      leadTimes.push(diffDays)
    }
  }

  // Calculate statistics
  const avgActualLeadTime =
    leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length

  // Sort for percentile calculation
  const sortedLeadTimes = [...leadTimes].sort((a, b) => a - b)
  const p95Index = Math.ceil(sortedLeadTimes.length * 0.95) - 1
  const worstCaseLeadTime = sortedLeadTimes[p95Index] || avgActualLeadTime * 1.5

  // Calculate variance
  const variance =
    leadTimes.reduce((sum, lt) => sum + (lt - avgActualLeadTime) ** 2, 0) /
    leadTimes.length
  const leadTimeVariance = Math.sqrt(variance)

  // Calculate on-time rate
  const statedLeadTime = supplier.leadTimeDays || 30
  const onTimeCount = leadTimes.filter((lt) => lt <= statedLeadTime).length
  const onTimeRate = onTimeCount / leadTimes.length

  // Calculate reliability score (0-1)
  // Based on: on-time rate, variance, and consistency
  const varianceScore = Math.max(0, 1 - leadTimeVariance / statedLeadTime)
  const reliabilityScore = onTimeRate * 0.5 + varianceScore * 0.5

  // Check for trend (is lead time getting worse?)
  const recentLeadTimes = leadTimes.slice(0, Math.min(10, leadTimes.length))
  const olderLeadTimes = leadTimes.slice(10, 20)

  let trendPercent = 0
  let isGettingWorse = false

  if (olderLeadTimes.length >= 5) {
    const recentAvg =
      recentLeadTimes.reduce((a, b) => a + b, 0) / recentLeadTimes.length
    const olderAvg =
      olderLeadTimes.reduce((a, b) => a + b, 0) / olderLeadTimes.length

    trendPercent = ((recentAvg - olderAvg) / olderAvg) * 100
    isGettingWorse = trendPercent > 10 // More than 10% increase
  }

  // Update database
  await prisma.supplierPerformance.upsert({
    where: { supplierId },
    create: {
      supplierId,
      statedLeadTimeDays: statedLeadTime,
      avgActualLeadTimeDays: avgActualLeadTime,
      worstCaseLeadTimeDays: worstCaseLeadTime,
      onTimeRate,
      leadTimeVariance,
      reliabilityScore,
      poCount: completedPOs.length,
      lastCalculated: new Date(),
    },
    update: {
      statedLeadTimeDays: statedLeadTime,
      avgActualLeadTimeDays: avgActualLeadTime,
      worstCaseLeadTimeDays: worstCaseLeadTime,
      onTimeRate,
      leadTimeVariance,
      reliabilityScore,
      poCount: completedPOs.length,
      lastCalculated: new Date(),
    },
  })

  // Also update the supplier record
  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      avgActualLeadTime: avgActualLeadTime,
      onTimeRate,
    },
  })

  // Get FBA receiving times
  const fbaReceivingData = await calculateFbaReceivingTimes()

  return {
    supplierId,
    supplierName: supplier.name,
    statedLeadTime,
    avgActualLeadTime,
    worstCaseLeadTime,
    onTimeRate,
    leadTimeVariance,
    reliabilityScore,
    avgFbaReceivingTime: fbaReceivingData.avg,
    worstCaseFbaReceivingTime: fbaReceivingData.worst,
    isGettingWorse,
    trendPercent,
    poCount: completedPOs.length,
    lastCalculated: new Date(),
  }
}

/**
 * Calculate FBA receiving times from shipment history
 */
async function calculateFbaReceivingTimes(): Promise<{
  avg: number
  worst: number
}> {
  // Get completed FBA shipments
  try {
    const shipments = await prisma.shipment.findMany({
      where: {
        destination: 'fba',
        status: 'received',
        actualDeliveryDate: { not: null },
        shippedDate: { not: null },
      },
      orderBy: { actualDeliveryDate: 'desc' },
      take: 50,
    })

    if (shipments.length < 5) {
      return { avg: 10, worst: 14 } // Default
    }

    const receivingTimes: number[] = []

    for (const shipment of shipments) {
      if (shipment.shippedDate && shipment.actualDeliveryDate) {
        const diffDays = Math.ceil(
          (shipment.actualDeliveryDate.getTime() -
            shipment.shippedDate.getTime()) /
            (1000 * 60 * 60 * 24)
        )
        receivingTimes.push(diffDays)
      }
    }

    const avg =
      receivingTimes.reduce((a, b) => a + b, 0) / receivingTimes.length

    const sorted = [...receivingTimes].sort((a, b) => a - b)
    const p95Index = Math.ceil(sorted.length * 0.95) - 1
    const worst = sorted[p95Index] || avg * 1.5

    return { avg, worst }
  } catch (error) {
    return { avg: 10, worst: 14 } // Default if table doesn't exist
  }
}

/**
 * Get lead time data for a specific supplier
 */
export async function getSupplierLeadTime(
  supplierId: number
): Promise<LeadTimeData | null> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      performance: true,
    },
  })

  if (!supplier) return null

  const performance = supplier.performance

  if (!performance) {
    // Calculate if not exists
    return await updateSupplierPerformance(supplierId)
  }

  const fbaReceivingData = await calculateFbaReceivingTimes()

  // Check for trend
  const recentPOs = await prisma.purchaseOrder.findMany({
    where: {
      supplierId,
      status: 'received',
      actualArrivalDate: { not: null },
      orderDate: { not: null },
    },
    orderBy: { actualArrivalDate: 'desc' },
    take: 20,
  })

  const leadTimes = recentPOs
    .filter((po) => po.orderDate && po.actualArrivalDate)
    .map((po) =>
      Math.ceil(
        (po.actualArrivalDate!.getTime() - po.orderDate!.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    )

  const recentLeadTimes = leadTimes.slice(0, 10)
  const olderLeadTimes = leadTimes.slice(10, 20)

  let trendPercent = 0
  let isGettingWorse = false

  if (olderLeadTimes.length >= 5) {
    const recentAvg =
      recentLeadTimes.reduce((a, b) => a + b, 0) / recentLeadTimes.length
    const olderAvg =
      olderLeadTimes.reduce((a, b) => a + b, 0) / olderLeadTimes.length

    trendPercent = ((recentAvg - olderAvg) / olderAvg) * 100
    isGettingWorse = trendPercent > 10
  }

  return {
    supplierId,
    supplierName: supplier.name,
    statedLeadTime: performance.statedLeadTimeDays,
    avgActualLeadTime: Number(performance.avgActualLeadTimeDays),
    worstCaseLeadTime: Number(performance.worstCaseLeadTimeDays),
    onTimeRate: Number(performance.onTimeRate),
    leadTimeVariance: Number(performance.leadTimeVariance),
    reliabilityScore: Number(performance.reliabilityScore),
    avgFbaReceivingTime: fbaReceivingData.avg,
    worstCaseFbaReceivingTime: fbaReceivingData.worst,
    isGettingWorse,
    trendPercent,
    poCount: performance.poCount,
    lastCalculated: performance.lastCalculated,
  }
}

/**
 * Get effective lead time for forecasting
 * Uses actual lead times, not stated
 */
export async function getEffectiveLeadTime(
  supplierId: number,
  useWorstCase: boolean = false
): Promise<number> {
  const leadTimeData = await getSupplierLeadTime(supplierId)

  if (!leadTimeData) {
    return 30 // Default
  }

  if (useWorstCase) {
    return Math.ceil(leadTimeData.worstCaseLeadTime)
  }

  // Use average actual, but bump up if reliability is poor
  let effectiveLeadTime = leadTimeData.avgActualLeadTime

  if (leadTimeData.reliabilityScore < 0.7) {
    // Poor reliability - use more conservative estimate
    effectiveLeadTime =
      leadTimeData.avgActualLeadTime * 0.5 +
      leadTimeData.worstCaseLeadTime * 0.5
  }

  return Math.ceil(effectiveLeadTime)
}

/**
 * Get total lead time including FBA receiving
 */
export async function getTotalLeadTime(
  supplierId: number,
  includeBuffer: boolean = true
): Promise<{
  supplierLeadTime: number
  fbaReceivingTime: number
  bufferDays: number
  totalLeadTime: number
}> {
  const leadTimeData = await getSupplierLeadTime(supplierId)
  const fbaData = await calculateFbaReceivingTimes()

  const supplierLeadTime = leadTimeData?.avgActualLeadTime || 30
  const fbaReceivingTime = fbaData.avg
  const bufferDays = includeBuffer ? 3 : 0

  return {
    supplierLeadTime: Math.ceil(supplierLeadTime),
    fbaReceivingTime: Math.ceil(fbaReceivingTime),
    bufferDays,
    totalLeadTime: Math.ceil(supplierLeadTime + fbaReceivingTime + bufferDays),
  }
}

/**
 * Check for supplier reliability alerts
 */
export async function checkSupplierReliabilityAlerts(): Promise<LeadTimeAlert[]> {
  const alerts: LeadTimeAlert[] = []

  const suppliers = await prisma.supplier.findMany({
    where: { status: 'active' },
    include: { performance: true },
  })

  for (const supplier of suppliers) {
    if (!supplier.performance) continue

    const performance = supplier.performance
    const statedLeadTime = performance.statedLeadTimeDays
    const actualLeadTime = Number(performance.avgActualLeadTimeDays)
    const reliabilityScore = Number(performance.reliabilityScore)
    const leadTimeVariance = Number(performance.leadTimeVariance)

    // Alert 1: Average lead time significantly exceeds stated
    if (actualLeadTime > statedLeadTime * 1.3) {
      const severity: AlertSeverity =
        actualLeadTime > statedLeadTime * 1.5 ? 'high' : 'medium'

      alerts.push({
        supplierId: supplier.id,
        supplierName: supplier.name,
        alertType: 'avg_increase',
        severity,
        message: `Average lead time (${actualLeadTime.toFixed(
          0
        )} days) exceeds stated (${statedLeadTime} days) by ${Math.round(
          ((actualLeadTime - statedLeadTime) / statedLeadTime) * 100
        )}%`,
        previousValue: statedLeadTime,
        currentValue: actualLeadTime,
        recommendedAction:
          'Increase safety stock or negotiate better terms with supplier',
      })
    }

    // Alert 2: High variance in lead times
    if (leadTimeVariance > statedLeadTime * 0.3) {
      alerts.push({
        supplierId: supplier.id,
        supplierName: supplier.name,
        alertType: 'variance_increase',
        severity: 'medium',
        message: `Lead time variance is high (±${leadTimeVariance.toFixed(
          1
        )} days), making forecasting unreliable`,
        previousValue: 0,
        currentValue: leadTimeVariance,
        recommendedAction: 'Increase safety stock to account for variability',
      })
    }

    // Alert 3: Low reliability score
    if (reliabilityScore < 0.6) {
      alerts.push({
        supplierId: supplier.id,
        supplierName: supplier.name,
        alertType: 'reliability_drop',
        severity: reliabilityScore < 0.4 ? 'high' : 'medium',
        message: `Supplier reliability score is ${(
          reliabilityScore * 100
        ).toFixed(0)}% (target: >70%)`,
        previousValue: 0.7,
        currentValue: reliabilityScore,
        recommendedAction:
          'Consider backup suppliers or significantly increase safety stock',
      })
    }
  }

  return alerts
}

/**
 * Record a PO arrival for lead time tracking
 */
export async function recordPOArrival(
  poId: number,
  actualArrivalDate: Date
): Promise<void> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
  })

  if (!po || !po.orderDate) return

  // Update the PO
  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: {
      actualArrivalDate,
      status: 'received',
    },
  })

  // Recalculate supplier performance
  await updateSupplierPerformance(po.supplierId)
}

/**
 * Update all supplier performance metrics
 */
export async function updateAllSupplierPerformance(): Promise<{
  updated: number
  alerts: LeadTimeAlert[]
}> {
  const suppliers = await prisma.supplier.findMany({
    where: { status: 'active' },
  })

  let updated = 0

  for (const supplier of suppliers) {
    try {
      await updateSupplierPerformance(supplier.id)
      updated++
    } catch (error) {
      console.error(
        `Error updating performance for supplier ${supplier.id}:`,
        error
      )
    }
  }

  const alerts = await checkSupplierReliabilityAlerts()

  return { updated, alerts }
}

/**
 * Get supplier scorecard
 */
export async function getSupplierScorecard(supplierId: number): Promise<{
  supplier: {
    id: number
    name: string
  }
  leadTime: {
    stated: number
    actual: number
    worstCase: number
    trend: string
  }
  reliability: {
    score: number
    onTimeRate: number
    variance: number
  }
  recommendations: string[]
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}> {
  const leadTimeData = await getSupplierLeadTime(supplierId)

  if (!leadTimeData) {
    throw new Error('Supplier not found')
  }

  const recommendations: string[] = []

  // Generate recommendations
  if (leadTimeData.avgActualLeadTime > leadTimeData.statedLeadTime * 1.2) {
    recommendations.push(
      `Lead times are ${Math.round(
        ((leadTimeData.avgActualLeadTime - leadTimeData.statedLeadTime) /
          leadTimeData.statedLeadTime) *
          100
      )}% longer than stated - update forecasting parameters`
    )
  }

  if (leadTimeData.reliabilityScore < 0.7) {
    recommendations.push(
      'Low reliability - increase safety stock by 20-30%'
    )
  }

  if (leadTimeData.isGettingWorse) {
    recommendations.push(
      `Lead times trending worse (${leadTimeData.trendPercent.toFixed(
        0
      )}% increase) - monitor closely`
    )
  }

  if (leadTimeData.leadTimeVariance > 7) {
    recommendations.push(
      'High variability in lead times - maintain larger buffer stock'
    )
  }

  // Calculate grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F'
  const score = leadTimeData.reliabilityScore * 100

  if (score >= 90) grade = 'A'
  else if (score >= 80) grade = 'B'
  else if (score >= 70) grade = 'C'
  else if (score >= 60) grade = 'D'
  else grade = 'F'

  return {
    supplier: {
      id: supplierId,
      name: leadTimeData.supplierName,
    },
    leadTime: {
      stated: leadTimeData.statedLeadTime,
      actual: Math.round(leadTimeData.avgActualLeadTime),
      worstCase: Math.round(leadTimeData.worstCaseLeadTime),
      trend: leadTimeData.isGettingWorse
        ? `↑ ${leadTimeData.trendPercent.toFixed(0)}%`
        : 'Stable',
    },
    reliability: {
      score: Math.round(leadTimeData.reliabilityScore * 100),
      onTimeRate: Math.round(leadTimeData.onTimeRate * 100),
      variance: Math.round(leadTimeData.leadTimeVariance),
    },
    recommendations,
    grade,
  }
}
