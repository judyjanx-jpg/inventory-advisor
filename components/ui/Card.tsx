import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export function Card({ children, className, hover = false, onClick }: CardProps) {
  return (
    <div 
      className={cn(
        "bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden",
        hover && "card-hover cursor-pointer",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children: ReactNode
  className?: string
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn("px-6 py-4 border-b border-slate-700/50", className)}>
      {children}
    </div>
  )
}

interface CardTitleProps {
  children: ReactNode
  className?: string
}

export function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3 className={cn("text-lg font-semibold text-white", className)}>
      {children}
    </h3>
  )
}

interface CardDescriptionProps {
  children: ReactNode
  className?: string
}

export function CardDescription({ children, className }: CardDescriptionProps) {
  return (
    <p className={cn("text-sm text-slate-400 mt-1", className)}>
      {children}
    </p>
  )
}

interface CardContentProps {
  children: ReactNode
  className?: string
}

export function CardContent({ children, className }: CardContentProps) {
  return (
    <div className={cn("px-6 py-4", className)}>
      {children}
    </div>
  )
}

interface CardFooterProps {
  children: ReactNode
  className?: string
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn("px-6 py-4 border-t border-slate-700/50 bg-slate-900/30", className)}>
      {children}
    </div>
  )
}

// Stat Card Component
interface StatCardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon?: ReactNode
  iconBg?: string
}

export function StatCard({ title, value, change, changeType = 'neutral', icon, iconBg = 'bg-cyan-500/20' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">{title}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
            {change && (
              <p className={cn(
                "text-sm mt-1",
                changeType === 'positive' && "text-emerald-400",
                changeType === 'negative' && "text-red-400",
                changeType === 'neutral' && "text-slate-400"
              )}>
                {change}
              </p>
            )}
          </div>
          {icon && (
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", iconBg)}>
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
