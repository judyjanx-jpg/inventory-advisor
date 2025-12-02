'use client'

import { SyncProvider } from './SyncProvider'
import { GlobalSyncBar } from './GlobalSyncBar'
import { ReactNode } from 'react'

export function SyncWrapper({ children }: { children: ReactNode }) {
  return (
    <SyncProvider>
      <GlobalSyncBar />
      <div className="sync-wrapper">
        {children}
      </div>
    </SyncProvider>
  )
}


