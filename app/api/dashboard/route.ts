import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { subDays, startOfDay, endOfDay, format } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const AMAZON_TIMEZONE = 'America/Los_Angeles'

export async function GET(request: NextRequest) {
  try {
    // Get user profile
    let profile = await prisma.userProfile.findFirst()
    
    // Create default profile if it doesn't exist
    if (!profile) {
      profile = await prisma.userProfile.create({
        data: {
          name: 'Judy',
          timezone: 'America/New_York'
        }
      })
      
      // Create default schedule (Mon-Fri 9-5)
      const defaultSchedule = [
        { dayOfWeek: 0, isWorking: false, startTime: null, endTime: null },
        { dayOfWeek: 1, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 2, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 3, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 4, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 5, isWorking: true, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 6, isWorking: false, startTime: null, endTime: null },
      ]
      
      for (const day of defaultSchedule) {
        await prisma.userSchedule.create({
          data: {
            userId: profile.id,
            ...day
          }
        })
      }
    }

    const now = new Date()
    const nowInPST = toZonedTime(now, AMAZON_TIMEZONE)
    const toUTC = (date: Date) => fromZonedTime(date, AMAZON_TIMEZONE)

    const yesterdayStart = toUTC(startOfDay(subDays(nowInPST, 1)))
    const yesterdayEnd = toUTC(startOfDay(nowInPST))

    // Calculate yesterday's profit using raw SQL
    const yesterdayProfitResult = await query<{ profit: number }>(`
      SELECT COALESCE(
        SUM(
          (item_price + shipping_price + gift_wrap_price) * quantity 
          - (referral_fee + fba_fee + other_fees + amazon_fees)
          - COALESCE(p.cost, 0) * oi.quantity
        ), 
        0
      ) as profit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.master_sku = p.sku
      WHERE o.purchase_date >= $1 AND o.purchase_date < $2
        AND o.status != 'Cancelled'
    `, [yesterdayStart.toISOString(), yesterdayEnd.toISOString()])

    const yesterdayProfit = Number(yesterdayProfitResult[0]?.profit || 0)

    // Get task counts
    const today = startOfDay(now)

    // Items to order (from inventory alerts with stockout_risk or low inventory)
    const orderAlerts = await prisma.inventoryAlert.findMany({
      where: {
        isResolved: false,
        alertType: { in: ['stockout_risk', 'low_inventory'] }
      },
      take: 10
    })

    // Items to ship to Amazon (alerts suggesting FBA replenishment)
    const shipAlerts = await prisma.inventoryAlert.findMany({
      where: {
        isResolved: false,
        alertType: 'fba_replenishment'
      },
      take: 10
    })

    // Out of stock items from channel_inventory joined with products
    const outOfStockResult = await query<{ master_sku: string; title: string }>(`
      SELECT ci.master_sku, COALESCE(p.title, ci.master_sku) as title
      FROM channel_inventory ci
      LEFT JOIN products p ON ci.master_sku = p.sku
      WHERE ci.fba_available = 0 AND ci.channel = 'Amazon'
      LIMIT 10
    `, [])
    
    const outOfStockItems = outOfStockResult

    // Late shipments (POs past expected arrival date and not received)
    const latePOs = await prisma.purchaseOrder.findMany({
      where: {
        expectedArrivalDate: {
          lt: today
        },
        status: {
          notIn: ['received', 'cancelled']
        }
      },
      include: {
        supplier: true
      },
      take: 10
    })

    // Calculate profit periods for last 4 days
    const profitPeriods = []
    for (let i = 0; i < 4; i++) {
      const dayStart = toUTC(startOfDay(subDays(nowInPST, i)))
      const dayEnd = toUTC(startOfDay(subDays(nowInPST, i - 1)))

      const profitResult = await query<{ profit: number }>(`
        SELECT COALESCE(
          SUM(
            (item_price + shipping_price + gift_wrap_price) * quantity 
            - (referral_fee + fba_fee + other_fees + amazon_fees)
            - COALESCE(p.cost, 0) * oi.quantity
          ), 
          0
        ) as profit
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.master_sku = p.sku
        WHERE o.purchase_date >= $1 AND o.purchase_date < $2
          AND o.status != 'Cancelled'
      `, [dayStart.toISOString(), dayEnd.toISOString()])

      const profit = Number(profitResult[0]?.profit || 0)
      const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`

      profitPeriods.push({
        label,
        date: format(subDays(nowInPST, i), 'yyyy-MM-dd'),
        profit: Math.round(profit * 100) / 100,
        change: null as number | null
      })
    }

    // Calculate percentage changes
    for (let i = 0; i < profitPeriods.length - 1; i++) {
      const current = profitPeriods[i].profit
      const previous = profitPeriods[i + 1].profit
      if (previous !== 0) {
        profitPeriods[i].change = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        userName: profile.name,
        yesterdayProfit: Math.round(yesterdayProfit * 100) / 100,
        tasks: {
          itemsToOrder: {
            count: orderAlerts.length,
            nextDate: null,
            items: orderAlerts.map(a => ({
              sku: a.masterSku,
              quantity: a.recommendedQuantity,
              title: a.title
            }))
          },
          itemsToShip: {
            count: shipAlerts.length,
            nextDate: null,
            items: shipAlerts.map(a => ({
              sku: a.masterSku,
              quantity: a.recommendedQuantity,
              title: a.title
            }))
          },
          outOfStock: {
            count: outOfStockItems.length,
            items: outOfStockItems.map(i => ({
              sku: i.master_sku,
              title: i.title
            }))
          },
          lateShipments: {
            count: latePOs.length,
            items: latePOs.map(po => ({
              poNumber: po.poNumber,
              supplier: po.supplier?.name || 'Unknown',
              supplierEmail: po.supplier?.email,
              daysLate: Math.floor((now.getTime() - (po.expectedArrivalDate?.getTime() || 0)) / (1000 * 60 * 60 * 24))
            }))
          }
        },
        profit: {
          periods: profitPeriods
        }
      }
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to load dashboard data'
    }, { status: 500 })
  }
}
