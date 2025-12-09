'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import { 
  ArrowLeft,
  Edit,
  Trash2,
  Send,
  Upload,
  FileSpreadsheet,
  Download,
  PackageCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  CalendarDays,
  Truck,
  Filter,
  SortAsc,
  Search,
  Plus,
  Minus
} from 'lucide-react'

interface PurchaseOrderItem {
  id: number
  masterSku: string
  product: {
    title: string
    cost: number
  }
  quantityOrdered: number
  quantityReceived: number
  quantityDamaged: number
  quantityBackordered: number
  unitCost: number
  lineTotal: number
}

interface PurchaseOrder {
  id: number
  poNumber: string
  supplier: {
    id: number
    name: string
    email?: string
    leadTimeDays?: number
  }
  status: string
  createdDate: string
  orderDate: string
  sentDate?: string
  expectedArrivalDate?: string
  actualArrivalDate?: string
  subtotal: number
  shippingCost: number
  tax: number
  otherCosts?: number
  total: number
  paymentStatus: string
  items: PurchaseOrderItem[]
  notes?: string
  carrier?: string
  trackingNumber?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: Edit },
  sent: { label: 'Sent', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Send },
  confirmed: { label: 'Confirmed', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: CheckCircle },
  shipped: { label: 'Shipped', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Truck },
  partial: { label: 'Partially Received', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: AlertTriangle },
  received: { label: 'Received', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: PackageCheck },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
}

