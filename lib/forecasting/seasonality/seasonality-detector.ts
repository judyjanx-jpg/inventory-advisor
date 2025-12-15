/**
 * Seasonality Detection & Learning
 *
 * Automatically detects and learns seasonal patterns from historical data.
 * Supports yearly patterns, weekly patterns, and custom event detection.
 */

import { prisma } from '@/lib/prisma'
import {
  SalesDataPoint,
  SeasonalEvent,
  SeasonalEventType,
  SeasonalityPattern,
  DetectedSeasonality,
} from '../types'

interface LearnedMultiplier {
  eventId: number
  eventName: string
  baseMultiplier: number
  learnedMultiplier: number
  sampleYears: number
  confidence: number
}

/**
 * Detect seasonality patterns from historical sales data
 */
export async function detectSeasonality(
  masterSku: string,
  salesData: SalesDataPoint[]
): Promise<DetectedSeasonality> {
  if (salesData.length < 365) {
    // Not enough data for yearly seasonality detection
    return {
      hasSeasonality: false,
      yearlyPattern: [],
      weeklyPattern: detectWeeklyPattern(salesData),
      upcomingEvents: await getUpcomingEvents(masterSku),
    }
  }

  // Detect yearly seasonality
  const yearlyPattern = detectYearlyPattern(salesData)

  // Detect weekly seasonality
  const weeklyPattern = detectWeeklyPattern(salesData)

  // Check for significant seasonality
  const hasSeasonality =
    yearlyPattern.some((p) => Math.abs(p.multiplier - 1) > 0.2) ||
    weeklyPattern.some((p) => Math.abs(p.multiplier - 1) > 0.15)

  // Get upcoming events
  const upcomingEvents = await getUpcomingEvents(masterSku)

  return {
    hasSeasonality,
    yearlyPattern,
    weeklyPattern,
    upcomingEvents,
  }
}

/**
 * Detect yearly seasonal patterns
 */
function detectYearlyPattern(salesData: SalesDataPoint[]): SeasonalityPattern[] {
  const patterns: SeasonalityPattern[] = []

  // Group sales by month
  const monthlyData: Map<number, number[]> = new Map()

  for (let month = 1; month <= 12; month++) {
    monthlyData.set(month, [])
  }

  for (const data of salesData) {
    const month = data.date.getMonth() + 1
    monthlyData.get(month)?.push(data.units)
  }

  // Calculate overall average
  const allUnits = salesData.map((d) => d.units)
  const overallAverage = allUnits.reduce((a, b) => a + b, 0) / allUnits.length

  // Calculate monthly patterns
  for (let month = 1; month <= 12; month++) {
    const monthUnits = monthlyData.get(month) || []

    if (monthUnits.length === 0) {
      patterns.push({
        month,
        multiplier: 1.0,
        confidence: 0,
        sampleSize: 0,
      })
      continue
    }

    const monthAverage = monthUnits.reduce((a, b) => a + b, 0) / monthUnits.length
    const multiplier = overallAverage > 0 ? monthAverage / overallAverage : 1.0

    // Calculate confidence based on sample size and variance
    const variance =
      monthUnits.reduce((sum, u) => sum + (u - monthAverage) ** 2, 0) /
      monthUnits.length
    const cv = monthAverage > 0 ? Math.sqrt(variance) / monthAverage : 1
    const confidence = Math.max(0, 1 - cv) * Math.min(1, monthUnits.length / 30)

    patterns.push({
      month,
      multiplier,
      confidence,
      sampleSize: monthUnits.length,
    })
  }

  return patterns
}

/**
 * Detect weekly seasonal patterns
 */
