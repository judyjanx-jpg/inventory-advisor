'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  DollarSign,
  Megaphone,
  ArrowLeft,
  Filter,
  Play,
  Loader2
} from 'lucide-react'
import Link from 'next/link'

interface SyncLog {
  id: number
  syncType: string
  status: string
  startedAt: string
  completedAt: string | null
  duration: number | null
  recordsProcessed: number
  recordsCreated: number
  recordsUpdated: number
  recordsSkipped: number
  errorMessage: string | null
  metadata: any
}

interface SyncSummary {
  last24h: Record<string, { success: number; failed: number }>
  last7d: Record<string, { totalProcessed: number; totalCreated: number; totalUpdated: number }>
}

const SYNC_TYPE_INFO: Record<string, { label: string; icon: any; color: string }> = {
  'scheduled-orders': { label: 'Orders', icon: Package, color: 'blue' },
  'scheduled-orders-report': { label: 'Orders Report', icon: Package, color: 'blue' },
  'scheduled-finances': { label: 'Financial Events', icon: DollarSign, color: 'emerald' },
  'scheduled-ads-reports': { label: 'Amazon Ads', icon: Megaphone, color: 'purple' },
  'scheduled-inventory': { label: 'Inventory', icon: Package, color: 'amber' },
  'scheduled-products': { label: 'Products', icon: Package, color: 'slate' },
  'scheduled-aggregation': { label: 'Daily Aggregation', icon: RefreshCw, color: 'cyan' },
  'scheduled-reports': { label: 'Returns Reports', icon: Package, color: 'rose' },
  'scheduled-alerts': { label: 'Alerts', icon: Clock, color: 'orange' },
}

