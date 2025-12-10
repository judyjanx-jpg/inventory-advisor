import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

interface Observation {
  type: string
  title: string
  description: string | null
  data: any
  priority: 'low' | 'normal' | 'high'
}

export async function generateObservations() {
  if (!anthropic) {
    console.log('Skipping insight generation: ANTHROPIC_API_KEY not configured')
    return
  }

  const profile = await prisma.userProfile.findFirst()
  if (!profile) {
    console.log('Skipping insight generation: No user profile found')
    return
  }

  const observations: Observation[] = []

  try {
    // 1. Check for out of stock items
    const outOfStock = await checkOutOfStock()
    if (outOfStock.length > 0) {
      observations.push({
        type: 'out_of_stock',
        title: `${outOfStock.length} item${outOfStock.length > 1 ? 's' : ''} out of stock`,
        description: buildOutOfStockMessage(outOfStock),
        data: { skus: outOfStock.map((item: any) => item.master_sku || item.sku) },
        priority: 'high'
      })
    }
  } catch (error) {
    console.error('Error checking out of stock:', error)
  }

  try {
    // 2. Check for sales spikes
    const spikes = await checkSalesSpikes()
    for (const spike of spikes) {
      // Check if we already know about this (learned context)
      const existingContext = await prisma.aiBusinessContext.findFirst({
        where: {
          userId: profile.id,
          contextType: 'sku_note',
          subject: spike.sku
        }
      })

      if (!existingContext) {
        observations.push({
          type: 'sales_spike',
          title: `Unusual spike on ${spike.sku}`,
          description: `Sales jumped ${spike.percentChange}% this week compared to the 30-day average.`,
          data: spike,
          priority: 'normal'
        })
      }
    }
  } catch (error) {
    console.error('Error checking sales spikes:', error)
  }

  try {
    // 3. Check for late shipments
    const lateShipments = await checkLateShipments()
    if (lateShipments.length > 0) {
      observations.push({
        type: 'late_shipment',
        title: `${lateShipments.length} late shipment${lateShipments.length > 1 ? 's' : ''}`,
        description: buildLateShipmentMessage(lateShipments),
        data: { pos: lateShipments },
        priority: 'normal'
      })
    }
  } catch (error) {
    console.error('Error checking late shipments:', error)
  }

  try {
    // 4. Check for low stock without pending POs
    const lowStockNoPO = await checkLowStockNoPO()
    if (lowStockNoPO.length > 0) {
      observations.push({
        type: 'low_stock_no_po',
        title: `${lowStockNoPO.length} item${lowStockNoPO.length > 1 ? 's' : ''} low on stock, no PO pending`,
        description: buildLowStockMessage(lowStockNoPO),
        data: { skus: lowStockNoPO.map((item: any) => item.master_sku || item.sku) },
        priority: 'normal'
      })
    }
  } catch (error) {
    console.error('Error checking low stock:', error)
  }

  // Create observations in database
  for (const obs of observations) {
    // Check if similar observation already exists (avoid duplicates)
    const existing = await prisma.aiObservation.findFirst({
      where: {
        userId: profile.id,
        observationType: obs.type,
        status: { in: ['new', 'viewed'] },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Within last 24 hours
        }
      }
    })

    if (!existing) {
      await prisma.aiObservation.create({
        data: {
          userId: profile.id,
          observationType: obs.type,
          title: obs.title,
          description: obs.description,
          data: obs.data,
          priority: obs.priority
        }
      })
    }
  }

  console.log(`Generated ${observations.length} new observations`)
  return observations
}

