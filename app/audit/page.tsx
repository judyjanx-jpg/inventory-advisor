'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import CustomOrderModal from '@/components/audit/CustomOrderModal'
import { Warehouse, Package, ArrowRight, Layers, List, ArrowUpAZ, ArrowDownZA, LayoutGrid, CheckCircle2, History, FileSpreadsheet, AlertCircle, ClipboardCheck } from 'lucide-react'

interface Warehouse {
  id: number
  name: string
  code: string
}

interface PendingAuditGroup {
  masterSku: string
  product: { title: string; parentSku?: string }
  currentWarehouseQty: number
  totalReceived: number
  poNumbers: string[]
  oldestDate: string | null
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
  
  // Pending audit state
  const [pendingAuditItems, setPendingAuditItems] = useState<PendingAuditGroup[]>([])
  const [pendingAuditCount, setPendingAuditCount] = useState(0)
  const [showPendingAuditModal, setShowPendingAuditModal] = useState(false)

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

  const fetchPendingAuditItems = async () => {
    try {
      const res = await fetch('/api/audit/pending')
      if (res.ok) {
        const data = await res.json()
        setPendingAuditItems(data.grouped || [])
        setPendingAuditCount(data.count || 0)
      }
    } catch (error) {
      console.error('Error fetching pending audit items:', error)
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
    fetchPendingAuditItems()
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
            <h1 className="text-2xl md:text-3xl font-bold text-[var(--foreground)]">Start New Audit</h1>
            <p className="text-[var(--muted-foreground)] mt-1 text-sm md:text-base">Perform physical warehouse inventory count</p>
          </div>
          <div className="flex gap-2 self-start md:self-auto">
            <Button 
              variant={pendingAuditCount > 0 ? "primary" : "outline"}
              onClick={() => setShowPendingAuditModal(true)}
              className={pendingAuditCount > 0 ? "relative" : ""}
            >
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Needs Auditing
              {pendingAuditCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-white/20 rounded-full">
                  {pendingAuditCount}
                </span>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => router.push('/audit/history')}
            >
              <History className="w-4 h-4 mr-2" />
              View Logs
            </Button>
          </div>
        </div>

        {/* Active Session Alert */}
        {hasActiveSession && activeSessionId && (
          <Card className="border-amber-500/30 bg-amber-900/20">
            <CardContent className="p-4 md:pt-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-[var(--foreground)] font-semibold mb-1">Active Audit Session Found</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">You have an audit in progress. Would you like to resume it?</p>
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
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
                <Warehouse className="w-4 h-4" />
                SELECT WAREHOUSE
              </label>
              <select
                value={selectedWarehouse || ''}
                onChange={(e) => setSelectedWarehouse(parseInt(e.target.value))}
                className="w-full px-3 md:px-4 py-2.5 md:py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm md:text-base"
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
              <label className="block text-sm font-medium text-[var(--foreground)] mb-3">
                AUDIT MODE
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className={`relative p-4 md:p-5 bg-[var(--card)] border-2 rounded-lg cursor-pointer transition-all ${
                  auditMode === 'parent' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--muted)]/50'
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
                      auditMode === 'parent' ? 'bg-cyan-500/20' : 'bg-[var(--muted)]'
                    }`}>
                      <Layers className={`w-5 h-5 md:w-6 md:h-6 ${
                        auditMode === 'parent' ? 'text-cyan-400' : 'text-[var(--muted-foreground)]'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[var(--foreground)] font-semibold mb-1 text-sm md:text-base">Parent Listing</div>
                      <div className="text-xs md:text-sm text-[var(--muted-foreground)]">Audit all SKU variants of a parent together</div>
                    </div>
                    {auditMode === 'parent' && (
                      <CheckCircle2 className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                    )}
                  </div>
                </label>
                <label className={`relative p-4 md:p-5 bg-[var(--card)] border-2 rounded-lg cursor-pointer transition-all ${
                  auditMode === 'single_sku' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--muted)]/50'
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
                      auditMode === 'single_sku' ? 'bg-cyan-500/20' : 'bg-[var(--muted)]'
                    }`}>
                      <List className={`w-5 h-5 md:w-6 md:h-6 ${
                        auditMode === 'single_sku' ? 'text-cyan-400' : 'text-[var(--muted-foreground)]'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[var(--foreground)] font-semibold mb-1 text-sm md:text-base">One SKU at a Time</div>
                      <div className="text-xs md:text-sm text-[var(--muted-foreground)]">Audit individual SKUs sequentially</div>
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
              <label className="block text-sm font-medium text-[var(--foreground)] mb-3">
                SORT ORDER
              </label>
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <label className={`relative p-3 md:p-4 bg-[var(--card)] border-2 rounded-lg cursor-pointer transition-all ${
                  sortOrder === 'asc' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--muted)]/50'
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
                      sortOrder === 'asc' ? 'bg-cyan-500/20' : 'bg-[var(--muted)]'
                    }`}>
                      <ArrowUpAZ className={`w-4 h-4 md:w-5 md:h-5 ${
                        sortOrder === 'asc' ? 'text-cyan-400' : 'text-[var(--muted-foreground)]'
                      }`} />
                    </div>
                    <div className="text-[var(--foreground)] font-medium text-xs md:text-sm">A-Z</div>
                    {sortOrder === 'asc' && (
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    )}
                  </div>
                </label>
                <label className={`relative p-3 md:p-4 bg-[var(--card)] border-2 rounded-lg cursor-pointer transition-all ${
                  sortOrder === 'desc' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--muted)]/50'
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
                      sortOrder === 'desc' ? 'bg-cyan-500/20' : 'bg-[var(--muted)]'
                    }`}>
                      <ArrowDownZA className={`w-4 h-4 md:w-5 md:h-5 ${
                        sortOrder === 'desc' ? 'text-cyan-400' : 'text-[var(--muted-foreground)]'
                      }`} />
                    </div>
                    <div className="text-[var(--foreground)] font-medium text-xs md:text-sm">Z-A</div>
                    {sortOrder === 'desc' && (
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                    )}
                  </div>
                </label>
                <label className={`relative p-3 md:p-4 bg-[var(--card)] border-2 rounded-lg cursor-pointer transition-all ${
                  sortOrder === 'custom' 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--muted)]/50'
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
                      sortOrder === 'custom' ? 'bg-cyan-500/20' : 'bg-[var(--muted)]'
                    }`}>
                      <LayoutGrid className={`w-4 h-4 md:w-5 md:h-5 ${
                        sortOrder === 'custom' ? 'text-cyan-400' : 'text-[var(--muted-foreground)]'
                      }`} />
                    </div>
                    <div className="text-[var(--foreground)] font-medium text-xs md:text-sm">Custom</div>
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

        {/* Pending Audit Items Modal */}
        <Modal
          isOpen={showPendingAuditModal}
          onClose={() => setShowPendingAuditModal(false)}
          title="Items Needing Audit"
          size="lg"
        >
          <div className="space-y-4">
            {pendingAuditCount === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <p className="text-[var(--foreground)] font-medium">All caught up!</p>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">No items pending audit from PO receiving.</p>
              </div>
            ) : (
              <>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    <p className="text-sm text-[var(--foreground)]">
                      <strong>{pendingAuditCount}</strong> SKUs received from Purchase Orders need to be audited to verify inventory counts.
                    </p>
                  </div>
                </div>

                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {pendingAuditItems.map((item) => (
                    <div 
                      key={item.masterSku}
                      className="p-4 bg-[var(--card)]/50 border border-[var(--border)] rounded-lg hover:border-cyan-500/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-medium text-[var(--foreground)]">{item.masterSku}</p>
                          <p className="text-sm text-[var(--muted-foreground)] truncate">{item.product?.title || 'Unknown Product'}</p>
                          {item.poNumbers.length > 0 && (
                            <p className="text-xs text-cyan-400 mt-1">
                              From: {item.poNumbers.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm">
                            <span className="text-[var(--muted-foreground)]">Received: </span>
                            <span className="text-emerald-400 font-medium">+{item.totalReceived}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-[var(--muted-foreground)]">Current Qty: </span>
                            <span className="text-[var(--foreground)] font-medium">{item.currentWarehouseQty}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-[var(--secondary)]/50 rounded-lg">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Start an audit session to verify these items. Once audited, they will be removed from this list.
                  </p>
                </div>
              </>
            )}
          </div>

          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowPendingAuditModal(false)}>
              Close
            </Button>
            {pendingAuditCount > 0 && (
              <Button onClick={() => {
                setShowPendingAuditModal(false)
                // Start the audit
                startAudit()
              }}>
                Start Audit
              </Button>
            )}
          </ModalFooter>
        </Modal>
      </div>
    </MainLayout>
  )
}
