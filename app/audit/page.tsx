'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import CustomOrderModal from '@/components/audit/CustomOrderModal'
import { Warehouse, Package, ArrowRight, Layers, List, ArrowUpAZ, ArrowDownZA, LayoutGrid, CheckCircle2, History, FileSpreadsheet } from 'lucide-react'

interface Warehouse {
  id: number
  name: string
  code: string
}

export default function AuditSetupPage() {
  const router = useRouter()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null)
  const [auditMode, setAuditMode] = useState<'parent' | 'single_sku'>('single_sku')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | 'custom'>('asc')
  const [showCustomOrderModal, setShowCustomOrderModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasActiveSession, setHasActiveSession] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouses')
      if (res.ok) {
        const data = await res.json()
        setWarehouses(data)
        if (data.length > 0 && !selectedWarehouse) {
          setSelectedWarehouse(data[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error)
    }
  }

  const checkCurrentSession = async () => {
    try {
      const res = await fetch('/api/audit/current')
      if (res.ok) {
        const data = await res.json()
        if (data.session) {
          setHasActiveSession(true)
          setActiveSessionId(data.session.id)
        } else {
          setHasActiveSession(false)
          setActiveSessionId(null)
        }
      }
    } catch (error) {
      console.error('Error checking current session:', error)
    }
  }

  useEffect(() => {
    fetchWarehouses()
    checkCurrentSession()
  }, [])

  const startAudit = async () => {
    if (!selectedWarehouse) {
      alert('Please select a warehouse')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/audit/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: selectedWarehouse,
          auditMode,
          sortOrder,
        }),
      })

      if (res.ok) {
        const session = await res.json()
        router.push(`/audit/session/${session.id}`)
      } else {
        const error = await res.json()
        alert(`Failed to start audit: ${error.error}`)
      }
    } catch (error) {
      console.error('Error starting audit:', error)
      alert('Failed to start audit')
    } finally {
      setLoading(false)
    }
  }

  return (
    <MainLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Start New Audit</h1>
            <p className="text-slate-400 mt-1 text-sm md:text-base">Perform physical warehouse inventory count</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => router.push('/audit/history')}
            className="self-start md:self-auto"
          >
            <History className="w-4 h-4 mr-2" />
            View Logs
          </Button>
        </div>

        {/* Active Session Alert */}
        {hasActiveSession && activeSessionId && (
          <Card className="border-amber-500/30 bg-amber-900/20">
            <CardContent className="p-4 md:pt-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-white font-semibold mb-1">Active Audit Session Found</h3>
                  <p className="text-sm text-slate-400">You have an audit in progress. Would you like to resume it?</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/audit/session/${activeSessionId}`)}
                    className="flex-1 md:flex-none"
                  >
                    Resume Audit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        // Close the audit - if it has entries, save to log; otherwise delete
                        const res = await fetch(`/api/audit/${activeSessionId}/close`, { method: 'PUT' })
                        if (res.ok) {
                          setHasActiveSession(false)
                          setActiveSessionId(null)
                        } else {
                          alert('Failed to close audit')
                        }
                      } catch (error) {
                        console.error('Error closing session:', error)
                        alert('Failed to close audit')
                      }
                    }}
                    className="flex-1 md:flex-none"
                  >
                    Close Audit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2 md:pb-6">
            <CardTitle>Audit Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6">
            {/* Select Warehouse */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                <Warehouse className="w-4 h-4" />
                SELECT WAREHOUSE
              </label>
              <select
                value={selectedWarehouse || ''}
                onChange={(e) => setSelectedWarehouse(parseInt(e.target.value))}
                className="w-full px-3 md:px-4 py-2.5 md:py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm md:text-base"
              >
                <option value="">Select warehouse...</option>
                {warehouses.map(wh => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Audit Mode - Card Style */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                AUDIT MODE
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className={`relative p-4 md:p-5 bg-slate-800 border-2 rounded-lg cursor-pointer transition-all ${
                  auditMode === 'parent' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-700/50'
                }`}>
                  <input
                    type="radio"
                    name="auditMode"
                    value="parent"
                    checked={auditMode === 'parent'}
                    onChange={(e) => setAuditMode(e.target.value as 'parent')}
                    className="sr-only"
                  />
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${
                      auditMode === 'parent' ? 'bg-cyan-500/20' : 'bg-slate-700'
                    }`}>
                      <Layers className={`w-5 h-5 md:w-6 md:h-6 ${
                        auditMode === 'parent' ? 'text-cyan-400' : 'text-slate-400'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold mb-1 text-sm md:text-base">Parent Listing</div>
                      <div className="text-xs md:text-sm text-slate-400">Audit all SKU variants of a parent together</div>
                    </div>
                    {auditMode === 'parent' && (
                      <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                    )}
                  </div>
                </label>
                <label className={`relative p-4 md:p-5 bg-slate-800 border-2 rounded-lg cursor-pointer transition-all ${
                  auditMode === 'single_sku' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-700/50'
                }`}>
                  <input
                    type="radio"
                    name="auditMode"
                    value="single_sku"
                    checked={auditMode === 'single_sku'}
                    onChange={(e) => setAuditMode(e.target.value as 'single_sku')}
                    className="sr-only"
                  />
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${
                      auditMode === 'single_sku' ? 'bg-cyan-500/20' : 'bg-slate-700'
                    }`}>
                      <List className={`w-5 h-5 md:w-6 md:h-6 ${
                        auditMode === 'single_sku' ? 'text-cyan-400' : 'text-slate-400'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold mb-1 text-sm md:text-base">One SKU at a Time</div>
                      <div className="text-xs md:text-sm text-slate-400">Audit individual SKUs sequentially</div>
                    </div>
                    {auditMode === 'single_sku' && (
                      <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Sort Order - Card Style */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                SORT ORDER
              </label>
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <label className={`relative p-3 md:p-4 bg-slate-800 border-2 rounded-lg cursor-pointer transition-all ${
                  sortOrder === 'asc' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-700/50'
                }`}>
                  <input
                    type="radio"
                    name="sortOrder"
                    value="asc"
                    checked={sortOrder === 'asc'}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc' | 'custom')}
                    className="sr-only"
                  />
                  <div className="flex flex-col items-center text-center gap-1 md:gap-2">
                    <div className={`p-1.5 md:p-2 rounded-lg ${
                      sortOrder === 'asc' ? 'bg-cyan-500/20' : 'bg-slate-700'
                    }`}>
                      <ArrowUpAZ className={`w-4 h-4 md:w-5 md:h-5 ${
                        sortOrder === 'asc' ? 'text-cyan-400' : 'text-slate-400'
                      }`} />
                    </div>
                    <div className="text-white font-medium text-xs md:text-sm">A-Z</div>
                    {sortOrder === 'asc' && (
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    )}
                  </div>
                </label>
                <label className={`relative p-3 md:p-4 bg-slate-800 border-2 rounded-lg cursor-pointer transition-all ${
                  sortOrder === 'desc' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-700/50'
                }`}>
                  <input
                    type="radio"
                    name="sortOrder"
                    value="desc"
                    checked={sortOrder === 'desc'}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc' | 'custom')}
                    className="sr-only"
                  />
                  <div className="flex flex-col items-center text-center gap-1 md:gap-2">
                    <div className={`p-1.5 md:p-2 rounded-lg ${
                      sortOrder === 'desc' ? 'bg-cyan-500/20' : 'bg-slate-700'
                    }`}>
                      <ArrowDownZA className={`w-4 h-4 md:w-5 md:h-5 ${
                        sortOrder === 'desc' ? 'text-cyan-400' : 'text-slate-400'
                      }`} />
                    </div>
                    <div className="text-white font-medium text-xs md:text-sm">Z-A</div>
                    {sortOrder === 'desc' && (
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    )}
                  </div>
                </label>
                <label className={`relative p-3 md:p-4 bg-slate-800 border-2 rounded-lg cursor-pointer transition-all ${
                  sortOrder === 'custom' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-700/50'
                }`}>
                  <input
                    type="radio"
                    name="sortOrder"
                    value="custom"
                    checked={sortOrder === 'custom'}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc' | 'custom')}
                    className="sr-only"
                  />
                  <div className="flex flex-col items-center text-center gap-1 md:gap-2">
                    <div className={`p-1.5 md:p-2 rounded-lg ${
                      sortOrder === 'custom' ? 'bg-cyan-500/20' : 'bg-slate-700'
                    }`}>
                      <LayoutGrid className={`w-4 h-4 md:w-5 md:h-5 ${
                        sortOrder === 'custom' ? 'text-cyan-400' : 'text-slate-400'
                      }`} />
                    </div>
                    <div className="text-white font-medium text-xs md:text-sm">Custom</div>
                    {sortOrder === 'custom' && (
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setShowCustomOrderModal(true)
                      }}
                      className="mt-1 text-xs px-2 py-1"
                    >
                      Manage
                    </Button>
                  </div>
                </label>
              </div>
            </div>

            {/* Start Button */}
            <div className="pt-2 md:pt-4">
              <Button
                variant="primary"
                onClick={startAudit}
                disabled={!selectedWarehouse || loading}
                className="w-full"
                size="lg"
              >
                {loading ? 'Starting...' : 'START AUDIT'}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Custom Order Modal */}
        <CustomOrderModal
          isOpen={showCustomOrderModal}
          onClose={() => setShowCustomOrderModal(false)}
          warehouseId={selectedWarehouse}
          warehouseName={warehouses.find(w => w.id === selectedWarehouse)?.name}
        />
      </div>
    </MainLayout>
  )
}