async function checkOutOfStock() {
  const result = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT ci.master_sku, p.title
    FROM channel_inventory ci
    JOIN products p ON ci.master_sku = p.sku
    WHERE ci.fba_available = 0
      AND ci.channel = 'amazon_us'
      AND ci.updated_at >= NOW() - INTERVAL '7 days'
    LIMIT 10
  `
  return result
}

async function checkSalesSpikes() {
  // Check for SKUs with significant sales increases
  const result = await prisma.$queryRaw<any[]>`
    WITH recent_sales AS (
      SELECT 
        oi.master_sku,
        SUM(oi.quantity) as units_7d,
        COUNT(DISTINCT o.id) as orders_7d
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.purchase_date >= NOW() - INTERVAL '7 days'
        AND o.status NOT IN ('Cancelled', 'Canceled')
      GROUP BY oi.master_sku
    ),
    avg_sales AS (
      SELECT 
        oi.master_sku,
        AVG(daily_units) as avg_daily_units
      FROM (
        SELECT 
          oi.master_sku,
          DATE(o.purchase_date) as sale_date,
          SUM(oi.quantity) as daily_units
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.purchase_date >= NOW() - INTERVAL '30 days'
          AND o.purchase_date < NOW() - INTERVAL '7 days'
          AND o.status NOT IN ('Cancelled', 'Canceled')
        GROUP BY oi.master_sku, DATE(o.purchase_date)
      ) daily
      GROUP BY oi.master_sku
    )
    SELECT 
      rs.master_sku as sku,
      rs.units_7d,
      COALESCE(as.avg_daily_units * 7, 0) as avg_units_30d,
      CASE 
        WHEN COALESCE(as.avg_daily_units * 7, 0) > 0 
        THEN ROUND(((rs.units_7d - (as.avg_daily_units * 7)) / (as.avg_daily_units * 7)) * 100, 1)
        ELSE 0
      END as percent_change
    FROM recent_sales rs
    LEFT JOIN avg_sales as ON rs.master_sku = as.master_sku
    WHERE COALESCE(as.avg_daily_units * 7, 0) > 0
      AND rs.units_7d > (as.avg_daily_units * 7 * 1.5) -- 50% increase
    ORDER BY percent_change DESC
    LIMIT 5
  `
  return result
}

async function checkLateShipments() {
  const result = await prisma.purchaseOrder.findMany({
    where: {
      status: { notIn: ['received', 'cancelled'] },
      expectedArrivalDate: {
        lt: new Date()
      }
    },
    include: {
      supplier: true
    },
    take: 10
  })

  return result.map(po => ({
    poNumber: po.poNumber,
    supplier: po.supplier?.name || 'Unknown',
    daysLate: Math.floor((Date.now() - po.expectedArrivalDate.getTime()) / (1000 * 60 * 60 * 24)),
    expectedDate: po.expectedArrivalDate
  }))
}

async function checkLowStockNoPO() {
  // Items with low stock that don't have pending POs
  const result = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT ci.master_sku, p.title, ci.days_of_stock
    FROM channel_inventory ci
    JOIN products p ON ci.master_sku = p.sku
    LEFT JOIN purchase_order_items poi ON ci.master_sku = poi.sku
    LEFT JOIN purchase_orders po ON poi.purchase_order_id = po.id
      AND po.status IN ('draft', 'sent', 'confirmed', 'shipped')
    WHERE ci.channel = 'amazon_us'
      AND ci.days_of_stock < 21
      AND ci.days_of_stock > 0
      AND po.id IS NULL
    ORDER BY ci.days_of_stock ASC
    LIMIT 10
  `
  return result
}

function buildOutOfStockMessage(items: any[]): string {
  if (items.length === 0) return ''
  if (items.length <= 3) {
    return `I noticed ${items.map(i => i.master_sku || i.sku).join(', ')} ${items.length === 1 ? 'has' : 'have'} been out of stock.`
  }
  return `I noticed ${items.length} items have been out of stock, including ${items.slice(0, 3).map(i => i.master_sku || i.sku).join(', ')}.`
}

function buildLateShipmentMessage(shipments: any[]): string {
  if (shipments.length === 0) return ''
  const first = shipments[0]
  if (shipments.length === 1) {
    return `PO #${first.poNumber} from ${first.supplier} is ${first.daysLate} day${first.daysLate > 1 ? 's' : ''} late.`
  }
  return `${shipments.length} purchase orders are late, including PO #${first.poNumber} from ${first.supplier} (${first.daysLate} days late).`
}

function buildLowStockMessage(items: any[]): string {
  if (items.length === 0) return ''
  if (items.length <= 3) {
    return `${items.map(i => i.master_sku || i.sku).join(', ')} ${items.length === 1 ? 'has' : 'have'} low stock (${items[0]?.days_of_stock || 0} days) but no pending purchase orders.`
  }
  return `${items.length} items have low stock but no pending purchase orders, including ${items.slice(0, 3).map(i => i.master_sku || i.sku).join(', ')}.`
}

