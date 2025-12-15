/**
 * Forecasting Reports API
 *
 * Endpoints for generating forecasting reports and KPIs
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSystemHealth,
  getSafetyStockSummary,
  getNewItemSummary,
  getAnomalySummary,
  generateAccuracyReport,
} from '@/lib/forecasting'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const days = parseInt(searchParams.get('days') || '30')

    switch (action) {
      case 'weekly-summary':
        const weeklySummary = await generateWeeklySummary()
        return NextResponse.json({
          success: true,
          data: weeklySummary,
        })

      case 'monthly-performance':
        const monthlyPerformance = await generateMonthlyPerformance(days)
        return NextResponse.json({
          success: true,
          data: monthlyPerformance,
        })

      case 'kpis':
        const kpis = await getKPIs()
        return NextResponse.json({
          success: true,
          data: kpis,
        })

      case 'supplier-scorecards':
        const scorecards = await getSupplierScorecards()
        return NextResponse.json({
          success: true,
          data: scorecards,
        })

      case 'dashboard':
        const dashboard = await getDashboardData()
        return NextResponse.json({
          success: true,
          data: dashboard,
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('Reports API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * Generate weekly summary report
 */
async function generateWeeklySummary() {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  // Get accuracy
  const accuracyRecords = await prisma.forecastAccuracy.findMany({
    where: {
      forecastDate: { gte: weekAgo },
      actualUnits: { gt: 0 },
    },
  })

  const avgAccuracy =
    accuracyRecords.length > 0
      ? (1 -
          accuracyRecords.reduce((sum, r) => sum + Number(r.percentageError), 0) /
            accuracyRecords.length) *
        100
      : 85

  // Get previous week for comparison
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const prevWeekAccuracy = await prisma.forecastAccuracy.findMany({
    where: {
      forecastDate: { gte: twoWeeksAgo, lt: weekAgo },
      actualUnits: { gt: 0 },
    },
  })

  const prevAvgAccuracy =
    prevWeekAccuracy.length > 0
      ? (1 -
          prevWeekAccuracy.reduce((sum, r) => sum + Number(r.percentageError), 0) /
            prevWeekAccuracy.length) *
        100
      : 85

  // Get SKUs requiring orders
  const inventory = await prisma.inventoryLevel.findMany({
    include: {
      product: {
        include: {
          supplier: true,
          salesVelocity: true,
        },
      },
    },
  })

  const skusRequiringOrders = inventory
    .filter((inv) => {
      const velocity = inv.product?.salesVelocity
        ? Number(inv.product.salesVelocity.velocity30d)
        : 0

      if (velocity <= 0) return false

      const totalInventory =
        (inv.fbaAvailable || 0) + (inv.fbaInbound || 0) + (inv.warehouseAvailable || 0)
      const daysOfSupply = totalInventory / velocity
      const leadTime = inv.product?.supplier?.leadTimeDays || 30

      return daysOfSupply <= leadTime + 14
    })
    .map((inv) => ({
      masterSku: inv.masterSku,
      urgency: 'high',
      daysOfSupply: Math.round(
        ((inv.fbaAvailable || 0) + (inv.fbaInbound || 0) + (inv.warehouseAvailable || 0)) /
          Number(inv.product?.salesVelocity?.velocity30d || 1)
      ),
    }))

  // Get upcoming events
  const seasonalEvents = await prisma.seasonalEvent.findMany({
    where: { isActive: true },
  })

  const today = new Date()
  const upcomingEvents = seasonalEvents
    .map((event) => {
      let eventDate = new Date(
        today.getFullYear(),
        event.startMonth - 1,
        event.startDay
      )

      if (eventDate < today) {
        eventDate = new Date(
          today.getFullYear() + 1,
          event.startMonth - 1,
          event.startDay
        )
      }

      const daysUntil = Math.ceil(
        (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )

      return {
        name: event.name,
        daysUntil,
        multiplier: Number(event.baseMultiplier),
      }
    })
    .filter((e) => e.daysUntil <= 45)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  // Get anomaly summary
  const anomalySummary = await getAnomalySummary()

  return {
    weekOf: new Date(),
    forecastAccuracy: {
      current: avgAccuracy.toFixed(1),
      previous: prevAvgAccuracy.toFixed(1),
      trend: avgAccuracy > prevAvgAccuracy ? 'improving' : avgAccuracy < prevAvgAccuracy ? 'declining' : 'stable',
    },
    skusRequiringOrders: {
      count: skusRequiringOrders.length,
      items: skusRequiringOrders.slice(0, 10),
    },
    upcomingEvents,
    anomalies: {
      count: anomalySummary.activeAnomalies,
      summary: anomalySummary.recommendedActions.map((a) => a.action),
    },
  }
}

/**
 * Generate monthly performance report
 */
async function generateMonthlyPerformance(days: number) {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const accuracyReport = await generateAccuracyReport(startDate, new Date())
  const safetyStockSummary = await getSafetyStockSummary()
  const newItemSummary = await getNewItemSummary()

  // Get stockout events
  const stockouts = await prisma.inventoryLevel.findMany({
    where: {
      OR: [{ fbaAvailable: 0 }, { warehouseAvailable: 0 }],
    },
  })

  // Get model performance
  const modelWeights = await prisma.modelWeight.findMany({
    orderBy: { overallMape: 'asc' },
  })

  return {
    period: {
      start: startDate,
      end: new Date(),
      days,
    },
    accuracy: {
      overall: ((1 - accuracyReport.overallMape) * 100).toFixed(1),
      byModel: accuracyReport.modelPerformance.map((m) => ({
        model: m.model,
        accuracy: ((1 - m.mape) * 100).toFixed(1),
        skuCount: m.sampleSize,
      })),
      bestSkus: accuracyReport.topAccuracySkus.slice(0, 5),
      worstSkus: accuracyReport.worstAccuracySkus.slice(0, 5),
    },
    inventory: {
      stockoutCount: stockouts.length,
      stockoutRate:
        ((stockouts.length / (await prisma.product.count({ where: { isHidden: false } }))) * 100).toFixed(1),
    },
    safetyStock: safetyStockSummary,
    newItems: newItemSummary,
    modelOptimization: {
      totalSkus: modelWeights.length,
      avgMape:
        modelWeights.length > 0
          ? (
              modelWeights.reduce((sum, m) => sum + Number(m.overallMape || 0), 0) /
              modelWeights.length *
              100
            ).toFixed(1)
          : 'N/A',
    },
  }
}

/**
 * Get KPI metrics
 */
async function getKPIs() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // 1. Forecast accuracy (MAPE)
  const accuracyRecords = await prisma.forecastAccuracy.findMany({
    where: {
      forecastDate: { gte: thirtyDaysAgo },
      actualUnits: { gt: 0 },
    },
  })

  const forecastAccuracy =
    accuracyRecords.length > 0
      ? (1 -
          accuracyRecords.reduce((sum, r) => sum + Number(r.percentageError), 0) /
            accuracyRecords.length) *
        100
      : 85

  // 2. Stockout prevention rate
  const totalProducts = await prisma.product.count({ where: { isHidden: false } })
  const stockedOutProducts = await prisma.inventoryLevel.count({
    where: {
      fbaAvailable: 0,
      warehouseAvailable: 0,
    },
  })
  const stockoutRate = totalProducts > 0 ? (stockedOutProducts / totalProducts) * 100 : 0

  // 3. Inventory turnover (simplified)
  const totalInventoryValue = await prisma.inventoryLevel.findMany({
    include: { product: true },
  })

  let inventoryValue = 0
  for (const inv of totalInventoryValue) {
    const total =
      (inv.fbaAvailable || 0) + (inv.fbaInbound || 0) + (inv.warehouseAvailable || 0)
    inventoryValue += total * Number(inv.product?.cost || 0)
  }

  // 4. Average reorder lead time
  const avgLeadTime = await prisma.supplierPerformance.aggregate({
    _avg: { avgActualLeadTimeDays: true },
  })

  // 5. Manual override rate (would need to track this)
  const manualOverrideRate = 5 // Placeholder

  return {
    forecastAccuracy: {
      value: forecastAccuracy.toFixed(1),
      target: 85,
      unit: '%',
      status: forecastAccuracy >= 85 ? 'good' : forecastAccuracy >= 75 ? 'warning' : 'critical',
    },
    stockoutPreventionRate: {
      value: (100 - stockoutRate).toFixed(1),
      target: 98,
      unit: '%',
      status: stockoutRate <= 2 ? 'good' : stockoutRate <= 5 ? 'warning' : 'critical',
    },
    inventoryValue: {
      value: inventoryValue.toFixed(0),
      unit: '$',
    },
    avgLeadTime: {
      value: Number(avgLeadTime._avg.avgActualLeadTimeDays || 30).toFixed(0),
      unit: 'days',
    },
    manualOverrideRate: {
      value: manualOverrideRate.toFixed(1),
      target: 10,
      unit: '%',
      status: manualOverrideRate <= 10 ? 'good' : 'warning',
    },
  }
}

