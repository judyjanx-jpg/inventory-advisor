// app/api/amazon/sync/resync-pending/route.ts
// Manual endpoint to re-sync orders that were previously Pending

import { NextRequest, NextResponse } from 'next/server'
import { createSpApiClient, getAmazonCredentials } from '@/lib/amazon-sp-api'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const daysBack = parseInt(searchParams.get('daysBack') || '7', 10)
    
    const credentials = await getAmazonCredentials()
    if (!credentials) {
      return NextResponse.json(
        { error: 'Amazon credentials not configured' },
        { status: 400 }
      )
    }
    
    const client = await createSpApiClient()
    if (!client) {
      return NextResponse.json(
        { error: 'Failed to create SP-API client' },
        { status: 500 }
      )
    }
    
    console.log(`\n🔄 Re-syncing previously Pending orders (last ${daysBack} days)...`)
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)
    
    let resynced = 0
    let itemsUpdated = 0
    
    // Find orders that:
    // 1. Are now Shipped/Unshipped/PartiallyShipped (not Pending)
    // 2. Have items with $0 item_price (indicating they were synced when Pending)
    // 3. Were purchased in the last N days
    const ordersToResync = await prisma.$queryRaw<Array<{ order_id: string }>>`
      SELECT DISTINCT o.id as order_id
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.purchase_date >= ${startDate}
        AND o.status IN ('Shipped', 'Unshipped', 'PartiallyShipped')
        AND (oi.item_price = 0 OR oi.item_price IS NULL)
      LIMIT 200
    `
    
    if (ordersToResync.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orders need re-syncing',
        resynced: 0,
        itemsUpdated: 0,
      })
    }
    
    console.log(`  Found ${ordersToResync.length} orders to re-sync`)
    
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
    
    for (const { order_id } of ordersToResync) {
      try {
        // Fetch updated order items from Amazon
        const itemsResponse = await client.callAPI({
          operation: 'getOrderItems',
          endpoint: 'orders',
          path: { orderId: order_id },
        })
        
        const orderItems = itemsResponse?.OrderItems || itemsResponse?.payload?.OrderItems || []
        
        if (orderItems.length === 0) {
          continue
        }
        
        // Update order items with new pricing
        for (const item of orderItems) {
          const sku = item.SellerSKU
          if (!sku) continue
          
          // Check if product exists
          const product = await prisma.product.findUnique({ where: { sku } })
          if (!product) {
            // Create placeholder if needed
            await prisma.product.create({
              data: {
                sku,
                title: item.Title || `[Auto] ${sku}`,
                asin: item.ASIN || null,
                status: 'inactive',
                cost: 0,
                price: 0,
              },
            }).catch(() => {}) // Ignore if exists
          }
          
          const itemPrice = parseFloat(item.ItemPrice?.Amount || '0')
          const shippingPrice = parseFloat(item.ShippingPrice?.Amount || '0')
          const giftWrapPrice = parseFloat(item.GiftWrapPrice?.Amount || '0')
          const promoDiscount = Math.abs(parseFloat(item.PromotionDiscount?.Amount || '0'))
          const grossRevenue = itemPrice + shippingPrice + giftWrapPrice
          
          // Only update if we have actual pricing (not $0)
          if (itemPrice > 0 || shippingPrice > 0 || giftWrapPrice > 0) {
            await prisma.orderItem.upsert({
              where: {
                orderId_masterSku: { orderId: order_id, masterSku: sku },
              },
              update: {
                quantity: item.QuantityOrdered || 1,
                itemPrice,
                shippingPrice,
                giftWrapPrice,
                promoDiscount,
                grossRevenue,
              },
              create: {
                orderId: order_id,
                masterSku: sku,
                asin: item.ASIN || null,
                quantity: item.QuantityOrdered || 1,
                itemPrice,
                itemTax: parseFloat(item.ItemTax?.Amount || '0'),
                shippingPrice,
                shippingTax: parseFloat(item.ShippingTax?.Amount || '0'),
                giftWrapPrice,
                giftWrapTax: parseFloat(item.GiftWrapTax?.Amount || '0'),
                promoDiscount,
                grossRevenue,
              },
            })
            itemsUpdated++
          }
        }
        
        resynced++
        await delay(200) // Rate limiting
        
      } catch (error: any) {
        // Continue on individual order errors
        console.log(`  ⚠️ Error re-syncing order ${order_id}: ${error.message}`)
      }
    }
    
    console.log(`  ✓ Re-synced ${resynced} orders, updated ${itemsUpdated} items`)
    
    return NextResponse.json({
      success: true,
      message: `Re-synced ${resynced} orders, updated ${itemsUpdated} items`,
      resynced,
      itemsUpdated,
    })
    
  } catch (error: any) {
    console.error('Re-sync failed:', error)
    return NextResponse.json(
      { error: error.message || 'Re-sync failed' },
      { status: 500 }
    )
  }
}

