import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Available card types with their default settings
const DEFAULT_CARDS = [
  { cardType: 'tasks', isEnabled: true, column: 'left', sortOrder: 0 },
  { cardType: 'profit', isEnabled: true, column: 'left', sortOrder: 1 },
  { cardType: 'schedule', isEnabled: true, column: 'right', sortOrder: 0 },
  { cardType: 'ai_insights', isEnabled: true, column: 'right', sortOrder: 1 },
  { cardType: 'goals', isEnabled: false, column: 'left', sortOrder: 2 },
  { cardType: 'top_products', isEnabled: false, column: 'right', sortOrder: 2 },
  { cardType: 'inventory_summary', isEnabled: false, column: 'right', sortOrder: 3 },
]

export async function GET(request: NextRequest) {
  try {
    // Check for reset query parameter
    const { searchParams } = new URL(request.url)
    const reset = searchParams.get('reset') === 'true'

    // Try to find cards - if table doesn't exist, this will throw
    let cards: any[] = []
    try {
      cards = await prisma.dashboardCard.findMany({
        where: { userId: 1 },
        orderBy: [{ column: 'asc' }, { sortOrder: 'asc' }]
      })

      // If reset requested or no cards exist, create/update defaults
      if (reset || cards.length === 0) {
        // Delete all existing cards if reset
        if (reset && cards.length > 0) {
          await prisma.dashboardCard.deleteMany({
            where: { userId: 1 }
          })
        }

        // Create all default cards
        for (const card of DEFAULT_CARDS) {
          await prisma.dashboardCard.upsert({
            where: {
              userId_cardType: { userId: 1, cardType: card.cardType }
            },
            update: {
              isEnabled: card.isEnabled,
              column: card.column,
              sortOrder: card.sortOrder
            },
            create: {
              userId: 1,
              ...card
            }
          })
        }
        
        // Refresh cards after updates
        cards = await prisma.dashboardCard.findMany({
          where: { userId: 1 },
          orderBy: [{ column: 'asc' }, { sortOrder: 'asc' }]
        })
      } else {
        // Ensure default enabled cards exist and are enabled
        const existingCardTypes = new Set(cards.map((c: any) => c.cardType))
        for (const defaultCard of DEFAULT_CARDS) {
          if (!existingCardTypes.has(defaultCard.cardType)) {
            // Create missing default card
            await prisma.dashboardCard.create({
              data: { userId: 1, ...defaultCard }
            })
          } else if (defaultCard.isEnabled) {
            // Ensure default enabled cards are actually enabled
            const existingCard = cards.find((c: any) => c.cardType === defaultCard.cardType)
            if (existingCard && !existingCard.isEnabled) {
              await prisma.dashboardCard.update({
                where: { id: existingCard.id },
                data: { isEnabled: true }
              })
            }
          }
        }
        // Refresh cards after updates
        cards = await prisma.dashboardCard.findMany({
          where: { userId: 1 },
          orderBy: [{ column: 'asc' }, { sortOrder: 'asc' }]
        })
      }
    } catch (dbError: any) {
      // If table doesn't exist, return empty array and log error
      console.error('DashboardCard table may not exist:', dbError?.message)
      // Return empty cards array - frontend will handle gracefully
      return NextResponse.json({
        success: true,
        cards: [],
        availableCards: DEFAULT_CARDS.map(c => c.cardType),
        error: 'Table not initialized. Please run database migrations.'
      })
    }

    return NextResponse.json({
      success: true,
      cards: cards.map(c => ({
        id: c.id,
        cardType: c.cardType,
        isEnabled: c.isEnabled,
        column: c.column,
        sortOrder: c.sortOrder,
        height: c.height,
        isCollapsed: c.isCollapsed,
        settings: c.settings ? JSON.parse(c.settings) : null
      })),
      availableCards: DEFAULT_CARDS.map(c => c.cardType)
    })
  } catch (error: any) {
    console.error('Dashboard cards API error:', error)
    const errorMessage = error?.message || String(error)
    
    // Check if it's a table doesn't exist error
    if (errorMessage.includes('does not exist') || errorMessage.includes('Unknown table')) {
      return NextResponse.json({
        success: false,
        error: 'Dashboard cards table does not exist. Please run: npx prisma db push',
        details: errorMessage
      }, { status: 500 })
    }
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dashboard cards',
      details: errorMessage
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { cardType, isEnabled, column, sortOrder, height, isCollapsed } = body

    if (!cardType) {
      return NextResponse.json({
        success: false,
        error: 'Card type is required'
      }, { status: 400 })
    }

    // Build update data - only include fields that were provided
    const updateData: any = {}
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled
    if (column !== undefined) updateData.column = column
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder
    if (height !== undefined) updateData.height = height
    if (isCollapsed !== undefined) updateData.isCollapsed = isCollapsed

    const card = await prisma.dashboardCard.upsert({
      where: {
        userId_cardType: { userId: 1, cardType }
      },
      update: updateData,
      create: {
        userId: 1,
        cardType,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        column: column || 'left',
        sortOrder: sortOrder !== undefined ? sortOrder : 99,
        height: height || null,
        isCollapsed: isCollapsed || false
      }
    })

    return NextResponse.json({
      success: true,
      card: {
        id: card.id,
        cardType: card.cardType,
        isEnabled: card.isEnabled,
        column: card.column,
        sortOrder: card.sortOrder,
        height: card.height,
        isCollapsed: card.isCollapsed
      }
    })
  } catch (error) {
    console.error('Update dashboard card error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update dashboard card'
    }, { status: 500 })
  }
}

