'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, Download, CheckCircle, AlertTriangle } from 'lucide-react'

interface AuditSummary {
  session: {
    id: number
    warehouse: { id: number; name: string }
    auditMode: string
    totalSkus: number
    auditedCount: number
    startedAt: string
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

  const exportReport = () => {
    if (!summary) return

    const csv = [
      ['SKU', 'Parent SKU', 'Previous Qty', 'New Qty', 'Variance', 'Flagged', 'Notes'].join(','),
      ...summary.allEntries.map(e => [
        e.sku,
        e.parentSku || '',
        e.previousQty,
        e.newQty,
        e.variance,
        e.isFlagged ? 'Yes' : 'No',
        (e.notes || '').replace(/"/g, '""'),
      ].map(v => `"${v}"`).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-${sessionId}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
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

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Audit Summary</h1>
            <p className="text-slate-400 mt-1">{summary.session.warehouse.name}</p>
          </div>
          <Button variant="ghost" onClick={() => router.push(`/audit/session/${sessionId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Audit
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-400">Total SKUs Audited</div>
              <div className="text-2xl font-bold text-white">{summary.summary.totalAudited}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-400">SKUs with Variance</div>
              <div className="text-2xl font-bold text-white">{summary.allEntries.filter(e => e.variance !== 0).length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-400">Total Units Adjusted</div>
              <div className={`text-2xl font-bold ${summary.summary.totalVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {summary.summary.totalVariance > 0 ? '+' : ''}{summary.summary.totalVariance}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-slate-400">Flagged Discrepancies</div>
              <div className={`text-2xl font-bold ${summary.summary.flaggedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {summary.summary.flaggedCount}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Large Discrepancies */}
        {summary.flaggedEntries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Large Discrepancies ({summary.flaggedEntries.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {summary.flaggedEntries.map((entry, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                    <div>
                      <div className="font-medium text-white">{entry.sku}</div>
                      <div className="text-sm text-slate-400">
                        Was: {entry.previousQty} → Now: {entry.newQty}
                      </div>
                    </div>
                    <div className={`text-lg font-bold ${entry.variance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {entry.variance > 0 ? '+' : ''}{entry.variance}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Variances */}
        <Card>
          <CardHeader>
            <CardTitle>All Variances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
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

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <Button variant="outline" onClick={exportReport}>
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
          <Button variant="primary" onClick={completeAudit} disabled={completing}>
            {completing ? 'Completing...' : 'Complete Audit'}
            <CheckCircle className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </MainLayout>
  )
}

