'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, FileText, TrendingUp, TrendingDown } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface AuditHistoryItem {
  id: number
  warehouse: { id: number; name: string }
  auditMode: string
  totalSkus: number
  auditedCount: number
  startedAt: string
  completedAt: string
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Audit History</h1>
            <p className="text-slate-400 mt-1">View past inventory audits</p>
          </div>
          <Button variant="ghost" onClick={() => router.push('/audit')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Setup
          </Button>
        </div>

        {sessions.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="w-16 h-16 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400">No audit history found</p>
              <Button variant="primary" onClick={() => router.push('/audit')} className="mt-4">
                Start New Audit
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map(session => (
              <Card key={session.id} className="hover:bg-slate-800/50 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-white">
                          {formatDate(new Date(session.completedAt))} - {session.warehouse.name}
                        </h3>
                        <span className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                          {session.auditMode === 'parent' ? 'Parent Mode' : 'Single SKU'}
                        </span>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-slate-400">
                        <span>{session.totalSkus} SKUs</span>
                        <span>•</span>
                        <span>{session.varianceCount} variances</span>
                        {session.flaggedCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400">{session.flaggedCount} flagged</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right mr-6">
                      <div className={`text-lg font-bold ${session.netVariance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {session.netVariance > 0 ? '+' : ''}{session.netVariance} units
                      </div>
                      <div className="text-xs text-slate-500">
                        +{session.positiveVariance} / -{session.negativeVariance}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => router.push(`/audit/session/${session.id}/summary`)}
                    >
                      View Report
                    </Button>
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

