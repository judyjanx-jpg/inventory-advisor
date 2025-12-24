'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import MainLayout from '@/components/layout/MainLayout'
import GreetingHeader from '@/components/dashboard/GreetingHeader'
import TasksCard from '@/components/dashboard/TasksCard'
import ScheduleCard from '@/components/dashboard/ScheduleCard'
import ProfitCard from '@/components/dashboard/ProfitCard'
import GoalsCard from '@/components/dashboard/GoalsCard'
import AiQueryCard from '@/components/dashboard/AiQueryCard'
import AiActionCard from '@/components/dashboard/AiActionCard'
import AIInsightsCard from '@/components/dashboard/AIInsightsCard'
import UserToolsSection from '@/components/dashboard/UserToolsSection'
import DraggableCard from '@/components/dashboard/DraggableCard'
import { Plus, Eye, ChevronDown } from 'lucide-react'

interface DashboardData {
  userName: string
  yesterdayProfit: number
  tasks: {
    itemsToOrder: { count: number; nextDate: string | null; items: any[] }
    itemsToShip: { count: number; nextDate: string | null; items: any[] }
    outOfStock: { count: number; items: any[] }
    lateShipments: { count: number; items: any[] }
    reminders?: { count: number; items: any[] }
  }
  profit: {
    periods: Array<{
      label: string
      date: string
      profit: number
      change: number | null
    }>
  }
}

interface CardConfig {
  id: number
  cardType: string
  isEnabled: boolean
  column: string
  sortOrder: number
  height: number | null
  isCollapsed: boolean
}

