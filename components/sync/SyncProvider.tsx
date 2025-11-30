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

const SyncContext = createContext<SyncContextType | undefined>(undefined)

export function useSyncContext() {
  const context = useContext(SyncContext)
  if (!context) {
    throw new Error('useSyncContext must be used within a SyncProvider')
  }
  return context
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    type: null,
    startedAt: null,
    message: null,
  })

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
    
    // Auto-clear success after 5 seconds
    if (status === 'success') {
      setTimeout(() => {
        setSyncState({
          status: 'idle',
          type: null,
          startedAt: null,
          message: null,
        })
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
      // Check Amazon connection status
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
      
      // Check initial sync status
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

  // Only check sync status on initial mount (not continuously)
  // The settings page handles its own polling when syncing
  useEffect(() => {
    checkSyncStatus()
    // Don't poll continuously - only check once on mount
    // If sync is running, the settings page will poll and update
  }, []) // Empty dependency array = only run once on mount

  return (
    <SyncContext.Provider value={{ syncState, startSync, endSync, updateProgress, checkSyncStatus }}>
      {children}
    </SyncContext.Provider>
  )
}

