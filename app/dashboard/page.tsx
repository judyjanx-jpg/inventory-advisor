'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import GreetingHeader from '@/components/dashboard/GreetingHeader'
import TasksCard from '@/components/dashboard/TasksCard'
import ScheduleCard from '@/components/dashboard/ScheduleCard'
import ProfitCard from '@/components/dashboard/ProfitCard'
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
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

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse text-[var(--muted-foreground)]">Loading your dashboard...</div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Greeting Header */}
        <GreetingHeader 
          userName={data?.userName || 'there'} 
          yesterdayProfit={data?.yesterdayProfit || 0}
        />

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Today's Tasks */}
            <TasksCard tasks={data?.tasks} onRefresh={fetchDashboardData} />
            
            {/* Quick Profit */}
            <ProfitCard initialData={data?.profit} />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Schedule & Calendar */}
            <ScheduleCard />
          </div>
        </div>

        {/* AI Cards - Full Width */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* What would you like to see? */}
          <AiQueryCard />
          
          {/* What would you like to do? */}
          <AiActionCard onActionComplete={fetchDashboardData} />
        </div>
      </div>
    </MainLayout>
  )
}
