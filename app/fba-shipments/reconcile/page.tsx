'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import {
  Package,
  CheckCircle,
  XCircle,
  RefreshCw,
  Warehouse,
  ArrowRight,
  Clock,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface ShipmentItem {
  id: number
  masterSku: string
  channelSku: string | null
  productName: string
  fnsku: string | null
  asin: string | null
  quantityShipped: number
  quantityReceived: number
  quantityDiscrepancy: number
}

interface FbaShipment {
  id: number
  shipmentId: string
  internalId: string | null
  status: string
  destinationFc: string | null
  destinationName: string | null
  channel: string | null
  createdDate: string
  shipDate: string | null
  totalUnits: number
  unitsShipped: number
  unitsReceived: number
  unitsDiscrepancy: number
  reconciliationStatus: string
  reconciledAt: string | null
  reconciledBy: string | null
  deductedFromWarehouseId: number | null
  inventoryDeducted: boolean
  reconciliationNotes: string | null
  items: ShipmentItem[]
}

interface Warehouse {
  id: number
  name: string
  code: string
  isDefault: boolean
}

interface ReconcileData {
  shipments: FbaShipment[]
  warehouses: Warehouse[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  summary: {
    pending: number
    accepted: number
    deducted: number
  }
}

export default function FbaReconcilePage() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [data, setData] = useState<ReconcileData | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null)
  const [expandedShipments, setExpandedShipments] = useState<Set<number>>(new Set())
  const [processingShipments, setProcessingShipments] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchShipments()
  }, [statusFilter])

  const fetchShipments = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/fba-shipments/reconcile?status=${statusFilter}&limit=100`)
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to fetch shipments')
        return
      }

      setData(result)

      // Set default warehouse
      if (!selectedWarehouse && result.warehouses?.length > 0) {
        const defaultWh = result.warehouses.find((w: Warehouse) => w.isDefault)
        setSelectedWarehouse(defaultWh?.id || result.warehouses[0].id)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch shipments')
    } finally {
      setLoading(false)
    }
  }

  const triggerSync = async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/fba-shipments/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 90 }),
      })
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to trigger sync')
        return
      }

      setSuccess('Sync job triggered. Refresh the page in a few minutes to see new shipments.')
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      setError(err.message || 'Failed to trigger sync')
    } finally {
      setSyncing(false)
    }
  }

  const toggleExpand = (shipmentId: number) => {
    const newExpanded = new Set(expandedShipments)
    if (newExpanded.has(shipmentId)) {
      newExpanded.delete(shipmentId)
    } else {
      newExpanded.add(shipmentId)
    }
    setExpandedShipments(newExpanded)
  }

  const reconcileShipment = async (shipmentId: number, action: 'accept' | 'deduct') => {
    if (action === 'deduct' && !selectedWarehouse) {
      setError('Please select a warehouse first')
      return
    }

    setProcessingShipments(prev => new Set(prev).add(shipmentId))
    setError(null)

    try {
      const res = await fetch('/api/fba-shipments/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId,
          action,
          warehouseId: action === 'deduct' ? selectedWarehouse : undefined,
        }),
      })
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to reconcile shipment')
        return
      }

      setSuccess(result.message)
      setTimeout(() => setSuccess(null), 3000)

      // Refresh list
      fetchShipments()
    } catch (err: any) {
      setError(err.message || 'Failed to reconcile shipment')
    } finally {
      setProcessingShipments(prev => {
        const newSet = new Set(prev)
        newSet.delete(shipmentId)
        return newSet
      })
    }
  }

  const undoReconciliation = async (shipmentId: number) => {
    setProcessingShipments(prev => new Set(prev).add(shipmentId))
    setError(null)

    try {
      const res = await fetch('/api/fba-shipments/reconcile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId }),
      })
      const result = await res.json()

      if (!res.ok) {
        setError(result.error || 'Failed to undo reconciliation')
        return
      }

      setSuccess(result.message)
      setTimeout(() => setSuccess(null), 3000)
      fetchShipments()
    } catch (err: any) {
      setError(err.message || 'Failed to undo reconciliation')
    } finally {
      setProcessingShipments(prev => {
        const newSet = new Set(prev)
        newSet.delete(shipmentId)
        return newSet
      })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Pending</span>
      case 'accepted':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Accepted</span>
      case 'deducted':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">Deducted</span>
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-[var(--muted)] text-[var(--foreground)]">{status}</span>
    }
  }

  const getShipmentStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'working': 'bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)]',
      'shipped': 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
      'in_transit': 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
      'receiving': 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
      'checked_in': 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
      'closed': 'bg-green-500/20 text-green-400 border border-green-500/30',
      'delivered': 'bg-green-500/20 text-green-400 border border-green-500/30',
    }
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${colors[status] || 'bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)]'}`}>
        {status.replace('_', ' ')}
      </span>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">FBA Shipment Reconciliation</h1>
            <p className="text-[var(--muted-foreground)] mt-1">
              Review and reconcile FBA shipments - either deduct from warehouse or accept as-is
            </p>
          </div>
          <Button
            onClick={triggerSync}
            disabled={syncing}
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync from Amazon'}
          </Button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <XCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
            <p className="text-red-800">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
            <CheckCircle className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
            <p className="text-green-800">{success}</p>
            <button onClick={() => setSuccess(null)} className="ml-auto text-green-500 hover:text-green-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Summary Cards */}
        {data?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              className={`cursor-pointer transition ${statusFilter === 'pending' ? 'ring-2 ring-yellow-500' : ''}`}
              onClick={() => setStatusFilter('pending')}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--muted-foreground)]">Pending</p>
                    <p className="text-2xl font-bold text-yellow-600">{data.summary.pending}</p>
                  </div>
                  <Clock className="w-8 h-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer transition ${statusFilter === 'accepted' ? 'ring-2 ring-blue-500' : ''}`}
              onClick={() => setStatusFilter('accepted')}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--muted-foreground)]">Accepted</p>
                    <p className="text-2xl font-bold text-blue-600">{data.summary.accepted}</p>
                  </div>
                  <Check className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer transition ${statusFilter === 'deducted' ? 'ring-2 ring-green-500' : ''}`}
              onClick={() => setStatusFilter('deducted')}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--muted-foreground)]">Deducted</p>
                    <p className="text-2xl font-bold text-green-600">{data.summary.deducted}</p>
                  </div>
                  <Warehouse className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Warehouse Selection */}
        {data?.warehouses && data.warehouses.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Warehouse className="w-5 h-5 text-[var(--muted-foreground)]" />
                <label className="text-sm font-medium text-[var(--foreground)]">Deduct from warehouse:</label>
                <select
                  value={selectedWarehouse || ''}
                  onChange={(e) => setSelectedWarehouse(e.target.value ? parseInt(e.target.value) : null)}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                >
                  {data.warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shipments List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              FBA Shipments
              <span className="text-sm font-normal text-[var(--muted-foreground)]">
                ({statusFilter === 'all' ? 'All' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)})
              </span>
            </CardTitle>
            <CardDescription>
              Click a shipment to expand and see items. Use "Accept" to track without deducting, or "Deduct" to subtract from warehouse inventory.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
                <span className="ml-2 text-[var(--muted-foreground)]">Loading shipments...</span>
              </div>
            ) : !data?.shipments || data.shipments.length === 0 ? (
              <div className="text-center py-12 text-[var(--muted-foreground)]">
                <Package className="w-12 h-12 mx-auto text-[var(--muted-foreground)] opacity-50 mb-4" />
                <p>No {statusFilter === 'all' ? '' : statusFilter} shipments found</p>
                <p className="text-sm mt-2">Click "Sync from Amazon" to pull FBA shipments</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.shipments.map((shipment) => (
                  <div
                    key={shipment.id}
                    className="border rounded-lg overflow-hidden"
                  >
                    {/* Shipment Header */}
                    <div
                      className="bg-[var(--card)] px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--muted)]/30 border-b border-[var(--border)]"
                      onClick={() => toggleExpand(shipment.id)}
                    >
                      <div className="flex items-center gap-4">
                        {expandedShipments.has(shipment.id) ? (
                          <ChevronUp className="w-5 h-5 text-[var(--muted-foreground)]" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-[var(--foreground)]">{shipment.shipmentId}</span>
                            {getStatusBadge(shipment.reconciliationStatus)}
                            {getShipmentStatusBadge(shipment.status)}
                          </div>
                          <div className="text-sm text-[var(--muted-foreground)] mt-1">
                            {shipment.destinationFc && <span>FC: {shipment.destinationFc}</span>}
                            {shipment.destinationName && <span className="ml-2">• {shipment.destinationName}</span>}
                            <span className="ml-2">• {new Date(shipment.createdDate).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-medium text-[var(--foreground)]">{shipment.totalUnits} units</div>
                          <div className="text-xs text-[var(--muted-foreground)]">{shipment.items.length} SKUs</div>
                        </div>

                        {shipment.reconciliationStatus === 'pending' ? (
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reconcileShipment(shipment.id, 'accept')}
                              disabled={processingShipments.has(shipment.id)}
                            >
                              {processingShipments.has(shipment.id) ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Check className="w-4 h-4 mr-1" />
                                  Accept
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => reconcileShipment(shipment.id, 'deduct')}
                              disabled={processingShipments.has(shipment.id) || !selectedWarehouse}
                            >
                              {processingShipments.has(shipment.id) ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Warehouse className="w-4 h-4 mr-1" />
                                  Deduct
                                </>
                              )}
                            </Button>
                          </div>
                        ) : shipment.reconciliationStatus === 'accepted' ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => undoReconciliation(shipment.id)}
                              disabled={processingShipments.has(shipment.id)}
                            >
                              Undo
                            </Button>
                          </div>
                        ) : (
                          <div className="text-sm text-green-600 flex items-center">
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Inventory deducted
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded Items */}
                    {expandedShipments.has(shipment.id) && (
                      <div className="border-t">
                        <table className="min-w-full divide-y divide-[var(--border)]">
                          <thead className="bg-[var(--muted)]/50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--foreground)] uppercase">SKU</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--foreground)] uppercase">Product</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--foreground)] uppercase">Shipped</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--foreground)] uppercase">Received</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-[var(--foreground)] uppercase">Discrepancy</th>
                            </tr>
                          </thead>
                          <tbody className="bg-[var(--card)] divide-y divide-[var(--border)]">
                            {shipment.items.map((item) => (
                              <tr key={item.id}>
                                <td className="px-4 py-2 text-sm font-mono text-[var(--foreground)]">{item.masterSku}</td>
                                <td className="px-4 py-2 text-sm text-[var(--foreground)] max-w-xs truncate">{item.productName}</td>
                                <td className="px-4 py-2 text-sm text-right text-[var(--foreground)]">{item.quantityShipped}</td>
                                <td className="px-4 py-2 text-sm text-right text-[var(--foreground)]">{item.quantityReceived}</td>
                                <td className="px-4 py-2 text-sm text-right">
                                  {item.quantityDiscrepancy !== 0 && (
                                    <span className={item.quantityDiscrepancy > 0 ? 'text-red-600' : 'text-green-600'}>
                                      {item.quantityDiscrepancy > 0 ? '-' : '+'}{Math.abs(item.quantityDiscrepancy)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Reconciliation Details */}
                        {shipment.reconciledAt && (
                          <div className="px-4 py-3 bg-[var(--muted)] border-t border-[var(--border)] text-sm text-[var(--muted-foreground)]">
                            <span>Reconciled on {new Date(shipment.reconciledAt).toLocaleString()}</span>
                            {shipment.reconciledBy && <span className="ml-2">by {shipment.reconciledBy}</span>}
                            {shipment.reconciliationNotes && (
                              <span className="ml-2">• {shipment.reconciliationNotes}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