export default function PurchaseOrderDetailPage() {
  const router = useRouter()
  const params = useParams()
  const poId = params.id as string

  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [sortBy, setSortBy] = useState<'sku' | 'product' | 'quantity' | 'cost'>('sku')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [filterTerm, setFilterTerm] = useState('')
  
  // Modal states
  const [showEditCosts, setShowEditCosts] = useState(false)
  const [showEditDates, setShowEditDates] = useState(false)
  const [showSendEmail, setShowSendEmail] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [showUploadChanges, setShowUploadChanges] = useState(false)
  
  // Edit forms
  const [costsForm, setCostsForm] = useState({
    shippingCost: 0,
    tax: 0,
    otherCosts: 0,
  })
  
  const [datesForm, setDatesForm] = useState({
    orderDate: '',
    expectedArrivalDate: '',
  })
  
  const [receiveItems, setReceiveItems] = useState<Record<number, { received: number; damaged: number; backorder: number }>>({})
  const [savingReceive, setSavingReceive] = useState(false)

  useEffect(() => {
    fetchPO()
  }, [poId])

  const fetchPO = async () => {
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`)
      if (res.ok) {
        const data = await res.json()
        setPo(data)
        setCostsForm({
          shippingCost: Number(data.shippingCost || 0),
          tax: Number(data.tax || 0),
          otherCosts: Number(data.otherCosts || 0),
        })
        setDatesForm({
          orderDate: data.orderDate ? new Date(data.orderDate).toISOString().split('T')[0] : '',
          expectedArrivalDate: data.expectedArrivalDate ? new Date(data.expectedArrivalDate).toISOString().split('T')[0] : '',
        })
      }
    } catch (error) {
      console.error('Error fetching PO:', error)
    } finally {
      setLoading(false)
    }
  }

  const updatePOStatus = async (newStatus: string) => {
    if (!po) return
    
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      
      if (res.ok) {
        await fetchPO()
      }
    } catch (error) {
      console.error('Error updating PO status:', error)
    }
  }

  const saveCosts = async () => {
    if (!po) return
    
    try {
      const subtotal = po.subtotal
      const newTotal = subtotal + costsForm.shippingCost + costsForm.tax + costsForm.otherCosts
      
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shippingCost: costsForm.shippingCost,
          tax: costsForm.tax,
          otherCosts: costsForm.otherCosts,
          total: newTotal,
        }),
      })
      
      if (res.ok) {
        await fetchPO()
        setShowEditCosts(false)
      }
    } catch (error) {
      console.error('Error saving costs:', error)
    }
  }

  const saveDates = async () => {
    if (!po) return
    
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: datesForm.orderDate,
          expectedArrivalDate: datesForm.expectedArrivalDate || null,
        }),
      })
      
      if (res.ok) {
        await fetchPO()
        setShowEditDates(false)
      }
    } catch (error) {
      console.error('Error saving dates:', error)
    }
  }

  const handleReceive = async () => {
    if (!po) return
    
    setSavingReceive(true)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: receiveItems }),
      })
      
      if (res.ok) {
        await fetchPO()
        setShowReceive(false)
        setReceiveItems({})
        // Refresh forecasting data
        await fetch('/api/forecasting/generate', { method: 'POST' }).catch(() => {})
      }
    } catch (error) {
      console.error('Error receiving PO:', error)
    } finally {
      setSavingReceive(false)
    }
  }

  const deletePO = async () => {
    if (!po) return
    
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deductInventory: true }),
      })
      
      if (res.ok) {
        router.push('/purchase-orders')
      }
    } catch (error) {
      console.error('Error deleting PO:', error)
    }
  }

  const toggleItemSelection = (itemId: number) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedItems(newSelected)
  }

  const deleteSelectedItems = async () => {
    if (selectedItems.size === 0 || !po) return
    
    // TODO: Implement delete items API endpoint
    console.log('Delete items:', Array.from(selectedItems))
  }

  const sortedAndFilteredItems = po?.items
    ? [...po.items]
        .filter(item => {
          if (!filterTerm) return true
          const term = filterTerm.toLowerCase()
          return (
            item.masterSku.toLowerCase().includes(term) ||
            item.product?.title?.toLowerCase().includes(term)
          )
        })
        .sort((a, b) => {
          let comparison = 0
          switch (sortBy) {
            case 'sku':
              comparison = a.masterSku.localeCompare(b.masterSku)
              break
            case 'product':
              comparison = (a.product?.title || '').localeCompare(b.product?.title || '')
              break
            case 'quantity':
              comparison = a.quantityOrdered - b.quantityOrdered
              break
            case 'cost':
              comparison = Number(a.unitCost) - Number(b.unitCost)
              break
          }
          return sortOrder === 'asc' ? comparison : -comparison
        })
    : []

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      </MainLayout>
    )
  }

  if (!po) {
    return (
      <MainLayout>
        <div className="text-center py-16">
          <p className="text-slate-400">Purchase order not found</p>
          <Button variant="ghost" onClick={() => router.push('/purchase-orders')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to All POs
          </Button>
        </div>
      </MainLayout>
    )
  }

  const statusConfig = STATUS_CONFIG[po.status] || STATUS_CONFIG.draft
  const StatusIcon = statusConfig.icon

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/purchase-orders')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to All POs
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">Purchase Order {po.poNumber}</h1>
          </div>
        </div>

        {/* PO Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>PO Information</CardTitle>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 text-sm rounded-full border flex items-center gap-2 ${statusConfig.color}`}>
                  <StatusIcon className="w-4 h-4" />
                  {statusConfig.label}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-slate-400 mb-1">Order Date</p>
                <p className="text-white font-medium">{formatDate(new Date(po.orderDate || po.createdDate))}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Expected Date</p>
                <p className="text-white font-medium">
                  {po.expectedArrivalDate ? formatDate(new Date(po.expectedArrivalDate)) : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Supplier</p>
                <p className="text-white font-medium">{po.supplier.name}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-1">Receiving Warehouse</p>
                <p className="text-white font-medium">Default Warehouse</p>
              </div>
            </div>

            {po.notes && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-sm text-slate-400 mb-1">Notes</p>
                <p className="text-white">{po.notes}</p>
              </div>
            )}

            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-700">
              <Button variant="primary" size="sm" onClick={() => setShowSendEmail(true)}>
                <Send className="w-4 h-4 mr-2" />
                Email PO
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowEditDates(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Dates
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowEditCosts(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Costs
              </Button>
              {po.status === 'sent' && (
                <Button variant="secondary" size="sm" onClick={() => updatePOStatus('confirmed')}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark Confirmed
                </Button>
              )}
              {po.status === 'confirmed' && (
                <Button variant="secondary" size="sm" onClick={() => updatePOStatus('shipped')}>
                  <Truck className="w-4 h-4 mr-2" />
                  Mark Shipped
                </Button>
              )}
              {po.status === 'shipped' && (
                <Button variant="success" size="sm" onClick={() => {
                  setReceiveItems({})
                  setShowReceive(true)
                }}>
                  <PackageCheck className="w-4 h-4 mr-2" />
                  Receive Items
                </Button>
              )}
              <Button variant="ghost" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Items Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Items</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter items..."
                    value={filterTerm}
                    onChange={(e) => setFilterTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="sku">Sort by SKU</option>
                  <option value="product">Sort by Product</option>
                  <option value="quantity">Sort by Quantity</option>
                  <option value="cost">Sort by Cost</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  <SortAsc className={`w-4 h-4 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowUploadChanges(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Changes
                </Button>
                {selectedItems.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={deleteSelectedItems}>
                    <Trash2 className="w-4 h-4 mr-2 text-red-400" />
                    Delete ({selectedItems.size})
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-sm text-slate-400 border-b border-slate-700/50">
                    <th className="text-left py-3 font-medium w-12">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === sortedAndFilteredItems.length && sortedAndFilteredItems.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItems(new Set(sortedAndFilteredItems.map(item => item.id)))
                          } else {
                            setSelectedItems(new Set())
                          }
                        }}
                        className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                      />
                    </th>
                    <th className="text-left py-3 font-medium">SKU</th>
                    <th className="text-left py-3 font-medium">Product</th>
                    <th className="text-right py-3 font-medium">Ordered</th>
                    <th className="text-right py-3 font-medium">Received</th>
                    <th className="text-right py-3 font-medium">Damaged</th>
                    <th className="text-right py-3 font-medium">Backorder</th>
                    <th className="text-right py-3 font-medium">Unit Cost</th>
                    <th className="text-right py-3 font-medium">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAndFilteredItems.map((item) => (
                    <tr key={item.id} className="text-sm border-b border-slate-700/30 hover:bg-slate-800/30">
                      <td className="py-3">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleItemSelection(item.id)}
                          className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                        />
                      </td>
                      <td className="py-3 font-mono text-white">{item.masterSku}</td>
                      <td className="py-3 text-slate-300">{item.product?.title || 'Unknown'}</td>
                      <td className="py-3 text-right text-white">{item.quantityOrdered}</td>
                      <td className="py-3 text-right">
                        <span className={item.quantityReceived === item.quantityOrdered ? 'text-emerald-400' : 'text-amber-400'}>
                          {item.quantityReceived}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {item.quantityDamaged > 0 ? (
                          <span className="text-red-400">{item.quantityDamaged}</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {(item.quantityBackordered || 0) > 0 ? (
                          <span className="text-amber-400">{item.quantityBackordered}</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-slate-300">{formatCurrency(item.unitCost)}</td>
                      <td className="py-3 text-right text-white font-medium">{formatCurrency(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Other Costs & Total */}
        <Card>
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="text-white font-medium">{formatCurrency(po.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Shipping</span>
                <span className="text-white font-medium">{formatCurrency(po.shippingCost || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Tax</span>
                <span className="text-white font-medium">{formatCurrency(po.tax || 0)}</span>
              </div>
              {po.otherCosts && Number(po.otherCosts) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Other Costs</span>
                  <span className="text-white font-medium">{formatCurrency(po.otherCosts)}</span>
                </div>
              )}
              <div className="flex justify-between pt-4 border-t border-slate-700">
                <span className="text-white font-semibold text-lg">Total</span>
                <span className="text-white font-bold text-xl">{formatCurrency(po.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Costs Modal */}
      <Modal
        isOpen={showEditCosts}
        onClose={() => setShowEditCosts(false)}
        title="Edit Costs"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Shipping Cost</label>
            <input
              type="number"
              step="0.01"
              value={costsForm.shippingCost}
              onChange={(e) => setCostsForm({ ...costsForm, shippingCost: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Tax</label>
            <input
              type="number"
              step="0.01"
              value={costsForm.tax}
              onChange={(e) => setCostsForm({ ...costsForm, tax: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Other Costs</label>
            <input
              type="number"
              step="0.01"
              value={costsForm.otherCosts}
              onChange={(e) => setCostsForm({ ...costsForm, otherCosts: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowEditCosts(false)}>Cancel</Button>
          <Button variant="primary" onClick={saveCosts}>Save</Button>
        </ModalFooter>
      </Modal>

      {/* Edit Dates Modal */}
      <Modal
        isOpen={showEditDates}
        onClose={() => setShowEditDates(false)}
        title="Edit Dates"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Order Date</label>
            <input
              type="date"
              value={datesForm.orderDate}
              onChange={(e) => setDatesForm({ ...datesForm, orderDate: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Expected Arrival Date</label>
            <input
              type="date"
              value={datesForm.expectedArrivalDate}
              onChange={(e) => setDatesForm({ ...datesForm, expectedArrivalDate: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowEditDates(false)}>Cancel</Button>
          <Button variant="primary" onClick={saveDates}>Save</Button>
        </ModalFooter>
      </Modal>

      {/* Send Email Modal */}
      <Modal
        isOpen={showSendEmail}
        onClose={() => setShowSendEmail(false)}
        title="Email Purchase Order"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email Template</label>
            <select className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500">
              <option>Standard PO Template</option>
              <option>Urgent Order Template</option>
              <option>Custom Template 1</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Recipient</label>
            <input
              type="email"
              defaultValue={po.supplier.email || ''}
              placeholder="supplier@example.com"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Subject</label>
            <input
              type="text"
              defaultValue={`Purchase Order ${po.poNumber}`}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Message</label>
            <textarea
              rows={6}
              defaultValue={`Please find attached Purchase Order ${po.poNumber}.\n\nThank you for your business.`}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowSendEmail(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            // TODO: Implement email sending
            setShowSendEmail(false)
          }}>
            <Send className="w-4 h-4 mr-2" />
            Send Email
          </Button>
        </ModalFooter>
      </Modal>

      {/* Receive Items Modal */}
      <Modal
        isOpen={showReceive}
        onClose={() => setShowReceive(false)}
        title="Receive Items"
        size="lg"
      >
        <div className="space-y-4">
          {po.items.map((item) => {
            const remaining = item.quantityOrdered - item.quantityReceived - item.quantityDamaged
            const current = receiveItems[item.id] || { received: 0, damaged: 0, backorder: 0 }
            
            return (
              <div key={item.id} className="p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-white">{item.masterSku}</p>
                    <p className="text-sm text-slate-400">{item.product?.title}</p>
                  </div>
                  <div className="text-sm text-slate-400">
                    Ordered: {item.quantityOrdered} | Received: {item.quantityReceived} | Remaining: {remaining}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Received</label>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      value={current.received}
                      onChange={(e) => setReceiveItems({
                        ...receiveItems,
                        [item.id]: { ...current, received: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Damaged</label>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      value={current.damaged}
                      onChange={(e) => setReceiveItems({
                        ...receiveItems,
                        [item.id]: { ...current, damaged: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Backorder</label>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      value={current.backorder}
                      onChange={(e) => setReceiveItems({
                        ...receiveItems,
                        [item.id]: { ...current, backorder: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowReceive(false)}>Cancel</Button>
          <Button variant="success" onClick={handleReceive} disabled={savingReceive}>
            {savingReceive ? 'Receiving...' : 'Receive Items'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Upload Changes Modal */}
      <Modal
        isOpen={showUploadChanges}
        onClose={() => setShowUploadChanges(false)}
        title="Upload Changes"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">
            Upload a CSV or Excel file with updated item costs, quantities, or other changes.
          </p>
          <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
            <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-500 mb-4" />
            <p className="text-slate-400 mb-2">Drop file here or click to browse</p>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" id="upload-file" />
            <Button variant="ghost" onClick={() => document.getElementById('upload-file')?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Select File
            </Button>
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowUploadChanges(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            // TODO: Implement file upload
            setShowUploadChanges(false)
          }}>Upload</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Purchase Order"
      >
        <p className="text-slate-300 mb-4">
          Are you sure you want to delete this purchase order? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={deletePO}>Delete</Button>
        </ModalFooter>
      </Modal>
    </MainLayout>
  )
}

