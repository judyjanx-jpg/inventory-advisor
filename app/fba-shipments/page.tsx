'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Truck, Plus, Package, Clock, CheckCircle, ArrowRight, Trash2, Download, AlertTriangle, Check, X } from 'lucide-react'

interface Shipment {
  id: number
  internalId: string | null
  status: string
  fromLocation?: { name: string; code: string } | null
  destinationFc: string | null
  createdAt: string
  shippedAt: string | null
  totalItems: number
  totalUnits: number
}

interface Warehouse {
  id: number
  name: string
  code: string
  isDefault: boolean
}

interface DeductionItem {
  masterSku: string
  sellerSku: string
  fnsku: string
  productName: string
  quantityShipped: number
  quantityReceived: number
  quantityToDeduct: number
  warehouseInventoryBefore: number
  warehouseInventoryAfter: number
  found: boolean
  alreadyDeducted: boolean
}

interface DeductionPreview {
  success: boolean
  dryRun: boolean
  amazonShipmentId: string
  warehouse: { id: number; name: string; code: string }
  summary: {
    totalItems: number
    itemsToProcess: number
    totalUnitsToDeduct: number
    itemsNotFound: number
    itemsAlreadyDeducted: number
  }
  deductions: DeductionItem[]
  warnings: {
    notFound: string[]
    alreadyDeducted: string[]
  }
}

interface PlanShipment {
  shipmentId: string
  shipmentConfirmationId: string | null
  status: string
  destination?: {
    warehouseId?: string
  }
  itemCount: number
  totalUnits: number
  deducted?: boolean
  deducting?: boolean
}

