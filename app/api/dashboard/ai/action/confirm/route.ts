import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pendingActions } from '@/lib/pending-actions'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { actionId } = body

    if (!actionId) {
      return NextResponse.json({
        success: false,
        error: 'Action ID is required'
      }, { status: 400 })
    }

    const action = pendingActions.get(actionId)
    if (!action) {
      return NextResponse.json({
        success: false,
        error: 'Action expired or not found. Please try again.'
      }, { status: 404 })
    }

    // Execute the action
    let message = 'Action completed!'

    switch (action.type) {
      case 'update_inventory':
        if (action.sku && action.toValue !== undefined) {
          await prisma.inventoryLevel.updateMany({
            where: { masterSku: action.sku },
            data: { warehouseAvailable: parseInt(action.toValue) }
          })
          message = `Done! Updated warehouse quantity for ${action.sku} to ${action.toValue}.`
        }
        break

      case 'update_cost':
        if (action.sku && action.toValue !== undefined) {
          await prisma.product.updateMany({
            where: { sku: action.sku },
            data: { cost: parseFloat(action.toValue) }
          })
          message = `Done! Updated cost for ${action.sku} to $${parseFloat(action.toValue).toFixed(2)}.`
        }
        break

      case 'update_po':
        if (action.poNumber && action.toValue) {
          await prisma.purchaseOrder.updateMany({
            where: { poNumber: action.poNumber },
            data: { status: action.toValue }
          })
          message = `Done! Marked PO #${action.poNumber} as ${action.toValue}.`
        }
        break

      case 'dismiss_recommendations':
        if (action.sku) {
          // Mark related inventory alerts as resolved
          await prisma.inventoryAlert.updateMany({
            where: { 
              masterSku: action.sku,
              isResolved: false
            },
            data: { 
              isResolved: true,
              resolvedAt: new Date()
            }
          })
          message = `Done! Dismissed recommendations for ${action.sku}.`
        }
        break

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action type'
        }, { status: 400 })
    }

    // Remove the pending action
    pendingActions.delete(actionId)

    // Log the action
    console.log(`AI Action executed: ${action.type}`, {
      actionId,
      command: action.command,
      sku: action.sku,
      poNumber: action.poNumber,
      fromValue: action.fromValue,
      toValue: action.toValue
    })

    return NextResponse.json({
      success: true,
      message
    })
  } catch (error) {
    console.error('AI Action confirm error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to execute action. Please try again.'
    }, { status: 500 })
  }
}

