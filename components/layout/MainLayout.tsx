'use client'

import Sidebar from './Sidebar'
import { useSyncContext } from '@/components/sync/SyncProvider'
import FloatingOrb from '@/components/floating-ai/FloatingOrb'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { syncState } = useSyncContext()
  const isSyncing = syncState.status === 'syncing' || syncState.status === 'success' || syncState.status === 'error'

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