export default function FbaShipmentsPage() {
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])

  // Warehouse deduction state
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [amazonShipmentId, setAmazonShipmentId] = useState('')
  const [inboundPlanId, setInboundPlanId] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)

  // Plan shipments state
  const [planShipments, setPlanShipments] = useState<PlanShipment[]>([])
  const [loadingPlanShipments, setLoadingPlanShipments] = useState(false)
  const [deductionLoading, setDeductionLoading] = useState(false)
  const [deductionPreview, setDeductionPreview] = useState<DeductionPreview | null>(null)
  const [deductionError, setDeductionError] = useState<string | null>(null)
  const [deductionSuccess, setDeductionSuccess] = useState<string | null>(null)
  const [showImportSection, setShowImportSection] = useState(false)

  useEffect(() => {
    fetchShipments()
    fetchWarehouses()
  }, [])

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouses')
      const data = await res.json()
      if (res.ok) {
        setWarehouses(data || [])
        // Set default warehouse if available
        const defaultWarehouse = data.find((w: Warehouse) => w.isDefault)
        if (defaultWarehouse) {
          setSelectedWarehouseId(defaultWarehouse.id)
        } else if (data.length > 0) {
          setSelectedWarehouseId(data[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error)
    }
  }

  const loadPlanShipments = async () => {
    if (!inboundPlanId.trim()) {
      setDeductionError('Please enter an Inbound Plan ID')
      return
    }

    setLoadingPlanShipments(true)
    setDeductionError(null)
    setPlanShipments([])

    try {
      const res = await fetch(`/api/fba-shipments/list-by-plan?inboundPlanId=${encodeURIComponent(inboundPlanId.trim())}`)
      const data = await res.json()

      if (!res.ok) {
        setDeductionError(data.error || 'Failed to load shipments')
        return
      }

      setPlanShipments(data.shipments || [])

      if (data.shipments?.length === 0) {
        setDeductionError('No shipments found in this inbound plan')
      }
    } catch (error: any) {
      setDeductionError(error.message || 'Failed to load shipments')
    } finally {
      setLoadingPlanShipments(false)
    }
  }

  const selectShipment = (shipment: PlanShipment) => {
    // Use shipmentConfirmationId if available, otherwise use shipmentId
    setAmazonShipmentId(shipment.shipmentConfirmationId || shipment.shipmentId)
  }

  const deductSingleShipment = async (shipment: PlanShipment) => {
    if (!selectedWarehouseId) {
      setDeductionError('Please select a warehouse first')
      return
    }

    // Mark this shipment as deducting
    setPlanShipments(prev => prev.map(s =>
      s.shipmentId === shipment.shipmentId ? { ...s, deducting: true } : s
    ))

    try {
      const res = await fetch('/api/fba-shipments/deduct-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amazonShipmentId: shipment.shipmentId, // Use internal shipmentId
          warehouseId: selectedWarehouseId,
          inboundPlanId: inboundPlanId.trim(),
          dryRun: false,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setDeductionError(`${shipment.shipmentConfirmationId || shipment.shipmentId}: ${data.error}`)
        setPlanShipments(prev => prev.map(s =>
          s.shipmentId === shipment.shipmentId ? { ...s, deducting: false } : s
        ))
        return false
      }

      // Mark as deducted
      setPlanShipments(prev => prev.map(s =>
        s.shipmentId === shipment.shipmentId ? { ...s, deducting: false, deducted: true } : s
      ))
      return true
    } catch (error: any) {
      setDeductionError(`${shipment.shipmentConfirmationId || shipment.shipmentId}: ${error.message}`)
      setPlanShipments(prev => prev.map(s =>
        s.shipmentId === shipment.shipmentId ? { ...s, deducting: false } : s
      ))
      return false
    }
  }

  const deductAllShipments = async () => {
    if (!selectedWarehouseId) {
      setDeductionError('Please select a warehouse first')
      return
    }

    setDeductionError(null)
    const shipmentsToDeduct = planShipments.filter(s => !s.deducted)
    let successCount = 0

    for (const shipment of shipmentsToDeduct) {
      const success = await deductSingleShipment(shipment)
      if (success) successCount++
    }

    if (successCount > 0) {
      setDeductionSuccess(`Successfully deducted inventory for ${successCount} shipment(s)`)
    }
  }

  const handlePreviewDeduction = async () => {
    if (!amazonShipmentId.trim()) {
      setDeductionError('Please enter an FBA Shipment ID')
      return
    }
    if (!selectedWarehouseId) {
      setDeductionError('Please select a warehouse')
      return
    }

    setDeductionLoading(true)
    setDeductionError(null)
    setDeductionSuccess(null)
    setDeductionPreview(null)

    try {
      const res = await fetch('/api/fba-shipments/deduct-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amazonShipmentId: amazonShipmentId.trim(),
          warehouseId: selectedWarehouseId,
          inboundPlanId: inboundPlanId.trim() || undefined,
          dryRun: true,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        const errorMessage = data.hint
          ? `${data.error}\n\nHint: ${data.hint}`
          : data.error || 'Failed to fetch shipment data'
        setDeductionError(errorMessage)
        return
      }

      setDeductionPreview(data)
    } catch (error: any) {
      setDeductionError(error.message || 'Failed to preview deduction')
    } finally {
      setDeductionLoading(false)
    }
  }

  const handleApplyDeduction = async () => {
    if (!amazonShipmentId.trim() || !selectedWarehouseId) return

    setDeductionLoading(true)
    setDeductionError(null)

    try {
      const res = await fetch('/api/fba-shipments/deduct-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amazonShipmentId: amazonShipmentId.trim(),
          warehouseId: selectedWarehouseId,
          inboundPlanId: inboundPlanId.trim() || undefined,
          dryRun: false,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setDeductionError(data.error || 'Failed to apply deduction')
        return
      }

      setDeductionSuccess(data.message || 'Inventory deducted successfully')
      setDeductionPreview(null)
      setAmazonShipmentId('')
      setInboundPlanId('')
    } catch (error: any) {
      setDeductionError(error.message || 'Failed to apply deduction')
    } finally {
      setDeductionLoading(false)
    }
  }

  const handleCancelPreview = () => {
    setDeductionPreview(null)
    setDeductionError(null)
    setDeductionSuccess(null)
  }

  const fetchShipments = async () => {
    try {
      const res = await fetch('/api/shipments')
      const data = await res.json()
      if (res.ok) {
        setShipments(data.shipments || data || [])
      }
    } catch (error) {
      console.error('Error fetching shipments:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteShipment = async (id: number) => {
    if (!confirm('Are you sure you want to delete this draft shipment?')) return
    
    try {
      const res = await fetch(`/api/shipments/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setShipments(shipments.filter(s => s.id !== id))
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete shipment')
      }
    } catch (error) {
      console.error('Error deleting shipment:', error)
    }
  }

  // Calculate stats
  const stats = {
    working: shipments.filter(s => s.status === 'draft' || s.status === 'ready').length,
    inTransit: shipments.filter(s => s.status === 'shipped' || s.status === 'in_transit').length,
    receiving: shipments.filter(s => s.status === 'receiving').length,
    closed: shipments.filter(s => s.status === 'received' || s.status === 'closed').length,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-[var(--muted)] text-[var(--foreground)]'
      case 'ready': return 'bg-blue-900/50 text-blue-400'
      case 'shipped': return 'bg-purple-900/50 text-purple-400'
      case 'in_transit': return 'bg-purple-900/50 text-purple-400'
      case 'receiving': return 'bg-amber-900/50 text-amber-400'
      case 'received': return 'bg-emerald-900/50 text-emerald-400'
      case 'closed': return 'bg-emerald-900/50 text-emerald-400'
      default: return 'bg-[var(--muted)] text-[var(--foreground)]'
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString()
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">FBA Shipments</h1>
            <p className="text-[var(--muted-foreground)] mt-1">Manage shipments to Amazon fulfillment centers</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={showImportSection ? 'default' : 'outline'}
              onClick={() => setShowImportSection(!showImportSection)}
            >
              <Download className="w-4 h-4 mr-2" />
              Import Shipment
            </Button>
            <Button onClick={() => window.location.href = '/shipments/new'}>
              <Plus className="w-4 h-4 mr-2" />
              Create Shipment
            </Button>
          </div>
        </div>

        {/* Import FBA Shipment & Deduct Inventory */}
        {showImportSection && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Download className="w-5 h-5 text-cyan-400" />
              Import FBA Shipment & Deduct Inventory
            </CardTitle>
            <CardDescription>
              Enter an Amazon FBA Shipment ID to pull the shipment data and deduct the quantities from your warehouse inventory
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-1">
                    FBA Shipment ID
                  </label>
                  <input
                    type="text"
                    value={amazonShipmentId}
                    onChange={(e) => setAmazonShipmentId(e.target.value)}
                    placeholder="e.g., FBA193YSY6V4"
                    className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
                    disabled={deductionLoading}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-1">
                    Inbound Plan ID <span className="text-[var(--muted-foreground)]">(Workflow ID)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inboundPlanId}
                      onChange={(e) => setInboundPlanId(e.target.value)}
                      placeholder="e.g., wf97fdd5bb-759c-46d1-..."
                      className="flex-1 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
                      disabled={deductionLoading || loadingPlanShipments}
                    />
                    <Button
                      variant="outline"
                      onClick={loadPlanShipments}
                      disabled={deductionLoading || loadingPlanShipments || !inboundPlanId.trim()}
                    >
                      {loadingPlanShipments ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      ) : (
                        'Load'
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Shipment Selection from Plan */}
              {planShipments.length > 0 && (
                <div className="p-3 bg-[var(--card)]/50 rounded-lg border border-[var(--border)]">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-sm text-[var(--muted-foreground)]">Shipments in this plan ({planShipments.length}):</p>
                    <Button
                      size="sm"
                      onClick={deductAllShipments}
                      disabled={!selectedWarehouseId || planShipments.every(s => s.deducted || s.deducting)}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Deduct All
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {planShipments.map((shipment) => (
                      <div
                        key={shipment.shipmentId}
                        className={`p-3 rounded-lg border transition-colors ${
                          shipment.deducted
                            ? 'bg-emerald-900/20 border-emerald-700'
                            : 'bg-[var(--card)] border-[var(--border)]'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <span className="text-[var(--foreground)] font-medium">
                              {shipment.shipmentConfirmationId || shipment.shipmentId}
                            </span>
                            {shipment.destination?.warehouseId && (
                              <span className="text-[var(--muted-foreground)] ml-2">→ {shipment.destination.warehouseId}</span>
                            )}
                            <div className="text-sm mt-1">
                              <span className="text-[var(--muted-foreground)]">{shipment.itemCount} SKUs</span>
                              <span className="text-[var(--muted-foreground)] mx-2">•</span>
                              <span className="text-cyan-400">{shipment.totalUnits} units</span>
                              {shipment.status && (
                                <span className="text-[var(--muted-foreground)] ml-2">• {shipment.status}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            {shipment.deducted ? (
                              <span className="flex items-center text-emerald-400 text-sm">
                                <Check className="w-4 h-4 mr-1" />
                                Deducted
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deductSingleShipment(shipment)}
                                disabled={!selectedWarehouseId || shipment.deducting}
                              >
                                {shipment.deducting ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                ) : (
                                  <>
                                    <Download className="w-4 h-4 mr-1" />
                                    Deduct
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-1">
                    Origin Warehouse
                  </label>
                  <select
                    value={selectedWarehouseId || ''}
                    onChange={(e) => setSelectedWarehouseId(parseInt(e.target.value) || null)}
                    className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
                    disabled={deductionLoading}
                  >
                    <option value="">Select warehouse...</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} ({warehouse.code})
                        {warehouse.isDefault ? ' - Default' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handlePreviewDeduction}
                    disabled={deductionLoading || !amazonShipmentId.trim() || !selectedWarehouseId}
                  >
                    {deductionLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    Preview
                  </Button>
                </div>
              </div>

              {/* Error Message */}
              {deductionError && (
                <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{deductionError}</span>
                </div>
              )}

              {/* Success Message */}
              {deductionSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-900/30 border border-emerald-800 rounded-lg text-emerald-400">
                  <Check className="w-5 h-5 flex-shrink-0" />
                  <span>{deductionSuccess}</span>
                </div>
              )}

              {/* Preview Results */}
              {deductionPreview && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[var(--foreground)] font-medium">Preview: {deductionPreview.amazonShipmentId}</h4>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleCancelPreview}>
                        <X className="w-4 h-4 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleApplyDeduction}
                        disabled={deductionLoading || deductionPreview.summary.itemsToProcess === 0}
                      >
                        {deductionLoading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        ) : (
                          <Check className="w-4 h-4 mr-2" />
                        )}
                        Apply Deduction
                      </Button>
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-[var(--card)] rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-[var(--foreground)]">{deductionPreview.summary.totalItems}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Total Items</p>
                    </div>
                    <div className="bg-[var(--card)] rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-cyan-400">{deductionPreview.summary.itemsToProcess}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">To Process</p>
                    </div>
                    <div className="bg-[var(--card)] rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-purple-400">{deductionPreview.summary.totalUnitsToDeduct}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Units to Deduct</p>
                    </div>
                    <div className="bg-[var(--card)] rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-amber-400">{deductionPreview.summary.itemsNotFound}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Not Found</p>
                    </div>
                    <div className="bg-[var(--card)] rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-[var(--muted-foreground)]">{deductionPreview.summary.itemsAlreadyDeducted}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">Already Done</p>
                    </div>
                  </div>

                  {/* Warnings */}
                  {(deductionPreview.warnings.notFound.length > 0 || deductionPreview.warnings.alreadyDeducted.length > 0) && (
                    <div className="space-y-2">
                      {deductionPreview.warnings.notFound.length > 0 && (
                        <div className="p-3 bg-amber-900/20 border border-amber-800/50 rounded-lg">
                          <p className="text-sm text-amber-400 font-medium mb-1">
                            SKUs not found in system ({deductionPreview.warnings.notFound.length}):
                          </p>
                          <p className="text-xs text-amber-300/70">
                            {deductionPreview.warnings.notFound.slice(0, 10).join(', ')}
                            {deductionPreview.warnings.notFound.length > 10 && ` +${deductionPreview.warnings.notFound.length - 10} more`}
                          </p>
                        </div>
                      )}
                      {deductionPreview.warnings.alreadyDeducted.length > 0 && (
                        <div className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg">
                          <p className="text-sm text-[var(--muted-foreground)] font-medium mb-1">
                            Already deducted ({deductionPreview.warnings.alreadyDeducted.length}):
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {deductionPreview.warnings.alreadyDeducted.slice(0, 10).join(', ')}
                            {deductionPreview.warnings.alreadyDeducted.length > 10 && ` +${deductionPreview.warnings.alreadyDeducted.length - 10} more`}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Items Table */}
                  {deductionPreview.deductions.length > 0 && (
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--card)] sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 text-[var(--muted-foreground)] font-medium">SKU</th>
                            <th className="text-left py-2 px-3 text-[var(--muted-foreground)] font-medium">Product</th>
                            <th className="text-right py-2 px-3 text-[var(--muted-foreground)] font-medium">Shipped</th>
                            <th className="text-right py-2 px-3 text-[var(--muted-foreground)] font-medium">Before</th>
                            <th className="text-right py-2 px-3 text-[var(--muted-foreground)] font-medium">After</th>
                            <th className="text-center py-2 px-3 text-[var(--muted-foreground)] font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {deductionPreview.deductions.map((item, idx) => (
                            <tr key={idx} className={!item.found ? 'bg-amber-900/10' : item.alreadyDeducted ? 'bg-[var(--card)]/50 opacity-60' : ''}>
                              <td className="py-2 px-3 text-[var(--foreground)] font-mono text-xs">{item.sellerSku}</td>
                              <td className="py-2 px-3 text-[var(--foreground)] truncate max-w-[200px]" title={item.productName}>
                                {item.productName.slice(0, 40)}{item.productName.length > 40 ? '...' : ''}
                              </td>
                              <td className="py-2 px-3 text-right text-[var(--foreground)]">{item.quantityShipped}</td>
                              <td className="py-2 px-3 text-right text-[var(--muted-foreground)]">{item.found ? item.warehouseInventoryBefore : '—'}</td>
                              <td className="py-2 px-3 text-right text-cyan-400">{item.found && !item.alreadyDeducted ? item.warehouseInventoryAfter : '—'}</td>
                              <td className="py-2 px-3 text-center">
                                {!item.found ? (
                                  <span className="px-2 py-0.5 rounded text-xs bg-amber-900/50 text-amber-400">Not Found</span>
                                ) : item.alreadyDeducted ? (
                                  <span className="px-2 py-0.5 rounded text-xs bg-[var(--muted)] text-[var(--muted-foreground)]">Done</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-xs bg-cyan-900/50 text-cyan-400">Ready</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Package className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.working}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">Working</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Truck className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.inTransit}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">In Transit</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.receiving}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">Receiving</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[var(--foreground)]">{stats.closed}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">Closed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Shipments List */}
        {shipments.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Truck className="w-16 h-16 text-[var(--muted-foreground)] mx-auto mb-4" />
                <p className="text-lg text-[var(--muted-foreground)]">No FBA shipments yet</p>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">Create a shipment to send inventory to Amazon FBA</p>
                <Button className="mt-4" onClick={() => window.location.href = '/shipments/new'}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Shipment
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Shipments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[var(--card)]/50">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted-foreground)]">ID</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted-foreground)]">Created</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted-foreground)]">From</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted-foreground)]">Destination</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted-foreground)]">Items</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted-foreground)]">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted-foreground)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {shipments.map(shipment => (
                      <tr key={shipment.id} className="hover:bg-[var(--card)]/30">
                        <td className="py-3 px-4 text-[var(--foreground)] font-medium">
                          {shipment.internalId || `SHP-${shipment.id}`}
                        </td>
                        <td className="py-3 px-4 text-[var(--foreground)]">
                          {formatDate(shipment.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-[var(--foreground)]">
                          {shipment.fromLocation?.name || 'Warehouse'}
                        </td>
                        <td className="py-3 px-4 text-[var(--foreground)]">
                          FBA {shipment.destinationFc || 'US'}
                        </td>
                        <td className="py-3 px-4 text-[var(--foreground)]">
                          {shipment.totalItems || '—'} SKUs / {shipment.totalUnits || '—'} units
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(shipment.status)}`}>
                            {shipment.status.toUpperCase().replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.location.href = `/shipments/${shipment.id}`}
                            >
                              {shipment.status === 'draft' ? 'Continue' : 'View'}
                              <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                            {shipment.status === 'draft' && (
                              <button
                                onClick={() => deleteShipment(shipment.id)}
                                className="text-red-400 hover:text-red-300 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}
