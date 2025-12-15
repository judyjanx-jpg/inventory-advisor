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

export default function FbaShipmentsPage() {
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])

  // Warehouse deduction state
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [amazonShipmentId, setAmazonShipmentId] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
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
          dryRun: true,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setDeductionError(data.error || 'Failed to fetch shipment data')
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
      case 'draft': return 'bg-slate-700 text-slate-300'
      case 'ready': return 'bg-blue-900/50 text-blue-400'
      case 'shipped': return 'bg-purple-900/50 text-purple-400'
      case 'in_transit': return 'bg-purple-900/50 text-purple-400'
      case 'receiving': return 'bg-amber-900/50 text-amber-400'
      case 'received': return 'bg-emerald-900/50 text-emerald-400'
      case 'closed': return 'bg-emerald-900/50 text-emerald-400'
      default: return 'bg-slate-700 text-slate-300'
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
            <h1 className="text-3xl font-bold text-white">FBA Shipments</h1>
            <p className="text-slate-400 mt-1">Manage shipments to Amazon fulfillment centers</p>
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
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    FBA Shipment ID
                  </label>
                  <input
                    type="text"
                    value={amazonShipmentId}
                    onChange={(e) => setAmazonShipmentId(e.target.value)}
                    placeholder="e.g., FBA15X123ABC"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    disabled={deductionLoading}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Origin Warehouse
                  </label>
                  <select
                    value={selectedWarehouseId || ''}
                    onChange={(e) => setSelectedWarehouseId(parseInt(e.target.value) || null)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
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
                <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span>{deductionError}</span>
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
                    <h4 className="text-white font-medium">Preview: {deductionPreview.amazonShipmentId}</h4>
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
                    <div className="bg-slate-800 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-white">{deductionPreview.summary.totalItems}</p>
                      <p className="text-xs text-slate-400">Total Items</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-cyan-400">{deductionPreview.summary.itemsToProcess}</p>
                      <p className="text-xs text-slate-400">To Process</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-purple-400">{deductionPreview.summary.totalUnitsToDeduct}</p>
                      <p className="text-xs text-slate-400">Units to Deduct</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-amber-400">{deductionPreview.summary.itemsNotFound}</p>
                      <p className="text-xs text-slate-400">Not Found</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-slate-400">{deductionPreview.summary.itemsAlreadyDeducted}</p>
                      <p className="text-xs text-slate-400">Already Done</p>
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
                        <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg">
                          <p className="text-sm text-slate-400 font-medium mb-1">
                            Already deducted ({deductionPreview.warnings.alreadyDeducted.length}):
                          </p>
                          <p className="text-xs text-slate-500">
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
                        <thead className="bg-slate-800 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">SKU</th>
                            <th className="text-left py-2 px-3 text-slate-400 font-medium">Product</th>
                            <th className="text-right py-2 px-3 text-slate-400 font-medium">Shipped</th>
                            <th className="text-right py-2 px-3 text-slate-400 font-medium">Before</th>
                            <th className="text-right py-2 px-3 text-slate-400 font-medium">After</th>
                            <th className="text-center py-2 px-3 text-slate-400 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {deductionPreview.deductions.map((item, idx) => (
                            <tr key={idx} className={!item.found ? 'bg-amber-900/10' : item.alreadyDeducted ? 'bg-slate-800/50 opacity-60' : ''}>
                              <td className="py-2 px-3 text-white font-mono text-xs">{item.sellerSku}</td>
                              <td className="py-2 px-3 text-slate-300 truncate max-w-[200px]" title={item.productName}>
                                {item.productName.slice(0, 40)}{item.productName.length > 40 ? '...' : ''}
                              </td>
                              <td className="py-2 px-3 text-right text-white">{item.quantityShipped}</td>
                              <td className="py-2 px-3 text-right text-slate-400">{item.found ? item.warehouseInventoryBefore : '—'}</td>
                              <td className="py-2 px-3 text-right text-cyan-400">{item.found && !item.alreadyDeducted ? item.warehouseInventoryAfter : '—'}</td>
                              <td className="py-2 px-3 text-center">
                                {!item.found ? (
                                  <span className="px-2 py-0.5 rounded text-xs bg-amber-900/50 text-amber-400">Not Found</span>
                                ) : item.alreadyDeducted ? (
                                  <span className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-400">Done</span>
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
                  <p className="text-2xl font-bold text-white">{stats.working}</p>
                  <p className="text-sm text-slate-400">Working</p>
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
                  <p className="text-2xl font-bold text-white">{stats.inTransit}</p>
                  <p className="text-sm text-slate-400">In Transit</p>
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
                  <p className="text-2xl font-bold text-white">{stats.receiving}</p>
                  <p className="text-sm text-slate-400">Receiving</p>
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
                  <p className="text-2xl font-bold text-white">{stats.closed}</p>
                  <p className="text-sm text-slate-400">Closed</p>
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
                <Truck className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-lg text-slate-400">No FBA shipments yet</p>
                <p className="text-sm text-slate-500 mt-1">Create a shipment to send inventory to Amazon FBA</p>
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
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">ID</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Created</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">From</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Destination</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Items</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {shipments.map(shipment => (
                      <tr key={shipment.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 text-white font-medium">
                          {shipment.internalId || `SHP-${shipment.id}`}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {formatDate(shipment.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {shipment.fromLocation?.name || 'Warehouse'}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          FBA {shipment.destinationFc || 'US'}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
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
