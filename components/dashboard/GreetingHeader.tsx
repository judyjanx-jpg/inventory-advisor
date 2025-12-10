'use client'

import { Sun, Moon, CloudSun, Coffee } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { ReactNode } from 'react'

interface GreetingHeaderProps {
  userName: string
  yesterdayProfit: number
  children?: ReactNode
}

export default function GreetingHeader({ userName, yesterdayProfit, children }: GreetingHeaderProps) {
  const getGreeting = () => {
    const hour = new Date().getHours()
    
    if (hour >= 5 && hour < 12) {
      return { text: 'Good morning', icon: Sun, iconColor: 'text-amber-400' }
    } else if (hour >= 12 && hour < 17) {
      return { text: 'Good afternoon', icon: CloudSun, iconColor: 'text-orange-400' }
    } else if (hour >= 17 && hour < 21) {
      return { text: 'Good evening', icon: Moon, iconColor: 'text-indigo-400' }
    } else {
      return { text: 'Working late', icon: Coffee, iconColor: 'text-amber-500' }
    }
  }

  const greeting = getGreeting()
  const Icon = greeting.icon

  return (
    <div className="bg-gradient-to-r from-[var(--primary)]/10 via-[var(--accent)]/5 to-transparent rounded-2xl p-6 border border-[var(--border)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={`w-8 h-8 ${greeting.iconColor}`} />
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">
              {greeting.text}, {userName}!
            </h1>
            {yesterdayProfit !== 0 && (
              <p className="text-[var(--muted-foreground)] mt-1">
                You made{' '}
                <span className={yesterdayProfit >= 0 ? 'text-emerald-500 font-semibold' : 'text-red-500 font-semibold'}>
                  {formatCurrency(Math.abs(yesterdayProfit))}
                </span>
                {' '}in profit yesterday
                {yesterdayProfit < 0 && ' (loss)'}
              </p>
            )}
            {yesterdayProfit === 0 && (
              <p className="text-[var(--muted-foreground)] mt-1">
                Ready to have a great day!
              </p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
