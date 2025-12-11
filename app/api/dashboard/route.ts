import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/db'
import { subDays, startOfDay, endOfDay, format } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import {
  getNetProfitForRange,
  nowInPST,
  pstToUTC,
  AMAZON_TIMEZONE,
} from '@/lib/profit/engine'

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
    const currentPST = nowInPST()

    // Calculate yesterday's profit using the shared profit engine (Sellerboard-level accuracy)
    const yesterdayStart = pstToUTC(startOfDay(subDays(currentPST, 1)))
    const yesterdayEnd = pstToUTC(startOfDay(currentPST))
    const yesterdayProfit = await getNetProfitForRange(yesterdayStart, yesterdayEnd)

    // Get task counts
    const today = startOfDay(now)

    // Items to order - products with low days of supply based on recent sales velocity
    // Only show CRITICAL items (urgency = 'critical')
    // Critical = daysUntilMustOrder <= 14 (where daysUntilMustOrder = totalDaysOfSupply - leadTimeDays - 14)
    const itemsToOrderResult = await query<{ sku: string; title: string; total_qty: number; days_of_supply: number; lead_time_days: number }>(`
      WITH velocity AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 30.0 as avg_daily_sales
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      ),
      product_data AS (
        SELECT
          p.sku,
          p.title,
          COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0) as total_qty,
          COALESCE(v.avg_daily_sales, 0) as avg_daily_sales,
          COALESCE(s.lead_time_days, 30) as lead_time_days,
          CASE
            WHEN COALESCE(v.avg_daily_sales, 0) > 0
            THEN ROUND((COALESCE(il.fba_available, 0) + COALESCE(il.warehouse_available, 0)) / v.avg_daily_sales)
            ELSE 999
          END as days_of_supply
        FROM products p
        LEFT JOIN inventory_levels il ON p.sku = il.master_sku
        LEFT JOIN velocity v ON p.sku = v.sku
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.is_hidden = false
          AND COALESCE(v.avg_daily_sales, 0) > 0.1
      )
      SELECT
        sku,
        title,
        total_qty,
        days_of_supply,
        lead_time_days
      FROM product_data
      WHERE days_of_supply - lead_time_days - 14 <= 14  -- Critical urgency threshold
        AND days_of_supply < 999
      ORDER BY days_of_supply ASC
    `, [])

    // Items to ship to Amazon - use forecaster logic: "ship by - Today"
    // Items with "ship by - Today" are those where:
    // - fbaTotal === 0, OR
    // - daysOfSupply < 3
    const itemsToShipResult = await query<{
      sku: string
      title: string
      warehouse_qty: number
      fba_qty: number
      fba_inbound: number
      avg_daily_sales: number
      recommended_ship_qty: number
    }>(`
      WITH velocity AS (
        SELECT
          oi.master_sku as sku,
          COALESCE(SUM(oi.quantity), 0) / 30.0 as avg_daily_sales
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.status != 'Cancelled'
        GROUP BY oi.master_sku
      ),
      shipment_candidates AS (
        SELECT
          p.sku,
          p.title,
          COALESCE(il.warehouse_available, 0) as warehouse_qty,
          COALESCE(il.fba_available, 0) as fba_qty,
          COALESCE(il.fba_inbound_working, 0) + COALESCE(il.fba_inbound_shipped, 0) + COALESCE(il.fba_inbound_receiving, 0) as fba_inbound,
          COALESCE(v.avg_daily_sales, 0) as avg_daily_sales,
          -- Calculate total FBA (available + inbound)
          COALESCE(il.fba_available, 0) +
          COALESCE(il.fba_inbound_working, 0) +
          COALESCE(il.fba_inbound_shipped, 0) +
          COALESCE(il.fba_inbound_receiving, 0) as fba_total,
          -- Calculate days of supply
          CASE
            WHEN COALESCE(v.avg_daily_sales, 0) > 0
            THEN (COALESCE(il.fba_available, 0) +
                  COALESCE(il.fba_inbound_working, 0) +
                  COALESCE(il.fba_inbound_shipped, 0) +
                  COALESCE(il.fba_inbound_receiving, 0)) / v.avg_daily_sales
            ELSE 999
          END as days_of_supply,
          -- Recommended = enough to get to 30 days supply, but not more than warehouse has
          LEAST(
            COALESCE(il.warehouse_available, 0),
            GREATEST(0, CEIL(v.avg_daily_sales * 30) -
              (COALESCE(il.fba_available, 0) +
               COALESCE(il.fba_inbound_working, 0) +
               COALESCE(il.fba_inbound_shipped, 0) +
               COALESCE(il.fba_inbound_receiving, 0)))
          ) as recommended_ship_qty
        FROM products p
        LEFT JOIN inventory_levels il ON p.sku = il.master_sku
        LEFT JOIN velocity v ON p.sku = v.sku
        WHERE p.is_hidden = false
          AND COALESCE(il.warehouse_available, 0) > 0
          AND COALESCE(v.avg_daily_sales, 0) > 0.1
      )
      SELECT
        sku,
        title,
        warehouse_qty,
        fba_qty,
        fba_inbound,
        avg_daily_sales,
        recommended_ship_qty
      FROM shipment_candidates
      WHERE
        -- "Ship by - Today" criteria: fbaTotal === 0 OR daysOfSupply < 3
        (fba_total = 0 OR days_of_supply < 3)
        AND recommended_ship_qty > 0
      ORDER BY
        CASE WHEN fba_total = 0 THEN 0 ELSE 1 END,
        days_of_supply ASC
    `, [])

    // Sum up total recommended units to ship (only "ship by - Today" items)
    const itemsToShipTotalUnits = itemsToShipResult.reduce((sum, item) => sum + Number(item.recommended_ship_qty), 0)
    const itemsToShipProductCount = itemsToShipResult.length

    // Out of stock items - FBA available = 0 but has recent sales history
    // No limit - show all out of stock items
    const outOfStockResult = await query<{ sku: string; title: string }>(`
      SELECT DISTINCT
        p.sku,
        p.title
      FROM products p
      LEFT JOIN inventory_levels il ON p.sku = il.master_sku
      WHERE p.is_hidden = false
        AND COALESCE(il.fba_available, 0) = 0
        AND EXISTS (
          SELECT 1 FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE oi.master_sku = p.sku
          AND o.purchase_date > NOW() - INTERVAL '30 days'
          AND o.status != 'Cancelled'
        )
    `, [])

    const itemsToOrderTotal = itemsToOrderResult.length
    const outOfStockTotal = outOfStockResult.length

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

    // Today's reminders and appointments - use user's timezone (EST/EDT)
    const userTimezone = profile.timezone || 'America/New_York'
    const nowInUserTz = toZonedTime(now, userTimezone)
    const todayStartUserTz = startOfDay(nowInUserTz)
    const todayEndUserTz = endOfDay(nowInUserTz)
    const todayStartUTC = fromZonedTime(todayStartUserTz, userTimezone)
    const todayEndUTC = fromZonedTime(todayEndUserTz, userTimezone)

    const todayEvents = await prisma.calendarEvent.findMany({
      where: {
        startDate: {
          gte: todayStartUTC,
          lte: todayEndUTC
        },
        eventType: { in: ['reminder', 'appointment', 'event'] }
      },
      orderBy: { startTime: 'asc' },
      take: 10
    })

    // Calculate profit periods for last 4 days using the shared profit engine
    const profitPeriods: Array<{ label: string; date: string; profit: number; change: number | null }> = []
    for (let i = 0; i < 4; i++) {
      const dayStart = pstToUTC(startOfDay(subDays(currentPST, i)))
      const dayEnd = pstToUTC(startOfDay(subDays(currentPST, i - 1)))

      const profit = await getNetProfitForRange(dayStart, dayEnd)
      const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`

      profitPeriods.push({
        label,
        date: format(subDays(currentPST, i), 'yyyy-MM-dd'),
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
            count: itemsToOrderTotal,
            nextDate: null,
            items: itemsToOrderResult.map(item => ({
              sku: item.sku,
              title: item.title,
              quantity: item.total_qty,
              daysOfSupply: Math.round(Number(item.days_of_supply))
            }))
          },
          itemsToShip: {
            count: itemsToShipTotalUnits, // Total recommended UNITS to ship
            productCount: itemsToShipProductCount, // Number of different products
            nextDate: null,
            items: itemsToShipResult.map(item => ({
              sku: item.sku,
              title: item.title,
              warehouseQty: item.warehouse_qty,
              fbaQty: item.fba_qty,
              recommendedQty: Number(item.recommended_ship_qty)
            }))
          },
          outOfStock: {
            count: outOfStockTotal,
            items: outOfStockResult.map(item => ({
              sku: item.sku,
              title: item.title
            }))
          },
          lateShipments: {
            count: latePOs.length,
            items: latePOs.map((po: { poNumber: string; supplier: { name: string; email: string | null } | null; expectedArrivalDate: Date | null }) => ({
              poNumber: po.poNumber,
              supplier: po.supplier?.name || 'Unknown',
              supplierEmail: po.supplier?.email,
              daysLate: Math.floor((now.getTime() - (po.expectedArrivalDate?.getTime() || 0)) / (1000 * 60 * 60 * 24))
            }))
          },
          reminders: {
            count: todayEvents.length,
            items: todayEvents.map((e: { id: number; title: string; startTime: string | null; eventType: string }) => ({
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
