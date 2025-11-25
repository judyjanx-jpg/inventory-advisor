'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import { 
  FileText, 
  Plus, 
  Search,
  Truck,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Send,
  Edit,
  Trash2,
  PackageCheck,
  CalendarDays,
  ArrowRight,
  AlertCircle
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
  total: number
  paymentStatus: string
  items: PurchaseOrderItem[]
  notes?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: FileText },
  sent: { label: 'Sent', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Send },
  confirmed: { label: 'Confirmed', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: CheckCircle },
  shipped: { label: 'Shipped', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Truck },
  partial: { label: 'Partial', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: AlertTriangle },
  received: { label: 'Received', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: PackageCheck },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
}

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [backorders, setBackorders] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedPO, setExpandedPO] = useState<number | null>(null)
  
  // Modal states
  const [showCreatePO, setShowCreatePO] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  
  // Create PO form
  const [createForm, setCreateForm] = useState({
    supplierId: '',
    orderDate: new Date().toISOString().split('T')[0],
    expectedDays: 14,
    expectedDate: '',
    notes: '',
    items: [] as { masterSku: string; quantityOrdered: number; unitCost: number }[],
  })
  const [savingPO, setSavingPO] = useState(false)

  // Receive form
  const [receiveItems, setReceiveItems] = useState<Record<number, { received: number; damaged: number; backorder: number }>>({})
  const [savingReceive, setSavingReceive] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  // Update expected date when supplier or days change
  useEffect(() => {
    if (createForm.orderDate && createForm.expectedDays) {
      const orderDate = new Date(createForm.orderDate)
      orderDate.setDate(orderDate.getDate() + createForm.expectedDays)
      setCreateForm(prev => ({
        ...prev,
        expectedDate: orderDate.toISOString().split('T')[0]
      }))
    }
  }, [createForm.orderDate, createForm.expectedDays])

  // Update lead time when supplier changes
  useEffect(() => {
    if (createForm.supplierId) {
      const supplier = suppliers.find(s => s.id === parseInt(createForm.supplierId))
      if (supplier?.leadTimeDays) {
        setCreateForm(prev => ({
          ...prev,
          expectedDays: supplier.leadTimeDays
        }))
      }
    }
  }, [createForm.supplierId, suppliers])

  const fetchData = async () => {
    try {
      const [posRes, suppliersRes, productsRes, backordersRes] = await Promise.all([
        fetch('/api/purchase-orders'),
        fetch('/api/suppliers'),
        fetch('/api/products'),
        fetch('/api/backorders'),
      ])
      
      const posData = await posRes.json()
      const suppliersData = await suppliersRes.json()
      const productsData = await productsRes.json()
      const backordersData = await backordersRes.json().catch(() => [])
      
      setPurchaseOrders(Array.isArray(posData) ? posData : [])
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : [])
      setProducts(Array.isArray(productsData) ? productsData : [])
      setBackorders(Array.isArray(backordersData) ? backordersData : [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const generatePONumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `PO-${year}-${random}`
  }

  const createPurchaseOrder = async () => {
    if (!createForm.supplierId || createForm.items.length === 0) return
    
    setSavingPO(true)
    try {
      const subtotal = createForm.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0)
      
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber: generatePONumber(),
          supplierId: parseInt(createForm.supplierId),
          status: 'draft',
          orderDate: createForm.orderDate,
          expectedArrivalDate: createForm.expectedDate,
          subtotal,
          shippingCost: 0,
          tax: 0,
          total: subtotal,
          items: createForm.items.map(item => ({
            masterSku: item.masterSku,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
            lineTotal: item.quantityOrdered * item.unitCost,
          })),
          notes: createForm.notes,
        }),
      })
      
      if (res.ok) {
        fetchData()
        setShowCreatePO(false)
        setCreateForm({ 
          supplierId: '', 
          orderDate: new Date().toISOString().split('T')[0],
          expectedDays: 14,
          expectedDate: '',
          notes: '', 
          items: [] 
        })
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to create PO')
      }
    } catch (error) {
      console.error('Error creating PO:', error)
    } finally {
      setSavingPO(false)
    }
  }

  const updatePOStatus = async (po: PurchaseOrder, newStatus: string) => {
    try {
      await fetch(`/api/purchase-orders/${po.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      fetchData()
    } catch (error) {
      console.error('Error updating PO:', error)
    }
  }

  const deletePO = async () => {
    if (!selectedPO) return
    
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deductInventory: selectedPO.status === 'received' || selectedPO.status === 'partial'
        }),
      })
      
      if (res.ok) {
        fetchData()
        setShowDeleteConfirm(false)
        setSelectedPO(null)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete PO')
      }
    } catch (error) {
      console.error('Error deleting PO:', error)
    }
  }

  const openReceiveModal = (po: PurchaseOrder) => {
    setSelectedPO(po)
    const initialReceive: Record<number, { received: number; damaged: number; backorder: number }> = {}
    po.items.forEach(item => {
      const remaining = item.quantityOrdered - item.quantityReceived - (item.quantityBackordered || 0)
      initialReceive[item.id] = { 
        received: remaining,
        damaged: 0,
        backorder: 0
      }
    })
    setReceiveItems(initialReceive)
    setShowReceive(true)
  }

  const saveReceive = async () => {
    if (!selectedPO) return
    
    setSavingReceive(true)
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: receiveItems }),
      })
      
      if (res.ok) {
        fetchData()
        setShowReceive(false)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to receive items')
      }
    } catch (error) {
      console.error('Error receiving items:', error)
    } finally {
      setSavingReceive(false)
    }
  }

  const addItemToForm = () => {
    setCreateForm({
      ...createForm,
      items: [...createForm.items, { masterSku: '', quantityOrdered: 1, unitCost: 0 }],
    })
  }

  const updateFormItem = (index: number, field: string, value: any) => {
    const newItems = [...createForm.items]
    newItems[index] = { ...newItems[index], [field]: value }
    
    if (field === 'masterSku') {
      const product = products.find(p => p.sku === value)
      if (product) {
        newItems[index].unitCost = parseFloat(product.cost) || 0
      }
    }
    
    setCreateForm({ ...createForm, items: newItems })
  }

  const removeFormItem = (index: number) => {
    const newItems = createForm.items.filter((_, i) => i !== index)
    setCreateForm({ ...createForm, items: newItems })
  }

  const filteredPOs = purchaseOrders
    .filter(po => statusFilter === 'all' || po.status === statusFilter)
    .filter(po => 
      po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

  const getReceiveProgress = (po: PurchaseOrder) => {
    const totalOrdered = po.items.reduce((sum, item) => sum + item.quantityOrdered, 0)
    const totalReceived = po.items.reduce((sum, item) => sum + item.quantityReceived, 0)
    return totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0
  }

  const getArrivalStatus = (po: PurchaseOrder) => {
    if (!po.actualArrivalDate || !po.expectedArrivalDate) return null
    
    const expected = new Date(po.expectedArrivalDate)
    const actual = new Date(po.actualArrivalDate)
    const diffDays = Math.round((actual.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return { text: 'On time', color: 'text-emerald-400' }
    if (diffDays < 0) return { text: `${Math.abs(diffDays)} days early`, color: 'text-cyan-400' }
    return { text: `${diffDays} days late`, color: 'text-red-400' }
  }

  const getDaysUntilExpected = (po: PurchaseOrder) => {
    if (!po.expectedArrivalDate) return null
    const expected = new Date(po.expectedArrivalDate)
    const today = new Date()
    const diffDays = Math.round((expected.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Purchase Orders</h1>
            <p className="text-slate-400 mt-1">Manage supplier orders and receiving</p>
          </div>
          <Button onClick={() => setShowCreatePO(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Purchase Order
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Object.entries(STATUS_CONFIG).slice(0, 5).map(([status, config]) => {
            const count = purchaseOrders.filter(po => po.status === status).length
            const Icon = config.icon
            return (
              <Card key={status} hover onClick={() => setStatusFilter(status === statusFilter ? 'all' : status)}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-white">{count}</p>
                      <p className="text-sm text-slate-400">{config.label}</p>
                    </div>
                    <Icon className={`w-8 h-8 ${config.color.split(' ').find(c => c.startsWith('text-')) || 'text-slate-400'}`} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Backorders Alert */}
        {backorders.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <AlertCircle className="w-6 h-6 text-amber-400" />
                <div className="flex-1">
                  <p className="font-medium text-white">{backorders.length} items in backorder</p>
                  <p className="text-sm text-slate-400">Items awaiting receipt from previous POs</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.location.href = '/backorders'}>
                  View Backorders
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search and Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by PO number or supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <option key={status} value={status}>{config.label}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Orders List */}
        <Card>
          <CardHeader>
            <CardTitle>Purchase Orders</CardTitle>
            <CardDescription>{filteredPOs.length} orders</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredPOs.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-lg text-slate-400">No purchase orders found</p>
                <p className="text-sm text-slate-500 mt-1">Create your first PO to get started</p>
                <Button className="mt-4" onClick={() => setShowCreatePO(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Purchase Order
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {filteredPOs.map((po) => {
                  const statusConfig = STATUS_CONFIG[po.status] || STATUS_CONFIG.draft
                  const StatusIcon = statusConfig.icon
                  const progress = getReceiveProgress(po)
                  const arrivalStatus = getArrivalStatus(po)
                  const daysUntil = getDaysUntilExpected(po)
                  
                  return (
                    <div key={po.id}>
                      {/* PO Row */}
                      <div 
                        className="flex items-center px-6 py-4 hover:bg-slate-800/30 cursor-pointer"
                        onClick={() => setExpandedPO(expandedPO === po.id ? null : po.id)}
                      >
                        <div className="mr-3">
                          {expandedPO === po.id ? (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-white font-mono">{po.poNumber}</p>
                            <span className={`px-2.5 py-1 text-xs rounded-full border ${statusConfig.color}`}>
                              {statusConfig.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                            <span>{po.supplier.name}</span>
                            <span>•</span>
                            <span>{po.items.length} items</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              Ordered: {formatDate(new Date(po.orderDate || po.createdDate))}
                            </span>
                            {po.expectedArrivalDate && !po.actualArrivalDate && (
                              <>
                                <span>•</span>
                                <span className={`flex items-center gap-1 ${daysUntil !== null && daysUntil < 0 ? 'text-red-400' : daysUntil !== null && daysUntil <= 7 ? 'text-amber-400' : ''}`}>
                                  <Clock className="w-3 h-3" />
                                  ETA: {formatDate(new Date(po.expectedArrivalDate))}
                                  {daysUntil !== null && (
                                    <span>({daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : `${daysUntil}d`})</span>
                                  )}
                                </span>
                              </>
                            )}
                            {arrivalStatus && (
                              <>
                                <span>•</span>
                                <span className={arrivalStatus.color}>{arrivalStatus.text}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          {/* Progress bar for receiving */}
                          {['shipped', 'partial', 'received'].includes(po.status) && (
                            <div className="w-32">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-slate-400">Received</span>
                                <span className="text-white">{progress}%</span>
                              </div>
                              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="text-right">
                            <p className="text-lg font-bold text-white">{formatCurrency(po.total)}</p>
                            <p className="text-xs text-slate-500">{po.paymentStatus}</p>
                          </div>

                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {po.status === 'shipped' && (
                              <Button 
                                variant="success" 
                                size="sm"
                                onClick={() => openReceiveModal(po)}
                              >
                                <PackageCheck className="w-4 h-4 mr-1" />
                                Receive
                              </Button>
                            )}
                            {po.status === 'draft' && (
                              <Button 
                                variant="primary" 
                                size="sm"
                                onClick={() => updatePOStatus(po, 'sent')}
                              >
                                <Send className="w-4 h-4 mr-1" />
                                Send
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setSelectedPO(po)
                                setShowDeleteConfirm(true)
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded PO Items */}
                      {expandedPO === po.id && (
                        <div className="px-6 py-4 bg-slate-900/30 border-t border-slate-700/50">
                          <div className="ml-8">
                            {/* Date Summary for received POs */}
                            {po.actualArrivalDate && (
                              <div className="mb-4 p-4 bg-slate-800/50 rounded-lg flex items-center gap-8 text-sm">
                                <div>
                                  <p className="text-slate-400">Order Date</p>
                                  <p className="text-white font-medium">{formatDate(new Date(po.orderDate || po.createdDate))}</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-500" />
                                <div>
                                  <p className="text-slate-400">Expected</p>
                                  <p className="text-white font-medium">
                                    {formatDate(new Date(po.expectedArrivalDate!))}
                                    <span className="text-slate-500 ml-1">
                                      ({Math.round((new Date(po.expectedArrivalDate!).getTime() - new Date(po.orderDate || po.createdDate).getTime()) / (1000 * 60 * 60 * 24))} days)
                                    </span>
                                  </p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-500" />
                                <div>
                                  <p className="text-slate-400">Arrived</p>
                                  <p className="text-white font-medium">
                                    {formatDate(new Date(po.actualArrivalDate))}
                                    <span className={`ml-2 ${arrivalStatus?.color}`}>{arrivalStatus?.text}</span>
                                  </p>
                                </div>
                              </div>
                            )}

                            <table className="w-full">
                              <thead>
                                <tr className="text-sm text-slate-400 border-b border-slate-700/50">
                                  <th className="text-left py-2 font-medium">SKU</th>
                                  <th className="text-left py-2 font-medium">Product</th>
                                  <th className="text-right py-2 font-medium">Ordered</th>
                                  <th className="text-right py-2 font-medium">Received</th>
                                  <th className="text-right py-2 font-medium">Backorder</th>
                                  <th className="text-right py-2 font-medium">Unit Cost</th>
                                  <th className="text-right py-2 font-medium">Line Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {po.items.map((item) => (
                                  <tr key={item.id} className="text-sm border-b border-slate-700/30">
                                    <td className="py-3 font-mono text-white">{item.masterSku}</td>
                                    <td className="py-3 text-slate-300">{item.product?.title || 'Unknown'}</td>
                                    <td className="py-3 text-right text-white">{item.quantityOrdered}</td>
                                    <td className="py-3 text-right">
                                      <span className={item.quantityReceived === item.quantityOrdered ? 'text-emerald-400' : 'text-amber-400'}>
                                        {item.quantityReceived}
                                      </span>
                                      {item.quantityDamaged > 0 && (
                                        <span className="text-red-400 ml-2">({item.quantityDamaged} damaged)</span>
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
                              <tfoot>
                                <tr className="text-sm font-medium">
                                  <td colSpan={6} className="py-3 text-right text-slate-400">Total:</td>
                                  <td className="py-3 text-right text-white text-lg">{formatCurrency(po.total)}</td>
                                </tr>
                              </tfoot>
                            </table>

                            {/* Action buttons */}
                            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-700/50">
                              {po.status === 'draft' && (
                                <>
                                  <Button variant="primary" size="sm" onClick={() => updatePOStatus(po, 'sent')}>
                                    <Send className="w-4 h-4 mr-1" />
                                    Send to Supplier
                                  </Button>
                                  <Button variant="ghost" size="sm">
                                    <Edit className="w-4 h-4 mr-1" />
                                    Edit
                                  </Button>
                                </>
                              )}
                              {po.status === 'sent' && (
                                <Button variant="secondary" size="sm" onClick={() => updatePOStatus(po, 'confirmed')}>
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Mark Confirmed
                                </Button>
                              )}
                              {po.status === 'confirmed' && (
                                <Button variant="secondary" size="sm" onClick={() => updatePOStatus(po, 'shipped')}>
                                  <Truck className="w-4 h-4 mr-1" />
                                  Mark Shipped
                                </Button>
                              )}
                              {po.status === 'shipped' && (
                                <Button variant="success" size="sm" onClick={() => openReceiveModal(po)}>
                                  <PackageCheck className="w-4 h-4 mr-1" />
                                  Receive Items
                                </Button>
                              )}
                              <Button variant="ghost" size="sm">
                                <Download className="w-4 h-4 mr-1" />
                                Export PDF
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create PO Modal */}
      <Modal
        isOpen={showCreatePO}
        onClose={() => setShowCreatePO(false)}
        title="Create Purchase Order"
        size="xl"
      >
        <div className="space-y-6">
          {/* Supplier Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Supplier <span className="text-red-400">*</span>
              </label>
              <select
                value={createForm.supplierId}
                onChange={(e) => setCreateForm({ ...createForm, supplierId: e.target.value })}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">Select a supplier...</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} {supplier.leadTimeDays && `(${supplier.leadTimeDays} day lead time)`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Order Date
              </label>
              <input
                type="date"
                value={createForm.orderDate}
                onChange={(e) => setCreateForm({ ...createForm, orderDate: e.target.value })}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Expected Arrival */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Lead Time (days)
              </label>
              <input
                type="number"
                value={createForm.expectedDays}
                onChange={(e) => setCreateForm({ ...createForm, expectedDays: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Expected Arrival Date
              </label>
              <input
                type="date"
                value={createForm.expectedDate}
                onChange={(e) => setCreateForm({ ...createForm, expectedDate: e.target.value })}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-300">
                Items <span className="text-red-400">*</span>
              </label>
              <Button variant="ghost" size="sm" onClick={addItemToForm}>
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>
            
            {createForm.items.length === 0 ? (
              <div className="text-center py-8 bg-slate-900/30 rounded-lg border border-dashed border-slate-700">
                <Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No items added yet</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={addItemToForm}>
                  Add Item
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {createForm.items.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                    <select
                      value={item.masterSku}
                      onChange={(e) => updateFormItem(index, 'masterSku', e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">Select product...</option>
                      {products.map((product) => (
                        <option key={product.sku} value={product.sku}>
                          {product.sku} - {product.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={item.quantityOrdered}
                      onChange={(e) => updateFormItem(index, 'quantityOrdered', parseInt(e.target.value) || 0)}
                      placeholder="Qty"
                      min="1"
                      className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                    />
                    <div className="relative w-28">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                      <input
                        type="number"
                        value={item.unitCost}
                        onChange={(e) => updateFormItem(index, 'unitCost', parseFloat(e.target.value) || 0)}
                        placeholder="Cost"
                        step="0.01"
                        className="w-full pl-7 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="w-24 text-right">
                      <span className="text-white font-medium">
                        {formatCurrency(item.quantityOrdered * item.unitCost)}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFormItem(index)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                ))}
                
                {/* Totals */}
                <div className="flex justify-end pt-3 border-t border-slate-700">
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Subtotal</p>
                    <p className="text-xl font-bold text-white">
                      {formatCurrency(createForm.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0))}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Notes
            </label>
            <textarea
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              placeholder="Add any notes for this order..."
              rows={3}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowCreatePO(false)}>
            Cancel
          </Button>
          <Button 
            onClick={createPurchaseOrder} 
            loading={savingPO}
            disabled={!createForm.supplierId || createForm.items.length === 0}
          >
            Create Purchase Order
          </Button>
        </ModalFooter>
      </Modal>

      {/* Receive Items Modal */}
      <Modal
        isOpen={showReceive}
        onClose={() => setShowReceive(false)}
        title="Receive Items"
        description={`Receiving for ${selectedPO?.poNumber}`}
        size="lg"
      >
        {selectedPO && (
          <div className="space-y-4">
            <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
              <p className="text-sm text-slate-400">Supplier: <span className="text-white">{selectedPO.supplier.name}</span></p>
              {selectedPO.expectedArrivalDate && (
                <p className="text-sm text-slate-400 mt-1">
                  Expected: <span className="text-white">{formatDate(new Date(selectedPO.expectedArrivalDate))}</span>
                </p>
              )}
            </div>
            
            <div className="space-y-3">
              {selectedPO.items.map((item) => {
                const remaining = item.quantityOrdered - item.quantityReceived - (item.quantityBackordered || 0)
                if (remaining <= 0) return null
                
                return (
                  <div key={item.id} className="p-4 bg-slate-900/50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-medium text-white">{item.masterSku}</p>
                        <p className="text-sm text-slate-400">{item.product?.title}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-slate-400">Ordered: {item.quantityOrdered}</p>
                        <p className="text-slate-400">Already received: {item.quantityReceived}</p>
                        <p className="text-cyan-400">Remaining: {remaining}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Good Qty</label>
                        <input
                          type="number"
                          value={receiveItems[item.id]?.received || 0}
                          onChange={(e) => {
                            const received = parseInt(e.target.value) || 0
                            const current = receiveItems[item.id] || { received: 0, damaged: 0, backorder: 0 }
                            const backorder = remaining - received - current.damaged
                            setReceiveItems({
                              ...receiveItems,
                              [item.id]: { ...current, received, backorder: Math.max(0, backorder) }
                            })
                          }}
                          max={remaining}
                          min={0}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Damaged Qty</label>
                        <input
                          type="number"
                          value={receiveItems[item.id]?.damaged || 0}
                          onChange={(e) => {
                            const damaged = parseInt(e.target.value) || 0
                            const current = receiveItems[item.id] || { received: 0, damaged: 0, backorder: 0 }
                            const backorder = remaining - current.received - damaged
                            setReceiveItems({
                              ...receiveItems,
                              [item.id]: { ...current, damaged, backorder: Math.max(0, backorder) }
                            })
                          }}
                          max={remaining}
                          min={0}
                          className="w-full px-3 py-2 bg-slate-800 border border-red-700/50 rounded-lg text-white focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-amber-400 mb-1">Backorder Qty</label>
                        <input
                          type="number"
                          value={receiveItems[item.id]?.backorder || 0}
                          onChange={(e) => {
                            const backorder = parseInt(e.target.value) || 0
                            setReceiveItems({
                              ...receiveItems,
                              [item.id]: { ...receiveItems[item.id], backorder }
                            })
                          }}
                          max={remaining}
                          min={0}
                          className="w-full px-3 py-2 bg-slate-800 border border-amber-700/50 rounded-lg text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                    
                    {(receiveItems[item.id]?.backorder || 0) > 0 && (
                      <p className="text-xs text-amber-400 mt-2">
                        ⚠ {receiveItems[item.id]?.backorder} units will be added to backorder for later receipt
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowReceive(false)}>
            Cancel
          </Button>
          <Button onClick={saveReceive} loading={savingReceive}>
            <PackageCheck className="w-4 h-4 mr-2" />
            Confirm Received
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Purchase Order"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-white">Are you sure you want to delete {selectedPO?.poNumber}?</p>
              {(selectedPO?.status === 'received' || selectedPO?.status === 'partial') && (
                <p className="text-sm text-red-400 mt-2">
                  ⚠ This will deduct the quantities received from this PO from your warehouse inventory 
                  and remove supplier performance tracking data.
                </p>
              )}
              <p className="text-sm text-slate-400 mt-2">This action cannot be undone.</p>
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={deletePO}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete PO
          </Button>
        </ModalFooter>
      </Modal>
    </MainLayout>
  )
}
