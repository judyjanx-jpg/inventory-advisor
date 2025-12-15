'use client'

import { useState, useEffect, useRef, createContext, useContext } from 'react'
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
  ClipboardCheck,
  Sun,
  Moon,
  Headphones,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

// Sidebar context
const SidebarContext = createContext<{
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}>({
  collapsed: false,
  setCollapsed: () => {},
})

export const useSidebar = () => useContext(SidebarContext)

// Public routes where sidebar should not appear
const PUBLIC_ROUTES = ['/support', '/portal', '/warranty', '/faq', '/track']

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
  { name: 'Profit', href: '/profit', icon: TrendingUp },
  { name: 'Audit', href: '/audit', icon: ClipboardCheck },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Customer Support', href: '/app/support', icon: Headphones },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Collapsed state with localStorage persistence
  const [collapsed, setCollapsedState] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed')
      return saved === 'true'
    }
    return false
  })

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value)
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', String(value))
    }
  }

  // Don't render sidebar on public routes
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname?.startsWith(route))
  if (isPublicRoute) {
    return null
  }

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

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // Fetch last sync time - only once on mount, no continuous polling
  useEffect(() => {
    async function fetchSyncStatus() {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout
        
        const res = await fetch('/api/sync/status', { signal: controller.signal })
        clearTimeout(timeoutId)
        
        const data = await res.json()
        if (data.success && data.queues) {
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
        // Ignore errors (including abort)
      }
    }
    
    fetchSyncStatus()
    // Removed continuous polling - only fetch on mount
  }, [])

  const handleSyncNow = async () => {
    if (syncing) return // Prevent double-clicks
    
    // Clear any existing poll interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    
    setSyncing(true)
    
    try {
      const response = await fetch('/api/sync/trigger?type=all', { method: 'POST' })
      const data = await response.json()
      
      if (data.success) {
        setLastSync('Syncing...')
        console.log('✅ Sync triggered:', data.jobs || data.job)
        
        // Simple approach: just show "syncing" for 10 seconds, then refresh status once
        setTimeout(async () => {
          setSyncing(false)
          try {
            const statusRes = await fetch('/api/sync/status')
            const statusData = await statusRes.json()
            if (statusData.success && statusData.queues) {
              let latestTime: Date | null = null
              for (const queue of statusData.queues) {
                if (queue.lastCompleted?.finishedOn) {
                  const time = new Date(queue.lastCompleted.finishedOn)
                  if (!latestTime || time > latestTime) {
                    latestTime = time
                  }
                }
              }
              setLastSync(latestTime ? formatTimeAgo(latestTime) : 'Just now')
            }
          } catch {
            setLastSync('Just now')
          }
        }, 10000) // Check status after 10 seconds
        
      } else {
        console.error('❌ Sync failed:', data.error)
        setSyncing(false)
        setLastSync('Failed')
      }
    } catch (e: any) {
      console.error('❌ Sync error:', e)
      setSyncing(false)
      setLastSync('Error')
    }
  }

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className={cn(
        "flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] h-screen fixed left-0 top-0 transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}>
        {/* Logo */}
        <div className="flex items-center h-16 border-b border-[var(--sidebar-border)] relative">
          <div className={cn(
            "flex items-center transition-all duration-300",
            collapsed ? "justify-center w-full px-2" : "gap-3 px-6 w-full"
          )}>
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-[var(--foreground)]">Inventory</h1>
                <p className="text-[10px] text-[var(--muted-foreground)] -mt-1">ADVISOR</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[var(--sidebar-bg)] border border-[var(--sidebar-border)] rounded-full flex items-center justify-center hover:bg-[var(--hover-bg)] transition-colors z-10",
              collapsed ? "right-2" : ""
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-[var(--muted-foreground)]" />
            )}
          </button>
        </div>
      
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className={cn("space-y-1", collapsed ? "px-2" : "px-3")}>
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg transition-all duration-200 group',
                  collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-[var(--primary)] border border-cyan-500/30'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]'
                )}
                title={collapsed ? item.name : undefined}
              >
                <Icon className={cn(
                  "h-5 w-5 flex-shrink-0",
                  collapsed ? "" : "mr-3",
                  isActive ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"
                )} />
                {!collapsed && (
                  <span className="text-sm font-medium truncate">{item.name}</span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>
      
      {/* AI Advisor Button */}
      <div className={cn("border-t border-[var(--sidebar-border)]", collapsed ? "p-2" : "p-4")}>
        <Link
          href="/advisor"
          className={cn(
            "flex items-center rounded-xl transition-all duration-200",
            collapsed ? "justify-center px-2 py-3" : "px-4 py-3",
            pathname === '/advisor'
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25"
              : "bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-400 border border-cyan-500/30 hover:from-cyan-500/20 hover:to-blue-500/20"
          )}
          title={collapsed ? "AI Advisor" : undefined}
        >
          <MessageSquare className={cn("h-5 w-5 flex-shrink-0", collapsed ? "" : "mr-3")} />
          {!collapsed && (
            <>
              <span className="text-sm font-medium">AI Advisor</span>
              <span className="ml-auto bg-cyan-500/20 text-cyan-300 text-xs px-2 py-0.5 rounded-full">
                AI
              </span>
            </>
          )}
        </Link>
      </div>

      {/* Sync Status Section */}
      <div className={cn("border-t border-[var(--sidebar-border)] py-3", collapsed ? "px-2" : "px-4")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-md transition-all",
                syncing
                  ? "bg-cyan-500/20 text-cyan-400 cursor-not-allowed"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
              )}
              title={syncing ? 'Syncing...' : 'Sync now'}
            >
              <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
            </button>
            {lastSync && (
              <div className="text-[8px] text-[var(--muted-foreground)] text-center leading-tight">
                {lastSync}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="text-xs text-[var(--muted-foreground)]">
              {lastSync ? (
                <>Last sync: <span className="text-[var(--foreground)] opacity-70">{lastSync}</span></>
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
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--hover-bg)] hover:text-[var(--foreground)]"
              )}
            >
              <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        )}
      </div>

      {/* User/Status Section */}
      <div className={cn("border-t border-[var(--sidebar-border)]", collapsed ? "p-2" : "p-4")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">K</span>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">K</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--foreground)] truncate">KISPER</p>
              <p className="text-xs text-[var(--muted-foreground)]">Amazon FBA</p>
            </div>
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          </div>
        )}
      </div>
      </div>
    </SidebarContext.Provider>
  )
}