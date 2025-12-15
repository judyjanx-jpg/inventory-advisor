'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import Sidebar, { useSidebar } from './Sidebar'
import { useSyncContext } from '@/components/sync/SyncProvider'
import FloatingOrb from '@/components/floating-ai/FloatingOrb'

// Public routes where admin layout should not be applied
const PUBLIC_ROUTES = ['/support', '/portal', '/warranty', '/faq', '/track']

function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  const { syncState } = useSyncContext()
  const isSyncing = syncState.status === 'syncing' || syncState.status === 'success' || syncState.status === 'error'

  return (
    <main className={cn(
      "flex-1 transition-all duration-300",
      collapsed ? "ml-16" : "ml-64"
    )}>
      <div className={`p-8 ${isSyncing ? 'pt-20' : ''}`}>
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
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar />
      <MainContent>
        {children}
      </MainContent>
      <FloatingOrb />
    </div>
  )
}
