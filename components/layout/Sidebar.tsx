'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Building2,
  ShoppingCart,
  FileText,
  Truck,
  Users,
  TrendingUp,
  BarChart3,
  Settings,
  MessageSquare,
  Sparkles,
  LineChart,
  RefreshCw,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Inventory', href: '/inventory', icon: Warehouse },
  { name: 'Forecasting', href: '/forecasting', icon: LineChart },
  { name: 'Warehouses', href: '/warehouses', icon: Building2 },
  { name: 'Orders', href: '/orders', icon: ShoppingCart },
  { name: 'Purchase Orders', href: '/purchase-orders', icon: FileText },
  { name: 'FBA Shipments', href: '/fba-shipments', icon: Truck },
  { name: 'Suppliers', href: '/suppliers', icon: Users },
  { name: 'Profits', href: '/profits', icon: TrendingUp },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Fetch last sync time
  useEffect(() => {
    async function fetchSyncStatus() {
      try {
        const res = await fetch('/api/sync/status')
        const data = await res.json()
        if (data.success && data.queues) {
          // Find the most recent completed job
          let latestTime: Date | null = null
          for (const queue of data.queues) {
            if (queue.lastCompleted?.finishedOn) {
              const time = new Date(queue.lastCompleted.finishedOn)
              if (!latestTime || time > latestTime) {
                latestTime = time
              }
            }
          }
          if (latestTime) {
            setLastSync(formatTimeAgo(latestTime))
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    fetchSyncStatus()
    const interval = setInterval(fetchSyncStatus, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/trigger?type=all', { method: 'POST' })
      // Update last sync time after a delay
      setTimeout(() => {
        setLastSync('Just now')
        setSyncing(false)
      }, 2000)
    } catch (e) {
      setSyncing(false)
    }
  }

  return (
    <div className="flex flex-col w-64 bg-slate-900 border-r border-slate-700/50 h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="flex items-center h-16 px-6 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Inventory</h1>
            <p className="text-[10px] text-slate-400 -mt-1">ADVISOR</p>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-3 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                )}
              >
                <Icon className={cn(
                  "mr-3 h-5 w-5",
                  isActive ? "text-cyan-400" : "text-slate-500"
                )} />
                {item.name}
              </Link>
            )
          })}
        </div>
      </nav>
      
      {/* AI Advisor Button */}
      <div className="border-t border-slate-700/50 p-4">
        <Link
          href="/advisor"
          className={cn(
            "flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200",
            pathname === '/advisor'
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25"
              : "bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-400 border border-cyan-500/30 hover:from-cyan-500/20 hover:to-blue-500/20"
          )}
        >
          <MessageSquare className="mr-3 h-5 w-5" />
          AI Advisor
          <span className="ml-auto bg-cyan-500/20 text-cyan-300 text-xs px-2 py-0.5 rounded-full">
            AI
          </span>
        </Link>
      </div>

      {/* Sync Status Section */}
      <div className="border-t border-slate-700/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {lastSync ? (
              <>Last sync: <span className="text-slate-400">{lastSync}</span></>
            ) : (
              'No sync data'
            )}
          </div>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all",
              syncing
                ? "bg-cyan-500/20 text-cyan-400 cursor-not-allowed"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            )}
          >
            <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* User/Status Section */}
      <div className="border-t border-slate-700/50 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">K</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">KISPER</p>
            <p className="text-xs text-slate-500">Amazon FBA</p>
          </div>
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  )
}