/**
 * Get supplier scorecards
 */
async function getSupplierScorecards() {
  const suppliers = await prisma.supplier.findMany({
    where: { status: 'active' },
    include: { performance: true },
  })

  return suppliers.map((supplier) => {
    const perf = supplier.performance

    let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'C'
    const score = perf ? Number(perf.reliabilityScore) * 100 : 50

    if (score >= 90) grade = 'A'
    else if (score >= 80) grade = 'B'
    else if (score >= 70) grade = 'C'
    else if (score >= 60) grade = 'D'
    else grade = 'F'

    return {
      id: supplier.id,
      name: supplier.name,
      grade,
      metrics: {
        reliabilityScore: score.toFixed(0),
        onTimeRate: perf ? (Number(perf.onTimeRate) * 100).toFixed(0) : 'N/A',
        avgLeadTime: perf ? Number(perf.avgActualLeadTimeDays).toFixed(0) : supplier.leadTimeDays || 30,
        statedLeadTime: perf ? perf.statedLeadTimeDays : supplier.leadTimeDays || 30,
        leadTimeVariance: perf ? Number(perf.leadTimeVariance).toFixed(1) : 'N/A',
      },
      poCount: perf?.poCount || 0,
    }
  })
}

/**
 * Get dashboard data
 */
async function getDashboardData() {
  const [health, kpis, weeklySummary, anomalySummary] = await Promise.all([
    getSystemHealth(),
    getKPIs(),
    generateWeeklySummary(),
    getAnomalySummary(),
  ])

  return {
    health,
    kpis,
    weeklySummary,
    anomalies: anomalySummary,
    lastUpdated: new Date(),
  }
}
