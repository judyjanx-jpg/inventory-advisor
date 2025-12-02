'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface SyncState {
  status: 'idle' | 'syncing' | 'success' | 'error'
  type: string | null
  startedAt: Date | null
  message: string | null
  progress?: {
    phase: number
    totalPhases: number
    phaseName: string
  }
}

interface SyncContextType {
  syncState: SyncState
  startSync: (type: string) => void
  endSync: (status: 'success' | 'error', message?: string) => void
  updateProgress: (phase: number, totalPhases: number, phaseName: string) => void
  checkSyncStatus: () => Promise<void>
}

const defaultSyncState: SyncState = {
  status: 'idle',
  type: null,
  startedAt: null,
  message: null,
}

const SyncContext = createContext<SyncContextType | undefined>(undefined)

export function useSyncContext(): SyncContextType {
  const context = useContext(SyncContext)
  
  // Return safe defaults instead of throwing - handles SSR and initial render
  if (!context) {
    return {
      syncState: defaultSyncState,
      startSync: () => {},
      endSync: () => {},
      updateProgress: () => {},
      checkSyncStatus: async () => {},
    }
  }
  
  return context
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncState, setSyncState] = useState<SyncState>(defaultSyncState)

  const startSync = useCallback((type: string) => {
    setSyncState({
      status: 'syncing',
      type,
      startedAt: new Date(),
      message: null,
    })
  }, [])

  const endSync = useCallback((status: 'success' | 'error', message?: string) => {
    setSyncState(prev => ({
      ...prev,
      status,
      message: message || null,
    }))
    
    if (status === 'success') {
      setTimeout(() => {
        setSyncState(defaultSyncState)
      }, 5000)
    }
  }, [])

  const updateProgress = useCallback((phase: number, totalPhases: number, phaseName: string) => {
    setSyncState(prev => ({
      ...prev,
      progress: { phase, totalPhases, phaseName },
    }))
  }, [])

  const checkSyncStatus = useCallback(async () => {
    try {
      const amazonRes = await fetch('/api/settings/amazon')
      if (amazonRes.ok) {
        const data = await amazonRes.json()
        if (data.lastSyncStatus === 'running') {
          setSyncState({
            status: 'syncing',
            type: 'Amazon data',
            startedAt: data.lastSyncAt ? new Date(data.lastSyncAt) : new Date(),
            message: null,
          })
        }
      }
      
      const initialRes = await fetch('/api/amazon/sync/initial')
      if (initialRes.ok) {
        const data = await initialRes.json()
        if (data.status === 'running') {
          setSyncState({
            status: 'syncing',
            type: 'Initial Historical Sync',
            startedAt: data.startedAt ? new Date(data.startedAt) : new Date(),
            message: 'This may take several hours...',
          })
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }, [])

  useEffect(() => {
    checkSyncStatus()
  }, [])

  return (
    <SyncContext.Provider value={{ syncState, startSync, endSync, updateProgress, checkSyncStatus }}>
      {children}
    </SyncContext.Provider>
  )
}