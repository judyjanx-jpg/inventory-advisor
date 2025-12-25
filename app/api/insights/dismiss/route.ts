import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { insightIds } = body

    if (!insightIds || !Array.isArray(insightIds) || insightIds.length === 0) {
      return NextResponse.json(
        { error: 'insightIds array is required' },
        { status: 400 }
      )
    }

    // Store dismissed insights in user preferences or a dismissed_insights table
    // For now, we'll use the AlertConfig to track dismissed alerts
    // or create dismissed records in the InventoryAlert table

    // Extract masterSku from insight IDs that follow the pattern type-sku
    const skusToDismiss: string[] = []
    const alertTypesToDismiss: { type: string; sku: string | null }[] = []

    for (const insightId of insightIds) {
      // Parse insight ID to extract type and SKU
      // Format: type-sku (e.g., stockout-ABC123, late-po-PO001)
      const parts = insightId.split('-')
      if (parts.length >= 2) {
        const type = parts[0]
        const identifier = parts.slice(1).join('-')
        
        // For SKU-based alerts
        if (['stockout', 'out', 'sales', 'return', 'cost', 'reorder', 'pricing', 'top'].includes(type)) {
          // Remove any prefix like 'of-stock-' or 'spike-'
          let sku = identifier
          if (type === 'out') sku = identifier.replace('of-stock-', '')
          if (type === 'sales') sku = identifier.replace('spike-', '').replace('drop-', '')
          if (type === 'return') sku = identifier.replace('spike-', '')
          if (type === 'cost') sku = identifier.replace('increase-', '')
          if (type === 'reorder') sku = identifier.replace('early-', '')
          if (type === 'pricing') sku = identifier.replace('opportunity-', '')
          if (type === 'top') sku = identifier.replace('performer-yesterday-', '').replace('performer-', '')
          
          alertTypesToDismiss.push({ type, sku })
        } else {
          alertTypesToDismiss.push({ type, sku: null })
        }
      }
    }

    // Try to mark related InventoryAlerts as resolved
    try {
      for (const alert of alertTypesToDismiss) {
        if (alert.sku) {
          await prisma.inventoryAlert.updateMany({
            where: {
              masterSku: alert.sku,
              isResolved: false,
            },
            data: {
              isResolved: true,
              resolvedAt: new Date(),
            },
          })
        }
      }
    } catch (e) {
      // Table might not exist or be empty, that's ok
      console.log('Note: Could not update InventoryAlert table:', e)
    }

    // Also try to mark Alert records as resolved
    try {
      for (const alert of alertTypesToDismiss) {
        if (alert.sku) {
          await prisma.alert.updateMany({
            where: {
              masterSku: alert.sku,
              isResolved: false,
            },
            data: {
              isResolved: true,
              resolvedAt: new Date(),
            },
          })
        }
      }
    } catch (e) {
      // Table might not exist or be empty, that's ok
      console.log('Note: Could not update Alert table:', e)
    }

    return NextResponse.json({
      success: true,
      message: `Dismissed ${insightIds.length} insight(s)`,
      dismissedIds: insightIds,
    })
  } catch (error) {
    console.error('Error dismissing insights:', error)
    return NextResponse.json(
      { error: 'Failed to dismiss insights' },
      { status: 500 }
    )
  }
}

