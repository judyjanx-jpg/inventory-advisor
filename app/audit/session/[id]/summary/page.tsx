'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, FileSpreadsheet, CheckCircle, AlertTriangle, Package, TrendingUp, TrendingDown, Hash } from 'lucide-react'

interface AuditSummary {
  session: {
    id: number
    warehouse: { id: number; name: string }
    auditMode: string
    totalSkus: number
    auditedCount: number
    startedAt: string
    status: string
  }
  summary: {
    totalAudited: number
    flaggedCount: number
    totalVariance: number
    positiveVariance: number
    negativeVariance: number
  }
  flaggedEntries: Array<{
    sku: string
    previousQty: number
    newQty: number
    variance: number
    notes: string | null
  }>
  allEntries: Array<{
    sku: string
    parentSku: string | null
    previousQty: number
    newQty: number
    variance: number
    isFlagged: boolean
    notes: string | null
  }>
}

export default function AuditSummaryPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string

  const [summary, setSummary] = useState<AuditSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    fetchSummary()
  }, [sessionId])

  const fetchSummary = async () => {
    try {
      const res = await fetch(`/api/audit/${sessionId}/summary`)
      if (res.ok) {
        const data = await res.json()
        setSummary(data)
      }
    } catch (error) {
      console.error('Error fetching summary:', error)
    } finally {
      setLoading(false)
    }
  }

  const completeAudit = async () => {
    if (!confirm('Complete this audit? This will finalize all changes.')) {
      return
    }

    setCompleting(true)
    try {
      const res = await fetch(`/api/audit/${sessionId}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applyChanges: true }),
      })

      if (res.ok) {
        router.push('/audit/history')
      } else {
        alert('Failed to complete audit')
      }
    } catch (error) {
      console.error('Error completing audit:', error)
      alert('Failed to complete audit')
    } finally {
      setCompleting(false)
    }
  }

  const downloadExcel = async () => {
    setDownloading(true)
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
        alert('Failed to download report')
      }
    } catch (error) {
      console.error('Error downloading:', error)
      alert('Failed to download report')
    } finally {
      setDownloading(false)
    }
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

  if (!summary) {
    return (
      <MainLayout>
        <div className="text-center py-16">
          <p className="text-slate-400">Summary not found</p>
          <Button variant="ghost" onClick={() => router.push('/audit')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Audit
          </Button>
        </div>
      </MainLayout>
    )
  }

  const isCompleted = summary.session.status === 'completed'

  return (
    <MainLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Audit Summary</h1>
            <p className="text-slate-400 mt-1 text-sm md:text-base">{summary.session.warehouse.name}</p>
          </div>
          <Button 
            variant="ghost" 
            onClick={() => router.push(`/audit/session/${sessionId}`)}
            className="self-start md:self-auto"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Audit
          </Button>
        </div>

        {/* Summary Stats - Mobile Optimized Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Card>
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-slate-400" />
                <span className="text-xs md:text-sm text-slate-400">Audited</span>
              </div>
              <div className="text-xl md:text-2xl font-bold text-white">{summary.summary.totalAudited}</div>
              <div className="text-xs text-slate-500">of {summary.session.totalSkus} SKUs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="w-4 h-4 text-slate-400" />
                <span className="text-xs md:text-sm text-slate-400">Variances</span>
              </div>
              <div className="text-xl md:text-2xl font-bold text-white">
                {summary.allEntries.filter(e => e.variance !== 0).length}
              </div>
              <div className="text-xs text-slate-500">items changed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center gap-2 mb-1">
                {summary.summary.totalVariance >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
                <span className="text-xs md:text-sm text-slate-400">Net Change</span>
              </div>
              <div className={`text-xl md:text-2xl font-bold ${summary.summary.totalVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.summary.totalVariance > 0 ? '+' : ''}{summary.summary.totalVariance}
              </div>
              <div className="text-xs text-slate-500">
                +{summary.summary.positiveVariance} / -{summary.summary.negativeVariance}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 md:pt-6">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className={`w-4 h-4 ${summary.summary.flaggedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
                <span className="text-xs md:text-sm text-slate-400">Flagged</span>
              </div>
              <div className={`text-xl md:text-2xl font-bold ${summary.summary.flaggedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {summary.summary.flaggedCount}
              </div>
              <div className="text-xs text-slate-500">large discrepancies</div>
            </CardContent>
          </Card>
        </div>

        {/* Large Discrepancies */}
        {summary.flaggedEntries.length > 0 && (
          <Card>
            <CardHeader className="pb-2 md:pb-4">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
                Large Discrepancies ({summary.flaggedEntries.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {summary.flaggedEntries.map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 md:p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-white text-sm md:text-base truncate">{entry.sku}</div>
                      <div className="text-xs md:text-sm text-slate-400">
                        {entry.previousQty} → {entry.newQty}
                      </div>
                    </div>
                    <div className={`text-base md:text-lg font-bold flex-shrink-0 ml-2 ${entry.variance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {entry.variance > 0 ? '+' : ''}{entry.variance}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Variances - Responsive Table */}
        <Card>
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">All Variances</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Mobile List View */}
            <div className="md:hidden space-y-2">
              {summary.allEntries.map((entry, idx) => (
                <div key={idx} className="p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-white text-sm truncate flex-1">{entry.sku}</span>
                    <span className={`font-medium ml-2 ${entry.variance > 0 ? 'text-emerald-400' : entry.variance < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {entry.variance > 0 ? '+' : ''}{entry.variance}
                    </span>
                    {entry.isFlagged && <AlertTriangle className="w-4 h-4 text-amber-400 ml-1" />}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>{entry.previousQty} → {entry.newQty}</span>
                    {entry.parentSku && <span>• {entry.parentSku}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-sm text-slate-400 border-b border-slate-700">
                    <th className="text-left py-3">SKU</th>
                    <th className="text-left py-3">Parent</th>
                    <th className="text-right py-3">Previous</th>
                    <th className="text-right py-3">New</th>
                    <th className="text-right py-3">Variance</th>
                    <th className="text-center py-3">Flagged</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.allEntries.map((entry, idx) => (
                    <tr key={idx} className="border-b border-slate-700/50">
                      <td className="py-3 font-mono text-white">{entry.sku}</td>
                      <td className="py-3 text-slate-400">{entry.parentSku || '-'}</td>
                      <td className="py-3 text-right text-slate-300">{entry.previousQty}</td>
                      <td className="py-3 text-right text-white">{entry.newQty}</td>
                      <td className={`py-3 text-right font-medium ${entry.variance > 0 ? 'text-emerald-400' : entry.variance < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {entry.variance > 0 ? '+' : ''}{entry.variance}
                      </td>
                      <td className="py-3 text-center">
                        {entry.isFlagged && <AlertTriangle className="w-4 h-4 text-amber-400 mx-auto" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Actions - Mobile Optimized */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pt-2 md:pt-4">
          <Button 
            variant="outline" 
            onClick={downloadExcel}
            disabled={downloading}
            className="w-full md:w-auto"
          >
            {downloading ? (
              <span className="animate-spin mr-2">⏳</span>
            ) : (
              <FileSpreadsheet className="w-4 h-4 mr-2" />
            )}
            Download Excel
          </Button>
          {!isCompleted && (
            <Button 
              variant="primary" 
              onClick={completeAudit} 
              disabled={completing}
              className="w-full md:w-auto"
            >
              {completing ? 'Completing...' : 'Complete Audit'}
              <CheckCircle className="w-4 h-4 ml-2" />
            </Button>
          )}
          {isCompleted && (
            <Button 
              variant="ghost" 
              onClick={() => router.push('/audit/history')}
              className="w-full md:w-auto"
            >
              Back to Logs
            </Button>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
