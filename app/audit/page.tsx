'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import CustomOrderModal from '@/components/audit/CustomOrderModal'
import { Warehouse, Package, ArrowRight } from 'lucide-react'

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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Start New Audit</h1>
          <p className="text-slate-400 mt-1">Perform physical warehouse inventory count</p>
        </div>

        {/* Active Session Alert */}
        {hasActiveSession && activeSessionId && (
          <Card className="border-amber-500/30 bg-amber-900/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold mb-1">Active Audit Session Found</h3>
                  <p className="text-sm text-slate-400">You have an audit in progress. Would you like to resume it?</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/audit/session/${activeSessionId}`)}
                  >
                    Resume Audit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      // Delete the session to start fresh
                      try {
                        await fetch(`/api/audit/${activeSessionId}`, { method: 'DELETE' })
                        setHasActiveSession(false)
                        setActiveSessionId(null)
                      } catch (error) {
                        console.error('Error deleting session:', error)
                        alert('Failed to cancel session')
                      }
                    }}
                  >
                    Cancel & Start New
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Audit Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Select Warehouse */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                SELECT WAREHOUSE
              </label>
              <select
                value={selectedWarehouse || ''}
                onChange={(e) => setSelectedWarehouse(parseInt(e.target.value))}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">Select warehouse...</option>
                {warehouses.map(wh => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Audit Mode */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                AUDIT MODE
              </label>
              <div className="space-y-2">
                <label className="flex items-center p-4 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700/50">
                  <input
                    type="radio"
                    name="auditMode"
                    value="parent"
                    checked={auditMode === 'parent'}
                    onChange={(e) => setAuditMode(e.target.value as 'parent')}
                    className="mr-3 w-4 h-4 text-cyan-500"
                  />
                  <div>
                    <div className="text-white font-medium">Parent Listing (all variants)</div>
                    <div className="text-sm text-slate-400">Audit all SKU variants of a parent together</div>
                  </div>
                </label>
                <label className="flex items-center p-4 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700/50">
                  <input
                    type="radio"
                    name="auditMode"
                    value="single_sku"
                    checked={auditMode === 'single_sku'}
                    onChange={(e) => setAuditMode(e.target.value as 'single_sku')}
                    className="mr-3 w-4 h-4 text-cyan-500"
                  />
                  <div>
                    <div className="text-white font-medium">One SKU at a Time</div>
                    <div className="text-sm text-slate-400">Audit individual SKUs sequentially</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                AUDIT BY
              </label>
              <div className="space-y-2">
                <label className="flex items-center p-4 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700/50">
                  <input
                    type="radio"
                    name="sortOrder"
                    value="asc"
                    checked={sortOrder === 'asc'}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc' | 'custom')}
                    className="mr-3 w-4 h-4 text-cyan-500"
                  />
                  <div className="text-white font-medium">Sort A-Z</div>
                </label>
                <label className="flex items-center p-4 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700/50">
                  <input
                    type="radio"
                    name="sortOrder"
                    value="desc"
                    checked={sortOrder === 'desc'}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc' | 'custom')}
                    className="mr-3 w-4 h-4 text-cyan-500"
                  />
                  <div className="text-white font-medium">Sort Z-A</div>
                </label>
                <label className="flex items-center p-4 bg-slate-800 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-700/50">
                  <input
                    type="radio"
                    name="sortOrder"
                    value="custom"
                    checked={sortOrder === 'custom'}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc' | 'custom')}
                    className="mr-3 w-4 h-4 text-cyan-500"
                  />
                  <div className="flex-1">
                    <div className="text-white font-medium">Custom Order (Warehouse Bins)</div>
                    <div className="text-sm text-slate-400">Follow physical warehouse layout</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault()
                      setShowCustomOrderModal(true)
                    }}
                  >
                    Manage
                  </Button>
                </label>
              </div>
            </div>

            {/* Start Button */}
            <div className="pt-4">
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

