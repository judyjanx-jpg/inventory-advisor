'use client'

import { useSyncContext } from './SyncProvider'

export function GlobalSyncBar() {
  const { syncState } = useSyncContext()

  if (syncState.status === 'idle') {
    return null
  }

  const getSyncDuration = () => {
    if (!syncState.startedAt) return ''
    const now = new Date()
    const diffMs = now.getTime() - syncState.startedAt.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`
    }
    if (diffMins > 0) {
      return `${diffMins} min`
    }
    return 'Just started'
  }

  if (syncState.status === 'syncing') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50">
        {/* Progress bar */}
        <div className="h-1 bg-[var(--muted)]">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 animate-pulse"
            style={{
              width: syncState.progress
                ? `${(syncState.progress.phase / syncState.progress.totalPhases) * 100}%`
                : '100%'
            }}
          />
        </div>

        {/* Info bar */}
        <div className="bg-[var(--card)]/98 border-b border-[var(--border)] backdrop-blur-sm px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Spinning loader */}
              <div className="relative">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-500/30 border-t-cyan-500" />
                <div className="absolute inset-0 animate-ping rounded-full h-6 w-6 border border-cyan-500/20" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--foreground)] font-medium">
                    Syncing {syncState.type}...
                  </span>
                  {syncState.progress && (
                    <span className="text-xs bg-[var(--secondary)] text-[var(--muted-foreground)] px-2 py-0.5 rounded">
                      Phase {syncState.progress.phase}/{syncState.progress.totalPhases}: {syncState.progress.phaseName}
                    </span>
                  )}
                </div>
                {syncState.message && (
                  <span className="text-[var(--muted-foreground)] text-sm">{syncState.message}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-[var(--muted-foreground)] text-sm">
                {getSyncDuration()}
              </span>
              <span className="text-[var(--muted-foreground)] text-xs hidden sm:block opacity-70">
                You can continue using the app
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (syncState.status === 'success') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-1 bg-emerald-500" />
        <div className="bg-emerald-900/90 border-b border-emerald-700/50 backdrop-blur-sm px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <span className="text-emerald-300 text-xl">✓</span>
            <span className="text-white font-medium">
              {syncState.type ? `${syncState.type} sync` : 'Sync'} completed successfully!
            </span>
            {syncState.message && (
              <span className="text-emerald-200 text-sm">{syncState.message}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (syncState.status === 'error') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-1 bg-red-500" />
        <div className="bg-red-900/90 border-b border-red-700/50 backdrop-blur-sm px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <span className="text-red-300 text-xl">✗</span>
            <span className="text-white font-medium">
              {syncState.type ? `${syncState.type} sync` : 'Sync'} failed
            </span>
            {syncState.message && (
              <span className="text-red-200 text-sm">{syncState.message}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}