function getSyncTypeInfo(syncType: string) {
  return SYNC_TYPE_INFO[syncType] || {
    label: syncType.replace('scheduled-', '').replace(/-/g, ' '),
    icon: RefreshCw,
    color: 'slate'
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SyncLogsPage() {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [triggeringSyncs, setTriggeringSyncs] = useState<Record<string, boolean>>({})

  const triggerSync = async (type: string) => {
    setTriggeringSyncs(prev => ({ ...prev, [type]: true }))
    try {
      const res = await fetch(`/api/sync/trigger?type=${type}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success) {
        // Refresh logs after a short delay to show the new job
        setTimeout(fetchLogs, 1000)
      } else {
        alert(`Failed to trigger ${type} sync: ${data.error}`)
      }
    } catch (err: any) {
      alert(`Failed to trigger ${type} sync: ${err.message}`)
    } finally {
      setTriggeringSyncs(prev => ({ ...prev, [type]: false }))
    }
  }

  const fetchLogs = async () => {
    try {
      setRefreshing(true)
      const params = new URLSearchParams({ limit: '100' })
      if (filter !== 'all') {
        params.set('type', filter)
      }

      const res = await fetch(`/api/settings/sync-logs?${params}`)
      const data = await res.json()

      if (data.success) {
        setLogs(data.logs)
        setSummary(data.summary)
        setError(null)
      } else {
        setError(data.error || 'Failed to fetch logs')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchLogs, 30000)
    return () => clearInterval(interval)
  }, [filter])

  const filterOptions = [
    { value: 'all', label: 'All Syncs' },
    { value: 'orders', label: 'Orders' },
    { value: 'finances', label: 'Financial' },
    { value: 'ads', label: 'Amazon Ads' },
    { value: 'inventory', label: 'Inventory' },
  ]

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/settings" className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">Sync Logs</h1>
              <p className="text-slate-400 text-sm">Monitor API sync activity and data imports</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Trigger Sync Buttons */}
            <div className="flex items-center gap-1 mr-2">
              <span className="text-slate-400 text-sm mr-1">Trigger:</span>
              {[
                { type: 'orders-report', label: 'Orders', color: 'blue' },
                { type: 'inventory', label: 'Inventory', color: 'amber' },
                { type: 'finances', label: 'Finances', color: 'emerald' },
                { type: 'ads', label: 'Ads', color: 'purple' },
              ].map(sync => (
                <button
                  key={sync.type}
                  onClick={() => triggerSync(sync.type)}
                  disabled={triggeringSyncs[sync.type]}
                  className={`flex items-center gap-1 px-3 py-1.5 bg-${sync.color}-600/20 hover:bg-${sync.color}-600/30 border border-${sync.color}-500/30 rounded-lg text-sm text-${sync.color}-400 transition-colors disabled:opacity-50`}
                >
                  {triggeringSyncs[sync.type] ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  {sync.label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchLogs}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {['orders', 'finances', 'ads-reports', 'inventory'].map(type => {
              const key = `scheduled-${type}`
              const info = getSyncTypeInfo(key)
              const Icon = info.icon
              const stats24h = summary.last24h[key] || { success: 0, failed: 0 }
              const stats7d = summary.last7d[key] || { totalProcessed: 0, totalCreated: 0, totalUpdated: 0 }

              return (
                <Card key={type}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 bg-${info.color}-500/20 rounded-lg flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 text-${info.color}-400`} />
                      </div>
                      <div>
                        <h3 className="font-medium text-white">{info.label}</h3>
                        <p className="text-xs text-slate-400">Last 24h</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                        <span className="text-slate-300">{stats24h.success} success</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-red-400" />
                        <span className="text-slate-300">{stats24h.failed} failed</span>
                      </div>
                    </div>
                    {(stats7d.totalProcessed > 0 || stats7d.totalCreated > 0) && (
                      <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-slate-400">
                        7d: {stats7d.totalProcessed.toLocaleString()} processed, {stats7d.totalCreated.toLocaleString()} created
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <div className="flex gap-2">
            {filterOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  filter === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="p-4">
              <p className="text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sync Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading sync logs...
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No sync logs found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="text-left p-4 font-medium">Type</th>
                      <th className="text-left p-4 font-medium">Status</th>
                      <th className="text-left p-4 font-medium">Time</th>
                      <th className="text-right p-4 font-medium">Duration</th>
                      <th className="text-right p-4 font-medium">Processed</th>
                      <th className="text-right p-4 font-medium">Created</th>
                      <th className="text-right p-4 font-medium">Updated</th>
                      <th className="text-left p-4 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const info = getSyncTypeInfo(log.syncType)
                      const Icon = info.icon

                      return (
                        <tr key={log.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Icon className={`w-4 h-4 text-${info.color}-400`} />
                              <span className="text-white">{info.label}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            {log.status === 'success' ? (
                              <span className="flex items-center gap-1 text-emerald-400">
                                <CheckCircle className="w-4 h-4" />
                                Success
                              </span>
                            ) : log.status === 'failed' ? (
                              <span className="flex items-center gap-1 text-red-400">
                                <XCircle className="w-4 h-4" />
                                Failed
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-amber-400">
                                <Clock className="w-4 h-4" />
                                {log.status}
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-slate-300">
                            {formatTime(log.startedAt)}
                          </td>
                          <td className="p-4 text-right text-slate-300">
                            {formatDuration(log.duration)}
                          </td>
                          <td className="p-4 text-right text-slate-300">
                            {log.recordsProcessed > 0 ? log.recordsProcessed.toLocaleString() : '-'}
                          </td>
                          <td className="p-4 text-right text-emerald-400">
                            {log.recordsCreated > 0 ? `+${log.recordsCreated.toLocaleString()}` : '-'}
                          </td>
                          <td className="p-4 text-right text-blue-400">
                            {log.recordsUpdated > 0 ? log.recordsUpdated.toLocaleString() : '-'}
                          </td>
                          <td className="p-4 text-slate-400 max-w-[200px] truncate">
                            {log.errorMessage || (log.metadata ? formatMetadata(log.metadata) : '-')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}

function formatMetadata(metadata: any): string {
  if (!metadata) return '-'

  const parts: string[] = []

  // Ads specific
  if (metadata.reportsChecked !== undefined) {
    parts.push(`${metadata.reportsChecked} reports checked`)
  }
  if (metadata.reportsCompleted !== undefined && metadata.reportsCompleted > 0) {
    parts.push(`${metadata.reportsCompleted} completed`)
  }
  if (metadata.missingDatesFound !== undefined && metadata.missingDatesFound > 0) {
    parts.push(`${metadata.missingDatesFound} missing dates`)
  }
  if (metadata.datesRequested?.length > 0) {
    parts.push(`requested: ${metadata.datesRequested.join(', ')}`)
  }

  // Orders specific
  if (metadata.ordersProcessed !== undefined) {
    parts.push(`${metadata.ordersProcessed} orders`)
  }
  if (metadata.itemsCreated !== undefined) {
    parts.push(`${metadata.itemsCreated} items`)
  }

  // Finances specific
  if (metadata.feesUpdated !== undefined) {
    parts.push(`${metadata.feesUpdated} fees`)
  }
  if (metadata.actualRevenueUpdated !== undefined) {
    parts.push(`${metadata.actualRevenueUpdated} revenue`)
  }

  // Inventory specific
  if (metadata.updated !== undefined) {
    parts.push(`${metadata.updated} updated`)
  }

  // Campaigns
  if (metadata.campaignsUpdated !== undefined && metadata.campaignsUpdated > 0) {
    parts.push(`${metadata.campaignsUpdated} campaigns`)
  }

  return parts.length > 0 ? parts.join(', ') : '-'
}
