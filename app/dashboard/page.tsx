'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import GreetingHeader from '@/components/dashboard/GreetingHeader'
import TasksCard from '@/components/dashboard/TasksCard'
import ScheduleCard from '@/components/dashboard/ScheduleCard'
import ProfitCard from '@/components/dashboard/ProfitCard'
import GoalsCard from '@/components/dashboard/GoalsCard'
import AiQueryCard from '@/components/dashboard/AiQueryCard'
import AiActionCard from '@/components/dashboard/AiActionCard'

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
  cardType: string
  isEnabled: boolean
  column: string
  sortOrder: number
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [cards, setCards] = useState<CardConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
    fetchCardConfig()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('/api/dashboard')
      const result = await res.json()
      if (result.success) {
        setData(result.data)
      }
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
      if (result.success) {
        setCards(result.cards)
      }
    } catch (error) {
      console.error('Error fetching card config:', error)
    }
  }

  const isCardEnabled = (cardType: string) => {
    const card = cards.find(c => c.cardType === cardType)
    // Default enabled for core cards if no config exists
    if (!card) {
      return ['tasks', 'profit', 'schedule'].includes(cardType)
    }
    return card.isEnabled
  }

  const getLeftColumnCards = () => {
    const leftCards = cards.filter(c => c.column === 'left' && c.isEnabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    
    // If no config, return defaults
    if (leftCards.length === 0 && cards.length === 0) {
      return ['tasks', 'profit']
    }
    return leftCards.map(c => c.cardType)
  }

  const getRightColumnCards = () => {
    const rightCards = cards.filter(c => c.column === 'right' && c.isEnabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    
    if (rightCards.length === 0 && cards.length === 0) {
      return ['schedule']
    }
    return rightCards.map(c => c.cardType)
  }

  const renderCard = (cardType: string) => {
    switch (cardType) {
      case 'tasks':
        return <TasksCard key="tasks" tasks={data?.tasks} onRefresh={fetchDashboardData} />
      case 'profit':
        return <ProfitCard key="profit" initialData={data?.profit} />
      case 'schedule':
        return <ScheduleCard key="schedule" />
      case 'goals':
        return <GoalsCard key="goals" />
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

  const leftCards = getLeftColumnCards()
  const rightCards = getRightColumnCards()

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Greeting Header */}
        <GreetingHeader 
          userName={data?.userName || 'there'} 
          yesterdayProfit={data?.yesterdayProfit || 0}
        />

        {/* Main Grid - Dynamic Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column */}
          <div className="space-y-6">
            {leftCards.map(cardType => renderCard(cardType))}
          </div>

          {/* Right Column */}
          <div className="lg:h-full space-y-6">
            {rightCards.map(cardType => renderCard(cardType))}
          </div>
        </div>

        {/* AI Cards - Full Width */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* What would you like to see? */}
          <AiQueryCard />
          
          {/* What would you like to do? */}
          <AiActionCard onActionComplete={() => { fetchDashboardData(); fetchCardConfig(); }} />
        </div>
      </div>
    </MainLayout>
  )
}
