/**
 * Seasonal Events Management
 * 
 * Pre-configured seasonal events with date ranges and multipliers
 */

import { prisma } from '@/lib/prisma'

export interface SeasonalEventData {
  name: string
  eventType: 'micro_peak' | 'major_peak' | 'custom'
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
  baseMultiplier: number
}

/**
 * Initialize default seasonal events
 */
export async function initializeSeasonalEvents() {
  // Check if table exists first
  try {
    await prisma.$queryRaw`SELECT 1 FROM seasonal_events LIMIT 1`
  } catch (error: any) {
    if (error.message?.includes('does not exist') || error.message?.includes('Unknown table')) {
      console.warn('Seasonal events table does not exist. Please run database migration first.')
      return
    }
    throw error
  }

  const defaultEvents: SeasonalEventData[] = [
    {
      name: "Valentine's Day",
      eventType: 'micro_peak',
      startMonth: 2,
      startDay: 1,
      endMonth: 2,
      endDay: 14,
      baseMultiplier: 2.0, // 2x sales
    },
    {
      name: "Mother's Day",
      eventType: 'micro_peak',
      startMonth: 5,
      startDay: 1,
      endMonth: 5,
      endDay: 14,
      baseMultiplier: 2.5,
    },
    {
      name: "Father's Day",
      eventType: 'micro_peak',
      startMonth: 6,
      startDay: 1,
      endMonth: 6,
      endDay: 14,
      baseMultiplier: 2.0,
    },
    {
      name: "Prime Day",
      eventType: 'micro_peak',
      startMonth: 7,
      startDay: 10,
      endMonth: 7,
      endDay: 20,
      baseMultiplier: 3.0,
    },
    {
      name: "Spring Sales",
      eventType: 'micro_peak',
      startMonth: 3,
      startDay: 1,
      endMonth: 4,
      endDay: 30,
      baseMultiplier: 1.5,
    },
    {
      name: "Black Friday through Christmas",
      eventType: 'major_peak',
      startMonth: 11,
      startDay: 15,
      endMonth: 12,
      endDay: 24,
      baseMultiplier: 4.0, // 4x sales during peak season
    },
  ]

  for (const eventData of defaultEvents) {
    // Find existing event by name
    const existing = await prisma.seasonalEvent.findFirst({
      where: { name: eventData.name },
    })

    if (existing) {
      // Update existing event
      await prisma.seasonalEvent.update({
        where: { id: existing.id },
        data: {
          eventType: eventData.eventType,
          startMonth: eventData.startMonth,
          startDay: eventData.startDay,
          endMonth: eventData.endMonth,
          endDay: eventData.endDay,
          baseMultiplier: eventData.baseMultiplier,
        },
      })
    } else {
      // Create new event
      await prisma.seasonalEvent.create({
        data: eventData,
      })
    }
  }

  console.log(`Initialized ${defaultEvents.length} seasonal events`)
}

/**
 * Update learned multiplier for a seasonal event based on historical performance
 */
export async function updateLearnedMultiplier(
  eventId: number,
  historicalMultiplier: number
) {
  await prisma.seasonalEvent.update({
    where: { id: eventId },
    data: {
      learnedMultiplier: historicalMultiplier,
    },
  })
}

