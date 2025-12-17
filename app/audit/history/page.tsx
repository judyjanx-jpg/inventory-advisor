'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, FileText, Download, FileSpreadsheet, Eye, Calendar, Warehouse, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

interface AuditHistoryItem {
  id: number
  warehouse: { id: number; name: string }
  auditMode: string
  totalSkus: number
  auditedCount: number
  startedAt: string
  completedAt: string
  status: string
  flaggedCount: number
  netVariance: number
  positiveVariance: number
  negativeVariance: number
  varianceCount: number
}

export default function AuditHistoryPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<AuditHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<number | null>(null)

  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/audit/history')
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
      }
    } catch (error) {
      console.error('Error fetching audit history:', error)
    } finally {
      setLoading(false)
    }
  }

  const downloadExcel = async (sessionId: number) => {
    setDownloading(sessionId)
    try {
      const res = await fetch(`/api/audit/${sessionId}/export`)
      if (res.ok) {
        const blob = await res.blob()
        const contentDisposition = res.headers.get('Content-Disposition')
        const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
        const filename = filenameMatch ? filenameMatch[1] : `audit-${sessionId}.xlsx`
        
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        alert('Failed to download audit report')
      }
    } catch (error) {
      console.error('Error downloading audit:', error)
      alert('Failed to download audit report')
    } finally {
      setDownloading(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Audit Logs</h1>
            <p className="text-slate-400 mt-1 text-sm md:text-base">View and download past inventory audits</p>
          </div>
          <Button variant="ghost" onClick={() => router.push('/audit')} className="self-start md:self-auto">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Setup
          </Button>
        </div>

        {sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 md:py-16 text-center">
              <FileText className="w-12 h-12 md:w-16 md:h-16 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">No audit history found</p>
              <Button variant="primary" onClick={() => router.push('/audit')}>
                Start New Audit
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 md:space-y-4">
            {sessions.map(session => (
              <Card key={session.id} className="hover:bg-slate-800/50 transition-colors overflow-hidden">
                <CardContent className="p-4 md:p-6">
                  {/* Mobile Layout */}
                  <div className="md:hidden space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          <span className="text-white font-semibold">{formatDate(session.completedAt || session.startedAt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Warehouse className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          <span className="text-slate-300 text-sm truncate">{session.warehouse.name}</span>
                        </div>
                      </div>
                      <div className={`text-right ${session.netVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <div className="text-lg font-bold">
                          {session.netVariance > 0 ? '+' : ''}{session.netVariance}
                        </div>
                        <div className="text-xs text-slate-500">units</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>{session.auditedCount}/{session.totalSkus} SKUs</span>
                      <span>•</span>
                      <span>{session.varianceCount} changes</span>
                      {session.flaggedCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {session.flaggedCount}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-700">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadExcel(session.id)}
                        disabled={downloading === session.id}
                        className="flex-1"
                      >
                        {downloading === session.id ? (
                          <span className="animate-spin">⏳</span>
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 mr-1" />
                        )}
                        Excel
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/audit/session/${session.id}/summary`)}
                        className="flex-1"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden md:flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">
                          {formatDate(session.completedAt || session.startedAt)} - {session.warehouse.name}
                        </h3>
                        <span className={`px-2 py-1 text-xs rounded ${
                          session.status === 'completed' 
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : session.status === 'cancelled'
                            ? 'bg-slate-700 text-slate-300'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {session.status === 'completed' ? 'Completed' : session.status === 'cancelled' ? 'Cancelled' : 'In Progress'}
                        </span>
                        <span className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                          {session.auditMode === 'parent' ? 'Parent Mode' : 'Single SKU'}
                        </span>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-slate-400">
                        <span>{session.auditedCount}/{session.totalSkus} SKUs audited</span>
                        <span>•</span>
                        <span>{session.varianceCount} variances</span>
                        {session.flaggedCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-4 h-4" />
                              {session.flaggedCount} flagged
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right mr-6">
                      <div className={`text-lg font-bold ${session.netVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {session.netVariance > 0 ? '+' : ''}{session.netVariance} units
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 justify-end">
                        <span className="text-emerald-400">+{session.positiveVariance}</span>
                        <span>/</span>
                        <span className="text-red-400">-{session.negativeVariance}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadExcel(session.id)}
                        disabled={downloading === session.id}
                      >
                        {downloading === session.id ? (
                          <span className="animate-spin mr-2">⏳</span>
                        ) : (
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                        )}
                        Download Excel
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => router.push(`/audit/session/${session.id}/summary`)}
                      >
                        View Report
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}
