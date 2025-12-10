import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Available card types with their default settings
const DEFAULT_CARDS = [
  { cardType: 'tasks', isEnabled: true, column: 'left', sortOrder: 0 },
  { cardType: 'profit', isEnabled: true, column: 'left', sortOrder: 1 },
  { cardType: 'schedule', isEnabled: true, column: 'right', sortOrder: 0 },
  { cardType: 'goals', isEnabled: false, column: 'left', sortOrder: 2 },
  { cardType: 'top_products', isEnabled: false, column: 'right', sortOrder: 1 },
  { cardType: 'inventory_summary', isEnabled: false, column: 'right', sortOrder: 2 },
]

export async function GET(request: NextRequest) {
  try {
    // Get existing card configs
    let cards = await prisma.dashboardCard.findMany({
      where: { userId: 1 },
      orderBy: [{ column: 'asc' }, { sortOrder: 'asc' }]
    })

    // If no cards exist, create defaults
    if (cards.length === 0) {
      for (const card of DEFAULT_CARDS) {
        await prisma.dashboardCard.create({
          data: { userId: 1, ...card }
        })
      }
      cards = await prisma.dashboardCard.findMany({
        where: { userId: 1 },
        orderBy: [{ column: 'asc' }, { sortOrder: 'asc' }]
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
        settings: c.settings ? JSON.parse(c.settings) : null
      })),
      availableCards: DEFAULT_CARDS.map(c => c.cardType)
    })
  } catch (error) {
    console.error('Dashboard cards API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dashboard cards'
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { cardType, isEnabled, column, sortOrder } = body

    if (!cardType) {
      return NextResponse.json({
        success: false,
        error: 'Card type is required'
      }, { status: 400 })
    }

    // Upsert the card config
    const card = await prisma.dashboardCard.upsert({
      where: {
        userId_cardType: { userId: 1, cardType }
      },
      update: {
        isEnabled: isEnabled !== undefined ? isEnabled : undefined,
        column: column || undefined,
        sortOrder: sortOrder !== undefined ? sortOrder : undefined
      },
      create: {
        userId: 1,
        cardType,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        column: column || 'left',
        sortOrder: sortOrder !== undefined ? sortOrder : 99
      }
    })

    return NextResponse.json({
      success: true,
      card: {
        id: card.id,
        cardType: card.cardType,
        isEnabled: card.isEnabled,
        column: card.column,
        sortOrder: card.sortOrder
      },
      message: isEnabled ? `Added ${cardType} card to dashboard` : `Removed ${cardType} card from dashboard`
    })
  } catch (error) {
    console.error('Update dashboard card error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update dashboard card'
    }, { status: 500 })
  }
}

