'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import Sidebar, { useSidebar, SidebarProvider } from './Sidebar'
import { useSyncContext } from '@/components/sync/SyncProvider'
import FloatingOrb from '@/components/floating-ai/FloatingOrb'
import { Menu } from 'lucide-react'

// Public routes where admin layout should not be applied
const PUBLIC_ROUTES = ['/support', '/portal', '/warranty', '/faq', '/track', '/time-clock']

function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar()
  const { syncState } = useSyncContext()
  const isSyncing = syncState.status === 'syncing' || syncState.status === 'success' || syncState.status === 'error'

  return (
    <main className={cn(
      "flex-1 transition-all duration-300 min-w-0",
      // On mobile: no margin (full width)
      // On desktop: margin based on sidebar state
      "ml-0 md:ml-16",
      !collapsed && "md:ml-64"
    )}>
      {/* Mobile Header with Menu Button */}
      <div className="sticky top-0 z-30 md:hidden bg-[var(--background)] border-b border-[var(--border)] px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--foreground)] touch-manipulation"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">IA</span>
          </div>
          <span className="font-semibold text-[var(--foreground)]">Inventory Advisor</span>
        </div>
      </div>

      <div className={cn(
        "p-4 md:p-8",
        isSyncing ? 'pt-4 md:pt-20' : ''
      )}>
        {children}
      </div>
    </main>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Check if we're on a public route - if so, render without admin layout
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname?.startsWith(route))
  if (isPublicRoute) {
    return <>{children}</>
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-[var(--background)]">
        <Sidebar />
        <MainContent>
          {children}
        </MainContent>
        <FloatingOrb />
      </div>
    </SidebarProvider>
  )
}
