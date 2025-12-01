'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { 
  RefreshCw, 
  Download, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Calendar,
  Database,
  TrendingUp
} from 'lucide-react'

interface SyncLog {
  id: number
  status: string
  startedAt: string
  completedAt: string | null
  recordsProcessed: number
  recordsCreated: number
  recordsUpdated: number
  errorMessage: string | null
}

interface OrderStats {
  month: string
  count: string
}

interface SyncStatus {
  recentSyncs: SyncLog[]
  orderStats: OrderStats[]
  dateRange: {
    earliest: string | null
    latest: string | null
    totalOrders: number
  }
}

export default function HistoricalSyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<string>('')
  const [daysBack, setDaysBack] = useState(730) // Default 2 years

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/amazon/sync/historical')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Error fetching sync status:', error)
    } finally {
      setLoading(false)
    }
  }

  const startSync = async () => {
    if (syncing) return
    
    const confirmed = confirm(
      `This will sync ${daysBack} days of order history from Amazon.\n\n` +
      `For large date ranges (2 years), this can take 30-60+ minutes.\n\n` +
      `Continue?`
    )
    
    if (!confirmed) return
    
    setSyncing(true)
    setSyncProgress('Requesting report from Amazon...')
    
    try {
      const res = await fetch(`/api/amazon/sync/historical?days=${daysBack}`, {
        method: 'POST',
      })
      
      const data = await res.json()
      
      if (res.ok) {
        setSyncProgress(`✅ Complete! ${data.stats.ordersCreated} orders created, ${data.stats.ordersUpdated} updated`)
        alert(
          `Historical sync complete!\n\n` +
          `Orders: ${data.stats.ordersCreated} created, ${data.stats.ordersUpdated} updated\n` +
          `Items: ${data.stats.itemsCreated} created, ${data.stats.itemsUpdated} updated\n` +
          `Duration: ${data.duration}`
        )
        fetchStatus()
      } else {
        setSyncProgress(`❌ Error: ${data.error}`)
        alert(`Sync failed: ${data.error}`)
      }
    } catch (error: any) {
      setSyncProgress(`❌ Error: ${error.message}`)
      alert(`Sync failed: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'running':
        return <RefreshCw className="w-5 h-5 text-cyan-500 animate-spin" />
      default:
        return <Clock className="w-5 h-5 text-slate-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      success: 'bg-green-900/50 text-green-400 border-green-500/30',
      failed: 'bg-red-900/50 text-red-400 border-red-500/30',
      running: 'bg-cyan-900/50 text-cyan-400 border-cyan-500/30',
    }
    return colors[status] || 'bg-slate-800 text-slate-400 border-slate-600'
  }

  // Calculate data coverage
  const calculateCoverage = () => {
    if (!status?.dateRange.earliest || !status?.dateRange.latest) return null
    
    const earliest = new Date(status.dateRange.earliest)
    const latest = new Date(status.dateRange.latest)
    const daysCovered = Math.ceil((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24))
    
    return { earliest, latest, daysCovered }
  }

  const coverage = calculateCoverage()

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Historical Order Sync</h1>
            <p className="text-slate-400 mt-1">
              Import order history from Amazon for forecasting and analytics
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchStatus}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Data Coverage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <Database className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Orders</p>
                <p className="text-2xl font-bold text-white">
                  {status?.dateRange.totalOrders.toLocaleString() || '—'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Calendar className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Date Range</p>
                <p className="text-lg font-semibold text-white">
                  {coverage ? (
                    <>
                      {formatDate(coverage.earliest.toISOString())} — {formatDate(coverage.latest.toISOString())}
                    </>
                  ) : (
                    'No data'
                  )}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Days Covered</p>
                <p className="text-2xl font-bold text-white">
                  {coverage?.daysCovered.toLocaleString() || '—'}
                  <span className="text-sm font-normal text-slate-400 ml-1">
                    / 730 target
                  </span>
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Coverage Warning */}
        {coverage && coverage.daysCovered < 365 && (
          <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-400">Limited Data for Forecasting</p>
              <p className="text-sm text-slate-300 mt-1">
                You have {coverage.daysCovered} days of order history. For accurate forecasting with 
                seasonality detection, we recommend at least 1-2 years of data. Run a historical 
                sync to import more data.
              </p>
            </div>
          </div>
        )}

        {/* Sync Controls */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Start Historical Sync</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Days to Import
              </label>
              <div className="flex flex-wrap gap-2">
                {[30, 90, 180, 365, 730].map((days) => (
                  <button
                    key={days}
                    onClick={() => setDaysBack(days)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      daysBack === days
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {days === 730 ? '2 Years' : days === 365 ? '1 Year' : `${days} Days`}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                For forecasting, 2 years of data is recommended to capture seasonal patterns.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Button
                onClick={startSync}
                disabled={syncing}
                className="px-6"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Start Sync ({daysBack} days)
                  </>
                )}
              </Button>
              
              {syncProgress && (
                <p className="text-sm text-slate-400">{syncProgress}</p>
              )}
            </div>

            {syncing && (
              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-300">
                  <strong>Note:</strong> Historical syncs can take 30-60+ minutes for large date ranges. 
                  The report generation happens on Amazon's servers. You can leave this page and 
                  check back later - the sync will continue in the background.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Recent Syncs */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Sync History</h2>
          
          {status?.recentSyncs && status.recentSyncs.length > 0 ? (
            <div className="space-y-3">
              {status.recentSyncs.map((sync) => (
                <div
                  key={sync.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(sync.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">
                          {formatDateTime(sync.startedAt)}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded border ${getStatusBadge(sync.status)}`}>
                          {sync.status}
                        </span>
                      </div>
                      {sync.errorMessage ? (
                        <p className="text-sm text-red-400">{sync.errorMessage}</p>
                      ) : (
                        <p className="text-sm text-slate-400">
                          {sync.recordsCreated} created, {sync.recordsUpdated} updated
                          {sync.completedAt && (
                            <span className="text-slate-500">
                              {' '}• Completed {formatDateTime(sync.completedAt)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-white">
                      {sync.recordsProcessed.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">records</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No sync history yet</p>
              <p className="text-sm">Run your first historical sync above</p>
            </div>
          )}
        </Card>

        {/* Monthly Order Distribution */}
        {status?.orderStats && status.orderStats.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Orders by Month</h2>
            <div className="overflow-x-auto">
              <div className="flex gap-2 min-w-max pb-2">
                {status.orderStats.slice(0, 24).map((stat, index) => {
                  const date = new Date(stat.month)
                  const count = parseInt(stat.count)
                  const maxCount = Math.max(...status.orderStats.map(s => parseInt(s.count)))
                  const heightPercent = (count / maxCount) * 100
                  
                  return (
                    <div key={index} className="flex flex-col items-center">
                      <div className="h-32 w-8 bg-slate-800 rounded-t relative flex items-end">
                        <div
                          className="w-full bg-cyan-600 rounded-t transition-all duration-300"
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1 -rotate-45 origin-left w-12">
                        {date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                      </p>
                      <p className="text-xs text-slate-500 mt-4">
                        {count.toLocaleString()}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}
