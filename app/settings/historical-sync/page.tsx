'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, Play, Square, RefreshCw, CheckCircle, XCircle, Clock, Package } from 'lucide-react'
import Link from 'next/link'

interface SyncState {
  isRunning: boolean
  currentBatch: number
  totalBatches: number
  currentPhase: string
  ordersProcessed: number
  ordersCreated: number
  ordersUpdated: number
  itemsProcessed: number
  skipped: number
  errors: number
  startTime: number
  batchResults: {
    batch: number
    dateRange: string
    orders: number
    ordersCreated: number
    ordersUpdated: number
    items: number
  }[]
}

export default function HistoricalSyncPage() {
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [totalDays, setTotalDays] = useState(720)
  const [batchSize, setBatchSize] = useState(90)
  const [loading, setLoading] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Fetch initial state
  useEffect(() => {
    fetchState()
  }, [])

  // Setup SSE when sync is running
  useEffect(() => {
    if (syncState?.isRunning && !eventSourceRef.current) {
      const eventSource = new EventSource('/api/amazon/sync/historical-batched?stream=true')
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setSyncState(data)
        } catch (e) {
          console.error('Error parsing SSE data:', e)
        }
      }
      
      eventSource.onerror = () => {
        eventSource.close()
        eventSourceRef.current = null
        fetchState()
      }
      
      eventSourceRef.current = eventSource
    }
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [syncState?.isRunning])

  async function fetchState() {
    try {
      const res = await fetch('/api/amazon/sync/historical-batched')
      const data = await res.json()
      setSyncState(data)
    } catch (e) {
      console.error('Error fetching state:', e)
    }
  }

  async function startSync() {
    setLoading(true)
    try {
      const res = await fetch(`/api/amazon/sync/historical-batched?size=${batchSize}&total=${totalDays}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success) {
        fetchState()
      } else {
        alert(data.error || 'Failed to start sync')
      }
    } catch (e) {
      console.error('Error starting sync:', e)
      alert('Failed to start sync')
    }
    setLoading(false)
  }

  async function stopSync() {
    try {
      await fetch('/api/amazon/sync/historical-batched', { method: 'DELETE' })
      fetchState()
    } catch (e) {
      console.error('Error stopping sync:', e)
    }
  }

  const elapsedMinutes = syncState?.startTime 
    ? Math.floor((Date.now() - syncState.startTime) / 60000)
    : 0

  const progress = syncState?.totalBatches 
    ? Math.round((syncState.currentBatch / syncState.totalBatches) * 100)
    : 0

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/settings/amazon">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Historical Order Sync</h1>
          <p className="text-muted-foreground">
            Sync orders in batches to avoid timeouts
          </p>
        </div>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Configuration</CardTitle>
          <CardDescription>
            Configure how far back to sync and the batch size
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="totalDays" className="text-sm font-medium">Total Days</label>
              <input
                id="totalDays"
                type="number"
                value={totalDays}
                onChange={(e) => setTotalDays(parseInt(e.target.value) || 720)}
                disabled={syncState?.isRunning}
                className="w-full px-3 py-2 border border-slate-600 rounded-md bg-slate-800 text-white disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                720 days = ~2 years
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="batchSize" className="text-sm font-medium">Days per Batch</label>
              <input
                id="batchSize"
                type="number"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 90)}
                disabled={syncState?.isRunning}
                className="w-full px-3 py-2 border border-slate-600 rounded-md bg-slate-800 text-white disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                {Math.ceil(totalDays / batchSize)} batches total
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {syncState?.isRunning ? (
              <Button variant="danger" onClick={stopSync}>
                <Square className="h-4 w-4 mr-2" />
                Stop Sync
              </Button>
            ) : (
              <Button onClick={startSync} disabled={loading}>
                <Play className="h-4 w-4 mr-2" />
                Start Sync
              </Button>
            )}
            <Button variant="outline" onClick={fetchState}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {syncState && (syncState.isRunning || syncState.currentBatch > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {syncState.isRunning ? (
                <>
                  <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse" />
                  Sync in Progress
                </>
              ) : syncState.currentPhase.includes('✅') ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Sync Complete
                </>
              ) : syncState.currentPhase.includes('❌') ? (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  Sync Failed
                </>
              ) : (
                <>
                  <Clock className="h-5 w-5" />
                  Sync Stopped
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Batch {syncState.currentBatch} of {syncState.totalBatches}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Current phase */}
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{syncState.currentPhase}</p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{syncState.ordersCreated}</p>
                <p className="text-xs text-muted-foreground">Orders Created</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{syncState.ordersUpdated}</p>
                <p className="text-xs text-muted-foreground">Orders Updated</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{syncState.itemsProcessed}</p>
                <p className="text-xs text-muted-foreground">Items Processed</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{elapsedMinutes}</p>
                <p className="text-xs text-muted-foreground">Minutes Elapsed</p>
              </div>
            </div>

            {/* Errors/Skipped */}
            {(syncState.errors > 0 || syncState.skipped > 0) && (
              <div className="flex gap-4 text-sm">
                {syncState.skipped > 0 && (
                  <span className="text-yellow-600">⚠️ {syncState.skipped} skipped (no matching product)</span>
                )}
                {syncState.errors > 0 && (
                  <span className="text-red-600">❌ {syncState.errors} errors</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Batch Results */}
      {syncState?.batchResults && syncState.batchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Batch Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Batch</th>
                    <th className="text-left py-2 px-3">Date Range</th>
                    <th className="text-right py-2 px-3">Created</th>
                    <th className="text-right py-2 px-3">Updated</th>
                    <th className="text-right py-2 px-3">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {syncState.batchResults.map((result, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="py-2 px-3 font-medium">Batch {result.batch}</td>
                      <td className="py-2 px-3 text-muted-foreground">{result.dateRange}</td>
                      <td className="py-2 px-3 text-right text-green-600">{result.ordersCreated}</td>
                      <td className="py-2 px-3 text-right text-blue-600">{result.ordersUpdated}</td>
                      <td className="py-2 px-3 text-right">{result.items}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