function detectWeeklyPattern(salesData: SalesDataPoint[]): SeasonalityPattern[] {
  const patterns: SeasonalityPattern[] = []

  // Group sales by day of week
  const dayData: Map<number, number[]> = new Map()

  for (let day = 0; day < 7; day++) {
    dayData.set(day, [])
  }

  for (const data of salesData) {
    const dayOfWeek = data.date.getDay()
    dayData.get(dayOfWeek)?.push(data.units)
  }

  // Calculate overall average
  const allUnits = salesData.map((d) => d.units)
  const overallAverage =
    allUnits.length > 0 ? allUnits.reduce((a, b) => a + b, 0) / allUnits.length : 0

  // Calculate daily patterns
  for (let day = 0; day < 7; day++) {
    const dayUnits = dayData.get(day) || []

    if (dayUnits.length === 0) {
      patterns.push({
        month: 0,
        dayOfWeek: day,
        multiplier: 1.0,
        confidence: 0,
        sampleSize: 0,
      })
      continue
    }

    const dayAverage = dayUnits.reduce((a, b) => a + b, 0) / dayUnits.length
    const multiplier = overallAverage > 0 ? dayAverage / overallAverage : 1.0

    // Calculate confidence
    const variance =
      dayUnits.reduce((sum, u) => sum + (dayAverage - u) ** 2, 0) / dayUnits.length
    const cv = dayAverage > 0 ? Math.sqrt(variance) / dayAverage : 1
    const confidence = Math.max(0, 1 - cv) * Math.min(1, dayUnits.length / 52)

    patterns.push({
      month: 0,
      dayOfWeek: day,
      multiplier,
      confidence,
      sampleSize: dayUnits.length,
    })
  }

  return patterns
}

/**
 * Get upcoming seasonal events with multipliers
 */
async function getUpcomingEvents(
  masterSku: string,
  daysAhead: number = 90
): Promise<
  Array<{
    event: SeasonalEvent
    daysUntil: number
    multiplier: number
  }>
> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentMonth = today.getMonth() + 1
  const currentDay = today.getDate()

  try {
    const seasonalEvents = await prisma.seasonalEvent.findMany({
      where: { isActive: true },
    })

    const upcoming: Array<{
      event: SeasonalEvent
      daysUntil: number
      multiplier: number
    }> = []

    for (const dbEvent of seasonalEvents) {
      // Convert to our type
      const event: SeasonalEvent = {
        id: dbEvent.id,
        name: dbEvent.name,
        eventType: dbEvent.eventType as SeasonalEventType,
        startMonth: dbEvent.startMonth,
        startDay: dbEvent.startDay,
        endMonth: dbEvent.endMonth,
        endDay: dbEvent.endDay,
        baseMultiplier: Number(dbEvent.baseMultiplier),
        learnedMultiplier: dbEvent.learnedMultiplier
          ? Number(dbEvent.learnedMultiplier)
          : null,
        skuMultipliers: dbEvent.skuMultipliers
          ? JSON.parse(dbEvent.skuMultipliers)
          : {},
        isActive: dbEvent.isActive,
      }

      // Calculate days until event start
      const daysUntil = calculateDaysUntilEvent(
        currentMonth,
        currentDay,
        event.startMonth,
        event.startDay
      )

      if (daysUntil <= daysAhead) {
        // Get effective multiplier for this SKU
        let multiplier = event.skuMultipliers[masterSku] || event.baseMultiplier

        // Blend with learned multiplier if available
        if (event.learnedMultiplier) {
          multiplier = event.baseMultiplier * 0.4 + event.learnedMultiplier * 0.6
        }

        upcoming.push({ event, daysUntil, multiplier })
      }
    }

    // Sort by days until
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil)

    return upcoming
  } catch (error) {
    console.error('Error fetching seasonal events:', error)
    return []
  }
}

/**
 * Calculate days until an event start
 */
