import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pendingActions } from '@/lib/pending-actions'

// Map table names to Prisma models
const tableModelMap: Record<string, string> = {
  'products': 'product',
  'inventory_levels': 'inventoryLevel',
  'purchase_orders': 'purchaseOrder',
  'purchase_order_items': 'purchaseOrderItem',
  'suppliers': 'supplier',
  'goals': 'goal',
  'dashboard_cards': 'dashboardCard',
  'calendar_events': 'calendarEvent',
  'user_schedule': 'userSchedule',
  'user_profile': 'userProfile',
}

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

    let message = 'Done!'
    const modelName = tableModelMap[action.table] || action.table
    const model = (prisma as any)[modelName]

    if (!model) {
      return NextResponse.json({
        success: false,
        error: `Unknown table: ${action.table}`
      }, { status: 400 })
    }

    try {
      switch (action.type) {
        case 'create':
          await model.create({ data: action.data })
          message = `Created successfully: ${action.description}`
          break

        case 'update':
          if (action.upsert) {
            // Special handling for dashboard cards which need upsert
            if (action.table === 'dashboard_cards') {
              await prisma.dashboardCard.upsert({
                where: { 
                  userId_cardType: { 
                    userId: 1, 
                    cardType: action.where.cardType 
                  } 
                },
                update: action.data,
                create: { 
                  userId: 1, 
                  cardType: action.where.cardType,
                  ...action.data,
                  column: action.data.column || 'left',
                  sortOrder: action.data.sortOrder || 99
                }
              })
            } else {
              // Generic upsert - try update first, then create
              const existing = await model.findFirst({ where: action.where })
              if (existing) {
                await model.update({ where: action.where, data: action.data })
              } else {
                await model.create({ data: { ...action.where, ...action.data } })
              }
            }
          } else {
            // Check if record exists
            const whereKey = Object.keys(action.where)[0]
            const whereValue = action.where[whereKey]
            
            // Handle different table structures
            if (action.table === 'products') {
              await prisma.product.update({
                where: { sku: whereValue },
                data: action.data
              })
            } else if (action.table === 'inventory_levels') {
              await prisma.inventoryLevel.updateMany({
                where: { masterSku: whereValue },
                data: action.data
              })
            } else if (action.table === 'purchase_orders') {
              await prisma.purchaseOrder.updateMany({
                where: { poNumber: whereValue },
                data: action.data
              })
            } else if (action.table === 'goals') {
              await prisma.goal.update({
                where: { id: typeof whereValue === 'number' ? whereValue : parseInt(whereValue) },
                data: action.data
              })
            } else if (action.table === 'suppliers') {
              await prisma.supplier.update({
                where: { id: typeof whereValue === 'number' ? whereValue : parseInt(whereValue) },
                data: action.data
              })
            } else {
              // Generic update
              await model.updateMany({ where: action.where, data: action.data })
            }
          }
          message = `Updated successfully: ${action.description}`
          break

        case 'delete':
          if (action.table === 'goals') {
            await prisma.goal.delete({
              where: { id: typeof action.where.id === 'number' ? action.where.id : parseInt(action.where.id) }
            })
          } else if (action.table === 'dashboard_cards') {
            // For dashboard cards, we disable instead of delete
            await prisma.dashboardCard.updateMany({
              where: action.where,
              data: { isEnabled: false }
            })
          } else if (action.table === 'calendar_events') {
            await prisma.calendarEvent.delete({
              where: { id: typeof action.where.id === 'number' ? action.where.id : parseInt(action.where.id) }
            })
          } else {
            await model.deleteMany({ where: action.where })
          }
          message = `Deleted successfully: ${action.description}`
          break

        default:
          return NextResponse.json({
            success: false,
            error: `Unknown operation type: ${action.type}`
          }, { status: 400 })
      }
    } catch (dbError: any) {
      console.error('Database operation error:', dbError)
      return NextResponse.json({
        success: false,
        error: `Database error: ${dbError.message || 'Operation failed'}`
      }, { status: 500 })
    }

    // Remove pending action
    pendingActions.delete(actionId)

    // Log the action
    console.log(`AI Action executed: ${action.type} ${action.table}`, {
      actionId,
      command: action.command,
      where: action.where,
      data: action.data
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
