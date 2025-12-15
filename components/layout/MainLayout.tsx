'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import { useSyncContext } from '@/components/sync/SyncProvider'
import FloatingOrb from '@/components/floating-ai/FloatingOrb'

// Public routes where admin layout should not be applied
const PUBLIC_ROUTES = ['/support', '/portal', '/warranty', '/faq', '/track']

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { syncState } = useSyncContext()
  const isSyncing = syncState.status === 'syncing' || syncState.status === 'success' || syncState.status === 'error'

  // Check if we're on a public route - if so, render without admin layout
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname?.startsWith(route))
  if (isPublicRoute) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar />
      <main className="flex-1 ml-64">
        <div className={`p-8 ${isSyncing ? 'pt-20' : ''}`}>
          {children}
        </div>
      </main>
      <FloatingOrb />
    </div>
  )
}