function calculateDaysUntilEvent(
  currentMonth: number,
  currentDay: number,
  eventMonth: number,
  eventDay: number
): number {
  const today = new Date()
  const year = today.getFullYear()

  // Create event date for this year
  let eventDate = new Date(year, eventMonth - 1, eventDay)

  // If event has passed this year, look at next year
  if (eventDate < today) {
    eventDate = new Date(year + 1, eventMonth - 1, eventDay)
  }

  const diffTime = eventDate.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Learn seasonal multipliers from historical performance
 */
export async function learnSeasonalMultipliers(
  masterSku: string,
  salesData: SalesDataPoint[]
): Promise<LearnedMultiplier[]> {
  if (salesData.length < 365) {
    return []
  }

  const learned: LearnedMultiplier[] = []

  try {
    const seasonalEvents = await prisma.seasonalEvent.findMany({
      where: { isActive: true },
    })

    // Calculate baseline (non-event) average
    const baselineData = filterOutEventPeriods(salesData, seasonalEvents)
    const baselineAvg =
      baselineData.length > 0
        ? baselineData.reduce((sum, d) => sum + d.units, 0) / baselineData.length
        : 1

    for (const dbEvent of seasonalEvents) {
      // Get sales during this event across all years
      const eventSales = getEventSales(salesData, dbEvent)

      if (eventSales.length === 0) continue

      // Group by year
      const yearlyData: Map<number, number[]> = new Map()
      for (const sale of eventSales) {
        const year = sale.date.getFullYear()
        if (!yearlyData.has(year)) {
          yearlyData.set(year, [])
        }
        yearlyData.get(year)?.push(sale.units)
      }

      // Weight more recent years higher (60% most recent, 40% older)
      const years = Array.from(yearlyData.keys()).sort((a, b) => b - a)
      let weightedSum = 0
      let totalWeight = 0

      for (let i = 0; i < years.length; i++) {
        const year = years[i]
        const yearSales = yearlyData.get(year) || []
        const yearAvg = yearSales.reduce((a, b) => a + b, 0) / yearSales.length

        // More recent years get higher weight
        const weight = i === 0 ? 0.6 : 0.4 / Math.max(1, i)
        weightedSum += yearAvg * weight
        totalWeight += weight
      }

      const learnedMultiplier =
        baselineAvg > 0 && totalWeight > 0
          ? weightedSum / totalWeight / baselineAvg
          : Number(dbEvent.baseMultiplier)

      // Calculate confidence based on years of data
      const confidence = Math.min(1, years.length / 3) // Full confidence at 3+ years

      learned.push({
        eventId: dbEvent.id,
        eventName: dbEvent.name,
        baseMultiplier: Number(dbEvent.baseMultiplier),
        learnedMultiplier,
        sampleYears: years.length,
        confidence,
      })

      // Update database with learned multiplier
      await prisma.seasonalEvent.update({
        where: { id: dbEvent.id },
        data: {
          learnedMultiplier,
        },
      })
    }
  } catch (error) {
    console.error('Error learning seasonal multipliers:', error)
  }

  return learned
}

/**
 * Filter out event periods to get baseline
 */
function filterOutEventPeriods(
  salesData: SalesDataPoint[],
  events: any[]
): SalesDataPoint[] {
  return salesData.filter((data) => {
    const month = data.date.getMonth() + 1
    const day = data.date.getDate()

    for (const event of events) {
      if (isDateInEvent(month, day, event)) {
        return false
      }
    }

    return true
  })
}

/**
 * Get sales data for a specific event
 */
function getEventSales(salesData: SalesDataPoint[], event: any): SalesDataPoint[] {
  return salesData.filter((data) => {
    const month = data.date.getMonth() + 1
    const day = data.date.getDate()
    return isDateInEvent(month, day, event)
  })
}

/**
 * Check if a date falls within an event
 */
function isDateInEvent(
  month: number,
  day: number,
  event: { startMonth: number; startDay: number; endMonth: number; endDay: number }
): boolean {
  if (event.startMonth === event.endMonth) {
    return month === event.startMonth && day >= event.startDay && day <= event.endDay
  } else if (event.startMonth < event.endMonth) {
    return (
      (month === event.startMonth && day >= event.startDay) ||
      (month === event.endMonth && day <= event.endDay) ||
      (month > event.startMonth && month < event.endMonth)
    )
  } else {
    // Crosses year boundary
    return (
      (month === event.startMonth && day >= event.startDay) ||
      (month === event.endMonth && day <= event.endDay) ||
      month > event.startMonth ||
      month < event.endMonth
    )
  }
}

/**
 * Detect NEW seasonal patterns automatically
 */
export async function detectNewSeasonalPatterns(
  salesData: SalesDataPoint[],
  minSpikeMultiplier: number = 1.5,
  minRecurrence: number = 2
): Promise<
  Array<{
    suggestedName: string
    startMonth: number
    startDay: number
    endMonth: number
    endDay: number
    detectedMultiplier: number
    yearsSeen: number
    confidence: number
  }>
> {
  if (salesData.length < 365 * 2) {
    return [] // Need at least 2 years
  }

  // Calculate daily averages across all data
  const overallAvg =
    salesData.reduce((sum, d) => sum + d.units, 0) / salesData.length

  // Find spike periods
  const spikePeriods: Array<{
    year: number
    startMonth: number
    startDay: number
    endMonth: number
    endDay: number
    avgMultiplier: number
  }> = []

  // Group by year
  const yearlyData = groupByYear(salesData)

  for (const [year, yearData] of yearlyData) {
    const yearAvg =
      yearData.reduce((sum, d) => sum + d.units, 0) / yearData.length

    // Find consecutive spike days
    let spikeStart: SalesDataPoint | null = null
    let spikeDays: SalesDataPoint[] = []

    for (const data of yearData) {
      const multiplier = yearAvg > 0 ? data.units / yearAvg : 1

      if (multiplier >= minSpikeMultiplier) {
        if (!spikeStart) {
          spikeStart = data
        }
        spikeDays.push(data)
      } else if (spikeStart && spikeDays.length >= 3) {
        // End of spike period (minimum 3 days)
        const avgMult =
          spikeDays.reduce((sum, d) => sum + d.units, 0) /
          spikeDays.length /
          yearAvg

        spikePeriods.push({
          year,
          startMonth: spikeStart.date.getMonth() + 1,
          startDay: spikeStart.date.getDate(),
          endMonth: spikeDays[spikeDays.length - 1].date.getMonth() + 1,
          endDay: spikeDays[spikeDays.length - 1].date.getDate(),
          avgMultiplier: avgMult,
        })

        spikeStart = null
        spikeDays = []
      } else {
        spikeStart = null
        spikeDays = []
      }
    }
  }

  // Find recurring patterns (same period across multiple years)
  const recurringPatterns: Map<
    string,
    {
      periods: typeof spikePeriods
      years: number[]
    }
  > = new Map()

  for (const period of spikePeriods) {
    // Create a key for the period (approximate match within 7 days)
    const key = `${period.startMonth}-${Math.floor(period.startDay / 7)}`

    if (!recurringPatterns.has(key)) {
      recurringPatterns.set(key, { periods: [], years: [] })
    }

    const pattern = recurringPatterns.get(key)!
    pattern.periods.push(period)
    if (!pattern.years.includes(period.year)) {
      pattern.years.push(period.year)
    }
  }

  // Return patterns that recur across multiple years
  const newPatterns: Array<{
    suggestedName: string
    startMonth: number
    startDay: number
    endMonth: number
    endDay: number
    detectedMultiplier: number
    yearsSeen: number
    confidence: number
  }> = []

  for (const [, pattern] of recurringPatterns) {
    if (pattern.years.length >= minRecurrence) {
      // Average the periods
      const avgStartDay = Math.round(
        pattern.periods.reduce((sum, p) => sum + p.startDay, 0) /
          pattern.periods.length
      )
      const avgEndDay = Math.round(
        pattern.periods.reduce((sum, p) => sum + p.endDay, 0) /
          pattern.periods.length
      )
      const avgMultiplier =
        pattern.periods.reduce((sum, p) => sum + p.avgMultiplier, 0) /
        pattern.periods.length

      // Use most common month
      const startMonth = pattern.periods[0].startMonth
      const endMonth = pattern.periods[0].endMonth

      // Generate suggested name
      const monthNames = [
        '',
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ]
      const suggestedName = `${monthNames[startMonth]} ${avgStartDay}-${avgEndDay} Spike`

      newPatterns.push({
        suggestedName,
        startMonth,
        startDay: avgStartDay,
        endMonth,
        endDay: avgEndDay,
        detectedMultiplier: avgMultiplier,
        yearsSeen: pattern.years.length,
        confidence: Math.min(1, pattern.years.length / 3),
      })
    }
  }

  return newPatterns
}

/**
 * Group sales data by year
 */
function groupByYear(
  salesData: SalesDataPoint[]
): Map<number, SalesDataPoint[]> {
  const yearlyData = new Map<number, SalesDataPoint[]>()

  for (const data of salesData) {
    const year = data.date.getFullYear()
    if (!yearlyData.has(year)) {
      yearlyData.set(year, [])
    }
    yearlyData.get(year)?.push(data)
  }

  // Sort each year's data by date
  for (const [, yearData] of yearlyData) {
    yearData.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  return yearlyData
}

/**
 * Create a custom seasonal event
 */
export async function createSeasonalEvent(
  name: string,
  eventType: SeasonalEventType,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
  baseMultiplier: number
): Promise<SeasonalEvent> {
  const event = await prisma.seasonalEvent.create({
    data: {
      name,
      eventType,
      startMonth,
      startDay,
      endMonth,
      endDay,
      baseMultiplier,
      isActive: true,
    },
  })

  return {
    id: event.id,
    name: event.name,
    eventType: event.eventType as SeasonalEventType,
    startMonth: event.startMonth,
    startDay: event.startDay,
    endMonth: event.endMonth,
    endDay: event.endDay,
    baseMultiplier: Number(event.baseMultiplier),
    learnedMultiplier: null,
    skuMultipliers: {},
    isActive: event.isActive,
  }
}

/**
 * Update SKU-specific multiplier for an event
 */
export async function updateSkuEventMultiplier(
  eventId: number,
  masterSku: string,
  multiplier: number
): Promise<void> {
  const event = await prisma.seasonalEvent.findUnique({
    where: { id: eventId },
  })

  if (!event) return

  const skuMultipliers = event.skuMultipliers
    ? JSON.parse(event.skuMultipliers)
    : {}

  skuMultipliers[masterSku] = multiplier

  await prisma.seasonalEvent.update({
    where: { id: eventId },
    data: {
      skuMultipliers: JSON.stringify(skuMultipliers),
    },
  })
}

/**
 * Get seasonality multiplier for a specific date and SKU
 */
export async function getSeasonalityMultiplierForDate(
  masterSku: string,
  date: Date
): Promise<{
  multiplier: number
  eventName: string | null
  source: 'base' | 'learned' | 'sku_specific' | 'none'
}> {
  const month = date.getMonth() + 1
  const day = date.getDate()

  try {
    const events = await prisma.seasonalEvent.findMany({
      where: { isActive: true },
    })

    for (const event of events) {
      if (isDateInEvent(month, day, event)) {
        // Check for SKU-specific multiplier
        if (event.skuMultipliers) {
          const skuMults = JSON.parse(event.skuMultipliers)
          if (skuMults[masterSku]) {
            return {
              multiplier: skuMults[masterSku],
              eventName: event.name,
              source: 'sku_specific',
            }
          }
        }

        // Use learned if available
        if (event.learnedMultiplier) {
          const blended =
            Number(event.baseMultiplier) * 0.4 +
            Number(event.learnedMultiplier) * 0.6
          return {
            multiplier: blended,
            eventName: event.name,
            source: 'learned',
          }
        }

        // Fall back to base
        return {
          multiplier: Number(event.baseMultiplier),
          eventName: event.name,
          source: 'base',
        }
      }
    }
  } catch (error) {
    console.error('Error getting seasonality multiplier:', error)
  }

  return {
    multiplier: 1.0,
    eventName: null,
    source: 'none',
  }
}
