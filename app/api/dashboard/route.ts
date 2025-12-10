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

    // Items to order - products with low total inventory (FBA + warehouse < reorder point or < 14 days supply)
    const itemsToOrderResult = await query<{ sku: string; title: string; total_qty: number; days_of_supply: number }>(`
      SELECT 
        p.sku, 
        p.title,
        COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0) as total_qty,
        CASE 
          WHEN COALESCE(f.avg_daily_velocity, 0) > 0 
          THEN (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) / f.avg_daily_velocity
          ELSE 999
        END as days_of_supply
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      LEFT JOIN forecasts f ON p.sku = f.master_sku AND f.channel = 'Amazon'
      WHERE p.is_active = true
        AND (COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) < COALESCE(p.reorder_point, 50)
      ORDER BY days_of_supply ASC
      LIMIT 10
    `, [])
    
    // Items to ship to Amazon - have warehouse stock but low FBA stock
    const itemsToShipResult = await query<{ sku: string; title: string; warehouse_qty: number; fba_qty: number }>(`
      SELECT 
        p.sku,
        p.title,
        COALESCE(il.warehouse_available, 0) as warehouse_qty,
        COALESCE(il.fba_available, 0) as fba_qty
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      LEFT JOIN forecasts f ON p.sku = f.master_sku AND f.channel = 'Amazon'
      WHERE p.is_active = true
        AND COALESCE(il.warehouse_available, 0) > 0
        AND COALESCE(il.fba_available, 0) < 30
        AND COALESCE(f.avg_daily_velocity, 0) > 0
      ORDER BY il.fba_available ASC
      LIMIT 10
    `, [])

    // Out of stock items - FBA available = 0 but has sales history
    const outOfStockResult = await query<{ sku: string; title: string }>(`
      SELECT DISTINCT
        p.sku,
        p.title
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      WHERE p.is_active = true
        AND COALESCE(il.fba_available, 0) = 0
        AND EXISTS (
          SELECT 1 FROM order_items oi 
          WHERE oi.master_sku = p.sku 
          AND oi.created_at > NOW() - INTERVAL '90 days'
        )
      LIMIT 10
    `, [])
    
    const itemsToOrder = itemsToOrderResult
    const itemsToShip = itemsToShipResult
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

    // Today's reminders and appointments
    const todayEnd = endOfDay(now)
    const todayEvents = await prisma.calendarEvent.findMany({
      where: {
        startDate: {
          gte: today,
          lte: todayEnd
        },
        eventType: { in: ['reminder', 'appointment', 'event'] }
      },
      orderBy: { startTime: 'asc' },
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
            count: itemsToOrder.length,
            nextDate: null,
            items: itemsToOrder.map(item => ({
              sku: item.sku,
              title: item.title,
              quantity: item.total_qty,
              daysOfSupply: Math.round(Number(item.days_of_supply))
            }))
          },
          itemsToShip: {
            count: itemsToShip.length,
            nextDate: null,
            items: itemsToShip.map(item => ({
              sku: item.sku,
              title: item.title,
              warehouseQty: item.warehouse_qty,
              fbaQty: item.fba_qty
            }))
          },
          outOfStock: {
            count: outOfStockItems.length,
            items: outOfStockItems.map(item => ({
              sku: item.sku,
              title: item.title
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
          },
          reminders: {
            count: todayEvents.length,
            items: todayEvents.map(e => ({
              id: e.id,
              title: e.title,
              time: e.startTime,
              eventType: e.eventType
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