const CARD_NAMES: Record<string, string> = {
  'tasks': 'Today\'s Tasks',
  'profit': 'Quick Profit',
  'schedule': 'Schedule',
  'goals': 'My List',
  'top_products': 'Top Products',
  'inventory_summary': 'Inventory Summary',
  'ai_insights': 'AI Insights',
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [cards, setCards] = useState<CardConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [cardsLoaded, setCardsLoaded] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showHiddenMenu, setShowHiddenMenu] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    fetchDashboardData()
    fetchCardConfig()
    
    // Listen for refresh events from other components (e.g., ScheduleCard)
    const handleRefresh = () => {
      fetchDashboardData()
    }
    window.addEventListener('dashboard-refresh', handleRefresh)
    
    return () => {
      window.removeEventListener('dashboard-refresh', handleRefresh)
    }
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClick = () => setShowHiddenMenu(false)
    if (showHiddenMenu) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [showHiddenMenu])

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('/api/dashboard')
      const result = await res.json()
      if (result.success) setData(result.data)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCardConfig = async () => {
    try {
      const res = await fetch('/api/dashboard/cards')
      const result = await res.json()
      if (result.success) setCards(result.cards)
    } catch (error) {
      console.error('Error fetching card config:', error)
    } finally {
      setCardsLoaded(true)
    }
  }

  const updateCardConfig = async (cardType: string, updates: Partial<CardConfig>) => {
    try {
      await fetch('/api/dashboard/cards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardType, ...updates })
      })
    } catch (error) {
      console.error('Error updating card config:', error)
    }
  }

  const handleHeightChange = (cardType: string, height: number | null) => {
    setCards(prev => prev.map(c => c.cardType === cardType ? { ...c, height } : c))
    updateCardConfig(cardType, { height })
  }

  const handleCollapsedChange = (cardType: string, isCollapsed: boolean) => {
    setCards(prev => prev.map(c => c.cardType === cardType ? { ...c, isCollapsed } : c))
    updateCardConfig(cardType, { isCollapsed })
  }

  const handleHideCard = (cardType: string) => {
    setCards(prev => prev.map(c => c.cardType === cardType ? { ...c, isEnabled: false } : c))
    updateCardConfig(cardType, { isEnabled: false })
  }

  const handleShowCard = (cardType: string) => {
    setCards(prev => prev.map(c => c.cardType === cardType ? { ...c, isEnabled: true } : c))
    updateCardConfig(cardType, { isEnabled: true })
    setShowHiddenMenu(false)
  }

  const getColumnCards = (column: string) => {
    return cards
      .filter(c => c.column === column && c.isEnabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  const getHiddenCards = () => {
    return cards.filter(c => !c.isEnabled)
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeCard = cards.find(c => c.cardType === active.id)
    const overCard = cards.find(c => c.cardType === over.id)
    
    if (!activeCard || !overCard) return
    if (activeCard.column === overCard.column) return

    // Move card to different column
    setCards(prev => prev.map(c => 
      c.cardType === active.id 
        ? { ...c, column: overCard.column }
        : c
    ))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    
    if (!over || active.id === over.id) return

    const activeCard = cards.find(c => c.cardType === active.id)
    const overCard = cards.find(c => c.cardType === over.id)
    
    if (!activeCard || !overCard) return

    // Same column - reorder
    if (activeCard.column === overCard.column) {
      const columnCards = getColumnCards(activeCard.column)
      const oldIndex = columnCards.findIndex(c => c.cardType === active.id)
      const newIndex = columnCards.findIndex(c => c.cardType === over.id)
      
      const reordered = arrayMove(columnCards, oldIndex, newIndex)
      
      // Update sort orders
      const updates = reordered.map((card, index) => ({
        cardType: card.cardType,
        sortOrder: index
      }))

      setCards(prev => prev.map(c => {
        const update = updates.find(u => u.cardType === c.cardType)
        return update ? { ...c, sortOrder: update.sortOrder } : c
      }))

      // Save to server
      updates.forEach(u => updateCardConfig(u.cardType, { sortOrder: u.sortOrder }))
    } else {
      // Different column - move and save
      updateCardConfig(activeCard.cardType, { column: overCard.column })
    }
  }

  const renderCard = (cardType: string) => {
    switch (cardType) {
      case 'tasks':
        return <TasksCard tasks={data?.tasks} onRefresh={fetchDashboardData} />
      case 'profit':
        return <ProfitCard initialData={data?.profit} yesterdayProfit={data?.yesterdayProfit} />
      case 'schedule':
        return <ScheduleCard />
      case 'goals':
        return <GoalsCard />
      case 'ai_insights':
        return <AIInsightsCard />
      default:
        return null
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse text-[var(--muted-foreground)]">Loading your dashboard...</div>
        </div>
      </MainLayout>
    )
  }

  const leftCards = getColumnCards('left')
  const rightCards = getColumnCards('right')
  const hiddenCards = getHiddenCards()

  return (
    <MainLayout>
      <div className="space-y-6">
        <GreetingHeader 
          userName={data?.userName || 'there'} 
          yesterdayProfit={data?.yesterdayProfit || 0}
        >
          {/* Hidden Cards Button */}
          {hiddenCards.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowHiddenMenu(!showHiddenMenu)
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--hover-bg)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-sm border border-[var(--border)]"
              >
                <Eye className="w-4 h-4" />
                <span>{hiddenCards.length} hidden</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showHiddenMenu ? 'rotate-180' : ''}`} />
              </button>
              
              {showHiddenMenu && (
                <div 
                  className="absolute right-0 mt-2 w-56 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 text-xs text-[var(--muted-foreground)] font-medium border-b border-[var(--border)]">
                    Hidden Cards
                  </div>
                  {hiddenCards.map(card => (
                    <button
                      key={card.cardType}
                      onClick={() => handleShowCard(card.cardType)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--hover-bg)] transition-colors"
                    >
                      <Plus className="w-4 h-4 text-[var(--primary)]" />
                      {CARD_NAMES[card.cardType] || card.cardType}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </GreetingHeader>

        {cardsLoaded ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column */}
              <SortableContext items={leftCards.map(c => c.cardType)} strategy={verticalListSortingStrategy}>
                <div className="space-y-6 min-h-[200px]">
                  {leftCards.map(card => (
                    <DraggableCard
                      key={card.cardType}
                      id={card.cardType}
                      height={card.height}
                      isCollapsed={card.isCollapsed}
                      onHeightChange={(h) => handleHeightChange(card.cardType, h)}
                      onCollapsedChange={(c) => handleCollapsedChange(card.cardType, c)}
                      onHide={() => handleHideCard(card.cardType)}
                    >
                      {renderCard(card.cardType)}
                    </DraggableCard>
                  ))}
                  {leftCards.length === 0 && (
                    <div className="h-32 border-2 border-dashed border-[var(--border)] rounded-xl flex items-center justify-center text-[var(--muted-foreground)]">
                      Drop cards here
                    </div>
                  )}
                </div>
              </SortableContext>

              {/* Right Column */}
              <SortableContext items={rightCards.map(c => c.cardType)} strategy={verticalListSortingStrategy}>
                <div className="space-y-6 min-h-[200px]">
                  {rightCards.map(card => (
                    <DraggableCard
                      key={card.cardType}
                      id={card.cardType}
                      height={card.height}
                      isCollapsed={card.isCollapsed}
                      onHeightChange={(h) => handleHeightChange(card.cardType, h)}
                      onCollapsedChange={(c) => handleCollapsedChange(card.cardType, c)}
                      onHide={() => handleHideCard(card.cardType)}
                    >
                      {renderCard(card.cardType)}
                    </DraggableCard>
                  ))}
                  {rightCards.length === 0 && (
                    <div className="h-32 border-2 border-dashed border-[var(--border)] rounded-xl flex items-center justify-center text-[var(--muted-foreground)]">
                      Drop cards here
                    </div>
                  )}
                </div>
              </SortableContext>
            </div>

            <DragOverlay>
              {activeId && (
                <div className="opacity-80 shadow-2xl rounded-xl">
                  {renderCard(activeId)}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-6 min-h-[200px]">
              <div className="h-48 rounded-xl bg-[var(--card)] border border-[var(--border)] animate-pulse" />
              <div className="h-48 rounded-xl bg-[var(--card)] border border-[var(--border)] animate-pulse" />
            </div>
            <div className="space-y-6 min-h-[200px]">
              <div className="h-48 rounded-xl bg-[var(--card)] border border-[var(--border)] animate-pulse" />
              <div className="h-48 rounded-xl bg-[var(--card)] border border-[var(--border)] animate-pulse" />
            </div>
          </div>
        )}

        {/* AI Cards - Full Width */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AiQueryCard />
          <AiActionCard onActionComplete={() => { fetchDashboardData(); fetchCardConfig(); }} />
        </div>

        {/* User Tools Section */}
        <UserToolsSection />
      </div>
    </MainLayout>
  )
}
