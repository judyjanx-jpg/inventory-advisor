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
import StatusButton from '@/components/purchase-orders/StatusButton'
import EditableField from '@/components/purchase-orders/EditableField'
import SKUSearchModal from '@/components/purchase-orders/SKUSearchModal'
import ImportModal from '@/components/purchase-orders/ImportModal'
import ExportDropdown from '@/components/purchase-orders/ExportDropdown'
import AdditionalCostsSection from '@/components/purchase-orders/AdditionalCostsSection'
import EmailComposerModal from '@/components/purchase-orders/EmailComposerModal'
import ProgressTimeline from '@/components/purchase-orders/ProgressTimeline'

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
  confirmedDate?: string
  expectedShipDate?: string
  expectedArrivalDate?: string
  actualShipDate?: string
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
  draft: { label: 'Draft', color: 'bg-slate-500/20 text-[var(--muted-foreground)] border-slate-500/30', icon: Edit },
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
  const [showSKUSearch, setShowSKUSearch] = useState(false)
  const [showImport, setShowImport] = useState(false)
  
  // Edit forms
  const [costsForm, setCostsForm] = useState({
    shippingCost: 0,
    tax: 0,
    otherCosts: 0,
  })
  
  const [datesForm, setDatesForm] = useState({
    createdDate: '',
    confirmedDate: '',
    actualShipDate: '',
    actualArrivalDate: '',
  })
  
  const [receiveItems, setReceiveItems] = useState<Record<number, { received: number; damaged: number; backorder: number }>>({})
  const [savingReceive, setSavingReceive] = useState(false)
  const [editingReceived, setEditingReceived] = useState<number | null>(null)
  const [receivedValue, setReceivedValue] = useState<number>(0)
  const [showReceivedOptions, setShowReceivedOptions] = useState<{ itemId: number; difference: number } | null>(null)

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
          createdDate: data.createdDate ? new Date(data.createdDate).toISOString().split('T')[0] : '',
          confirmedDate: data.confirmedDate ? new Date(data.confirmedDate).toISOString().split('T')[0] : '',
          actualShipDate: data.actualShipDate ? new Date(data.actualShipDate).toISOString().split('T')[0] : '',
          actualArrivalDate: data.actualArrivalDate ? new Date(data.actualArrivalDate).toISOString().split('T')[0] : '',
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
      const today = new Date().toISOString().split('T')[0]
      const updateData: any = { status: newStatus }
      
      // Auto-set dates based on status
      if (newStatus === 'confirmed' && !po.confirmedDate) {
        updateData.confirmedDate = today
      } else if (newStatus === 'shipped' && !po.actualShipDate) {
        updateData.actualShipDate = today
      } else if (newStatus === 'received' && !po.actualArrivalDate) {
        updateData.actualArrivalDate = today
      }
      
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })
      
      if (res.ok) {
        await fetchPO()
      }
    } catch (error) {
      console.error('Error updating PO status:', error)
    }
  }

  const calculateLeadTime = () => {
    if (!po || !po.orderDate || !po.expectedArrivalDate) return null
    const order = new Date(po.orderDate)
    const expected = new Date(po.expectedArrivalDate)
    return Math.ceil((expected.getTime() - order.getTime()) / (1000 * 60 * 60 * 24))
  }

  const calculateActualLeadTime = () => {
    if (!po || !po.orderDate || !po.actualArrivalDate) return null
    const order = new Date(po.orderDate)
    const actual = new Date(po.actualArrivalDate)
    return Math.ceil((actual.getTime() - order.getTime()) / (1000 * 60 * 60 * 24))
  }

  const handleFieldUpdate = async (field: string, value: any) => {
    if (!po) return
    
    try {
      const updateData: any = { [field]: value }
      
      // Handle date/lead time sync
      if (field === 'expectedArrivalDate') {
        const leadTime = calculateLeadTime()
        if (leadTime !== null) {
          // Lead time will be recalculated
        }
      } else if (field === 'leadTimeDays') {
        if (po.orderDate) {
          const orderDate = new Date(po.orderDate)
          orderDate.setDate(orderDate.getDate() + Number(value))
          updateData.expectedArrivalDate = orderDate.toISOString().split('T')[0]
        }
      }
      
      await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })
      
      await fetchPO()
    } catch (error) {
      console.error(`Error updating ${field}:`, error)
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
          createdDate: datesForm.createdDate || null,
          confirmedDate: datesForm.confirmedDate || null,
          actualShipDate: datesForm.actualShipDate || null,
          actualArrivalDate: datesForm.actualArrivalDate || null,
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
    
    if (!confirm(`Delete ${selectedItems.size} item(s)?`)) return
    
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: Array.from(selectedItems) }),
      })
      
      if (res.ok) {
        await fetchPO()
        setSelectedItems(new Set())
      } else {
        alert('Failed to delete items')
      }
    } catch (error) {
      console.error('Error deleting items:', error)
      alert('Failed to delete items')
    }
  }

  const handleAddItem = async (sku: { sku: string; title: string; cost: number }) => {
    if (!po) return
    
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterSku: sku.sku,
          quantityOrdered: 0,
          unitCost: Number(sku.cost) || 0,
          lineTotal: 0,
        }),
      })
      
      if (res.ok) {
        await fetchPO()
      } else {
        alert('Failed to add item')
      }
    } catch (error) {
      console.error('Error adding item:', error)
      alert('Failed to add item')
    }
  }

  const handleItemUpdate = async (itemId: number, field: string, value: any) => {
    if (!po) return
    
    try {
      const item = po.items.find(i => i.id === itemId)
      if (!item) return
      
      const updateData: any = { [field]: value }
      
      // Recalculate line total if quantity or cost changes
      if (field === 'quantityOrdered' || field === 'unitCost') {
        const qty = field === 'quantityOrdered' ? Number(value) : item.quantityOrdered
        const cost = field === 'unitCost' ? Number(value) : Number(item.unitCost)
        updateData.lineTotal = qty * cost
      }
      
      const res = await fetch(`/api/purchase-orders/${poId}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })
      
      if (res.ok) {
        await fetchPO()
      }
    } catch (error) {
      console.error('Error updating item:', error)
    }
  }

  const handleReceivedChange = (itemId: number, newReceived: number) => {
    if (!po) return
    
    const item = po.items.find(i => i.id === itemId)
    if (!item) return
    
    // Validate: can't receive more than ordered
    if (newReceived > item.quantityOrdered) {
      alert(`Cannot receive more than ordered (${item.quantityOrdered})`)
      setEditingReceived(null)
      return
    }
    
    // Calculate difference: what's left after accounting for received, damaged, and backordered
    const totalAccounted = newReceived + item.quantityDamaged + (item.quantityBackordered || 0)
    const difference = item.quantityOrdered - totalAccounted
    
    // If there's a shortfall, show options
    if (difference > 0) {
      setShowReceivedOptions({ itemId, difference })
      setReceivedValue(newReceived)
    } else {
      // No shortfall, directly update
      handleReceivedUpdate(itemId, newReceived, 0, 0)
    }
  }

  const handleReceivedUpdate = async (itemId: number, received: number, removeFromPO: number = 0, addToBackorder: number = 0) => {
    if (!po) return
    
    setSavingReceive(true)
    try {
      const item = po.items.find(i => i.id === itemId)
      if (!item) return
      
      // Calculate the actual received amount (difference from current)
      const receivedDiff = received - item.quantityReceived
      
      // Update quantities
      const updateData: any = {
        quantityReceived: received
      }
      
      // If removing from PO, reduce quantityOrdered to match received
      if (removeFromPO > 0) {
        updateData.quantityOrdered = received
        // Recalculate line total based on new ordered quantity
        updateData.lineTotal = received * Number(item.unitCost)
      }
      
      // If adding to backorder, create a backorder record and reduce quantityOrdered to match received
      if (addToBackorder > 0) {
        // Create a backorder record for the shortfall
        try {
          const backorderRes = await fetch('/api/backorders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              masterSku: item.masterSku,
              quantity: addToBackorder,
              poId: po.id,
              poNumber: po.poNumber,
              supplierId: po.supplier.id,
              unitCost: Number(item.unitCost)
            }),
          })
          if (!backorderRes.ok) {
            console.error('Failed to create backorder')
          }
        } catch (error) {
          console.error('Error creating backorder:', error)
        }
        
        // Also reduce quantityOrdered to match received
        updateData.quantityOrdered = received
        // Recalculate line total based on new ordered quantity
        updateData.lineTotal = received * Number(item.unitCost)
      }
      
      // Update the item
      const res = await fetch(`/api/purchase-orders/${poId}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })
      
      if (res.ok) {
        // If there's an increase in received quantity, update inventory via receive API
        // (This handles inventory updates and linked products)
        if (receivedDiff > 0) {
          try {
            await fetch(`/api/purchase-orders/${poId}/receive`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: {
                  [itemId]: {
                    received: receivedDiff,
                    damaged: 0,
                    backorder: 0
                  }
                }
              }),
            })
          } catch (error) {
            console.error('Error updating inventory:', error)
            // Continue even if inventory update fails
          }
        }
        
        await fetchPO()
        setShowReceivedOptions(null)
        setEditingReceived(null)
      } else {
        const errorData = await res.json().catch(() => ({}))
        alert(errorData.error || 'Failed to update received quantity')
      }
    } catch (error) {
      console.error('Error updating received quantity:', error)
      alert('Failed to update received quantity')
    } finally {
      setSavingReceive(false)
    }
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
          <p className="text-[var(--muted-foreground)]">Purchase order not found</p>
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
            <h1 className="text-3xl font-bold text-[var(--foreground)]">{po.poNumber}</h1>
          </div>
          <div className="flex items-center gap-2">
            {(po.status === 'draft' || po.status === 'sent') && (
              <Button variant="primary" size="sm" onClick={() => setShowSendEmail(true)}>
                <Send className="w-4 h-4 mr-2" />
                Email PO
              </Button>
            )}
            <div className="relative z-10">
              <StatusButton
                currentStatus={po.status}
                onStatusChange={updatePOStatus}
              />
            </div>
          </div>
        </div>

        {/* Progress Timeline */}
        <Card>
          <CardContent className="py-6">
            <ProgressTimeline
              status={po.status}
              createdDate={po.createdDate}
              orderDate={po.orderDate}
              confirmedDate={po.confirmedDate}
              shippedDate={po.actualShipDate}
              receivedDate={po.actualArrivalDate}
              expectedDate={po.expectedArrivalDate}
              compact={false}
            />
          </CardContent>
        </Card>

        {/* PO Info Grid */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>PO Information</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => {
                if (po) {
                  setDatesForm({
                    createdDate: po.createdDate ? new Date(po.createdDate).toISOString().split('T')[0] : '',
                    confirmedDate: po.confirmedDate ? new Date(po.confirmedDate).toISOString().split('T')[0] : '',
                    actualShipDate: po.actualShipDate ? new Date(po.actualShipDate).toISOString().split('T')[0] : '',
                    actualArrivalDate: po.actualArrivalDate ? new Date(po.actualArrivalDate).toISOString().split('T')[0] : '',
                  })
                }
                setShowEditDates(true)
              }}>
                <CalendarDays className="w-4 h-4 mr-2" />
                Edit Dates
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Row 1: Supplier */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Supplier</p>
                <EditableField
                  value={po.supplier.name}
                  onChange={(value) => {
                    // TODO: Update supplier via API
                    console.log('Update supplier:', value)
                  }}
                  type="text"
                  className="text-[var(--foreground)] font-medium"
                />
              </div>
            </div>

            {/* Row 2: Date Trackers - Created, Confirmed, Shipped, Arrived */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Created Date</p>
                <EditableField
                  value={po.createdDate}
                  onChange={(value) => handleFieldUpdate('createdDate', value)}
                  type="date"
                  className="text-[var(--foreground)] font-medium"
                  formatValue={(val) => formatDate(new Date(val as string))}
                />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Confirmed Date</p>
                <EditableField
                  value={po.confirmedDate || ''}
                  onChange={(value) => handleFieldUpdate('confirmedDate', value)}
                  type="date"
                  className="text-[var(--foreground)] font-medium"
                  formatValue={(val) => val ? formatDate(new Date(val as string)) : 'Not set'}
                  placeholder="Not set"
                />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Shipped Date</p>
                <EditableField
                  value={po.actualShipDate || ''}
                  onChange={(value) => handleFieldUpdate('actualShipDate', value)}
                  type="date"
                  className="text-[var(--foreground)] font-medium"
                  formatValue={(val) => val ? formatDate(new Date(val as string)) : 'Not set'}
                  placeholder="Not set"
                />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Arrived Date</p>
                <EditableField
                  value={po.actualArrivalDate || ''}
                  onChange={(value) => handleFieldUpdate('actualArrivalDate', value)}
                  type="date"
                  className="text-[var(--foreground)] font-medium"
                  formatValue={(val) => val ? formatDate(new Date(val as string)) : 'Not set'}
                  placeholder="Not set"
                />
              </div>
            </div>

            {/* Row 3: Order Date | Expected Date | Exp. Lead Time | Actual Lead Time */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Order Date</p>
                <EditableField
                  value={po.orderDate || po.createdDate}
                  onChange={(value) => handleFieldUpdate('orderDate', value)}
                  type="date"
                  className="text-[var(--foreground)] font-medium"
                  formatValue={(val) => formatDate(new Date(val as string))}
                />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Expected Date</p>
                <EditableField
                  value={po.expectedArrivalDate || ''}
                  onChange={(value) => handleFieldUpdate('expectedArrivalDate', value)}
                  type="date"
                  className="text-[var(--foreground)] font-medium"
                  formatValue={(val) => val ? formatDate(new Date(val as string)) : 'Not set'}
                  placeholder="Not set"
                />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Exp. Lead Time</p>
                <EditableField
                  value={calculateLeadTime() || 0}
                  onChange={(value) => handleFieldUpdate('leadTimeDays', value)}
                  type="number"
                  className="text-[var(--foreground)] font-medium"
                  formatValue={(val) => `${val} days`}
                  min={0}
                />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Actual Lead Time</p>
                <div className="text-[var(--foreground)] font-medium">
                  {calculateActualLeadTime() !== null ? `${calculateActualLeadTime()} days` : 'Not set'}
                </div>
              </div>
            </div>

            {po.notes && (
              <div className="mt-6 pt-6 border-t border-[var(--border)]">
                <p className="text-sm text-[var(--muted-foreground)] mb-2">Notes</p>
                <EditableField
                  value={po.notes}
                  onChange={(value) => handleFieldUpdate('notes', value)}
                  type="text"
                  className="text-[var(--foreground)]"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>Items</CardTitle>
                <span className="px-2 py-1 text-xs bg-[var(--muted)] text-[var(--foreground)] rounded">
                  {po.items.length} items
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowSKUSearch(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowImport(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
                <Button variant="primary" size="sm" onClick={() => setShowReceive(true)}>
                  <PackageCheck className="w-4 h-4 mr-2" />
                  Receive Items
                </Button>
                {po && <ExportDropdown po={po} />}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    placeholder="Filter items..."
                    value={filterTerm}
                    onChange={(e) => setFilterTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                  <tr className="text-sm text-[var(--muted-foreground)] border-b border-[var(--border)]/50">
                    <th className="text-left py-4 px-2 font-medium w-12">
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
                        className="rounded border-[var(--border)] bg-[var(--card)] text-cyan-500 focus:ring-cyan-500"
                      />
                    </th>
                    <th className="text-left py-4 px-4 font-medium min-w-[120px]">SKU</th>
                    <th className="text-left py-4 px-4 font-medium min-w-[300px]">Product</th>
                    <th className="text-right py-4 px-4 font-medium min-w-[80px]">Ordered</th>
                    <th className="text-right py-4 px-4 font-medium min-w-[120px]">
                      Received
                      <span className="text-xs text-[var(--muted-foreground)] ml-1 font-normal block">(click to edit)</span>
                    </th>
                    <th className="text-right py-4 px-4 font-medium min-w-[90px]">Damaged</th>
                    <th className="text-right py-4 px-4 font-medium min-w-[100px]">Backorder</th>
                    <th className="text-right py-4 px-4 font-medium min-w-[100px]">Unit Cost</th>
                    <th className="text-right py-4 px-4 font-medium min-w-[110px]">Line Total</th>
                    <th className="text-center py-4 px-2 font-medium w-16">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAndFilteredItems.map((item) => (
                    <tr key={item.id} className="text-sm border-b border-[var(--border)]/30 hover:bg-[var(--card)]/30 group">
                      <td className="py-4 px-2">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleItemSelection(item.id)}
                          className="rounded border-[var(--border)] bg-[var(--card)] text-cyan-500 focus:ring-cyan-500"
                        />
                      </td>
                      <td className="py-4 px-4 font-mono text-[var(--foreground)]">{item.masterSku}</td>
                      <td className="py-4 px-4 text-[var(--foreground)]">{item.product?.title || 'Unknown'}</td>
                      <td className="py-4 px-4 text-right">
                        <EditableField
                          value={item.quantityOrdered}
                          onChange={(value) => handleItemUpdate(item.id, 'quantityOrdered', value)}
                          type="number"
                          className="text-[var(--foreground)] inline-block"
                          min={0}
                        />
                      </td>
                      <td className="py-4 px-4 text-right">
                        {editingReceived === item.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <input
                              type="number"
                              min={0}
                              max={item.quantityOrdered}
                              value={receivedValue}
                              onChange={(e) => setReceivedValue(parseInt(e.target.value) || 0)}
                              onBlur={() => {
                                handleReceivedChange(item.id, receivedValue)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleReceivedChange(item.id, receivedValue)
                                } else if (e.key === 'Escape') {
                                  setEditingReceived(null)
                                  setReceivedValue(0)
                                }
                              }}
                              autoFocus
                              className="w-20 px-2 py-1 bg-[var(--card)] border-2 border-cyan-500 rounded text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 justify-end">
                            <span
                              className={`cursor-pointer hover:underline hover:bg-[var(--muted)]/30 px-2 py-1 rounded transition-colors ${
                                item.quantityReceived === item.quantityOrdered ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                              onClick={() => {
                                setEditingReceived(item.id)
                                setReceivedValue(item.quantityReceived)
                              }}
                              title="Click to edit received quantity"
                            >
                              {item.quantityReceived}
                            </span>
                            <Edit className="w-3 h-3 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {item.quantityDamaged > 0 ? (
                          <span className="text-red-400">{item.quantityDamaged}</span>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {(item.quantityBackordered || 0) > 0 ? (
                          <span className="text-amber-400">{item.quantityBackordered}</span>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <EditableField
                          value={Number(item.unitCost)}
                          onChange={(value) => handleItemUpdate(item.id, 'unitCost', value)}
                          type="number"
                          className="text-[var(--foreground)] inline-block"
                          formatValue={(val) => formatCurrency(val as number)}
                          parseValue={(val) => parseFloat(val) || 0}
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="py-4 px-4 text-right text-[var(--foreground)] font-medium">{formatCurrency(item.lineTotal)}</td>
                      <td className="py-4 px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (confirm('Delete this item?')) {
                              try {
                                const res = await fetch(`/api/purchase-orders/${poId}/items/${item.id}`, {
                                  method: 'DELETE',
                                })
                                if (res.ok) {
                                  await fetchPO()
                                } else {
                                  alert('Failed to delete item')
                                }
                              } catch (error) {
                                console.error('Error deleting item:', error)
                                alert('Failed to delete item')
                              }
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Items Subtotal */}
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between">
              <span className="text-[var(--muted-foreground)]">Items Subtotal</span>
              <span className="text-[var(--foreground)] font-medium">{formatCurrency(po.subtotal)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Additional Costs */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Costs</CardTitle>
          </CardHeader>
          <CardContent>
            <AdditionalCostsSection
              costs={[
                { id: 1, description: 'Shipping', amount: Number(po.shippingCost || 0) },
                { id: 2, description: 'Tax', amount: Number(po.tax || 0) },
                ...(po.otherCosts && Number(po.otherCosts) > 0
                  ? [{ id: 3, description: 'Other Costs', amount: Number(po.otherCosts) }]
                  : []),
              ]}
              onAdd={() => {
                // TODO: Add new cost via API
                console.log('Add new cost')
              }}
              onUpdate={async (id, field, value) => {
                const updateMap: Record<number, string> = {
                  1: 'shippingCost',
                  2: 'tax',
                  3: 'otherCosts',
                }
                const fieldName = updateMap[id]
                if (fieldName) {
                  await handleFieldUpdate(fieldName, value)
                }
              }}
              onDelete={(id) => {
                const deleteMap: Record<number, string> = {
                  1: 'shippingCost',
                  2: 'tax',
                  3: 'otherCosts',
                }
                const fieldName = deleteMap[id]
                if (fieldName) {
                  handleFieldUpdate(fieldName, 0)
                }
              }}
            />
          </CardContent>
        </Card>

        {/* Grand Total */}
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <span className="text-[var(--foreground)] font-semibold text-lg">Grand Total</span>
              <span className="text-[var(--foreground)] font-bold text-2xl">{formatCurrency(po.total)}</span>
            </div>
          </CardContent>
        </Card>

        {/* SKU Search Modal */}
        <SKUSearchModal
          isOpen={showSKUSearch}
          onClose={() => setShowSKUSearch(false)}
          onSelect={handleAddItem}
        />

        {/* Import Modal */}
        <ImportModal
          isOpen={showImport}
          onClose={() => setShowImport(false)}
          onImport={async (items) => {
            // Add all imported items
            for (const item of items) {
              try {
                const res = await fetch(`/api/purchase-orders/${poId}/items`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    masterSku: item.sku,
                    quantityOrdered: item.quantity,
                    unitCost: item.unitCost || 0,
                    lineTotal: item.quantity * (item.unitCost || 0),
                  }),
                })
                if (!res.ok) {
                  console.error('Failed to import item:', item.sku)
                }
              } catch (error) {
                console.error('Error importing item:', error)
              }
            }
            await fetchPO()
          }}
        />
      </div>

      {/* Edit Costs Modal */}
      <Modal
        isOpen={showEditCosts}
        onClose={() => setShowEditCosts(false)}
        title="Edit Costs"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Shipping Cost</label>
            <input
              type="number"
              step="0.01"
              value={costsForm.shippingCost}
              onChange={(e) => setCostsForm({ ...costsForm, shippingCost: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Tax</label>
            <input
              type="number"
              step="0.01"
              value={costsForm.tax}
              onChange={(e) => setCostsForm({ ...costsForm, tax: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Other Costs</label>
            <input
              type="number"
              step="0.01"
              value={costsForm.otherCosts}
              onChange={(e) => setCostsForm({ ...costsForm, otherCosts: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
        title="Edit Date Trackers"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
              Created Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={datesForm.createdDate}
              onChange={(e) => setDatesForm({ ...datesForm, createdDate: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500"
              required
            />
            <p className="text-xs text-[var(--muted-foreground)] mt-1">The date the PO was created</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Confirmed Date</label>
            <input
              type="date"
              value={datesForm.confirmedDate}
              onChange={(e) => setDatesForm({ ...datesForm, confirmedDate: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <p className="text-xs text-[var(--muted-foreground)] mt-1">The date the supplier confirmed the order</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Shipped Date</label>
            <input
              type="date"
              value={datesForm.actualShipDate}
              onChange={(e) => setDatesForm({ ...datesForm, actualShipDate: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <p className="text-xs text-[var(--muted-foreground)] mt-1">The date the order was shipped</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Arrived Date</label>
            <input
              type="date"
              value={datesForm.actualArrivalDate}
              onChange={(e) => setDatesForm({ ...datesForm, actualArrivalDate: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <p className="text-xs text-[var(--muted-foreground)] mt-1">The date the order arrived at your warehouse</p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowEditDates(false)}>Cancel</Button>
          <Button variant="primary" onClick={saveDates} disabled={!datesForm.createdDate}>Save Dates</Button>
        </ModalFooter>
      </Modal>

      {/* Email Composer Modal */}
      <EmailComposerModal
        isOpen={showSendEmail}
        onClose={() => setShowSendEmail(false)}
        po={po}
        onSend={async (emailData) => {
          // TODO: Send email via API
          console.log('Send email:', emailData)
          // For now, open mailto link (encode all user-controlled values)
          const params = new URLSearchParams()
          if (emailData.cc) params.set('cc', emailData.cc)
          params.set('subject', emailData.subject)
          params.set('body', emailData.body)
          const mailtoLink = `mailto:${encodeURIComponent(emailData.to)}?${params.toString()}`
          window.location.href = mailtoLink
        }}
      />


      {/* Receive Items Modal */}
      <Modal
        isOpen={showReceive}
        onClose={() => {
          setShowReceive(false)
          setReceiveItems({})
        }}
        title="Receive Items"
        size="lg"
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {po.items.map((item) => {
            const remaining = item.quantityOrdered - item.quantityReceived - item.quantityDamaged - (item.quantityBackordered || 0)
            const current = receiveItems[item.id] || { received: 0, damaged: 0, backorder: 0 }
            
            return (
              <div key={item.id} className="p-4 bg-[var(--card)]/50 rounded-lg border border-[var(--border)]/50 hover:border-[var(--border)] transition-colors">
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-medium text-[var(--foreground)] text-sm mb-1">{item.masterSku}</p>
                      <p className="text-sm text-[var(--muted-foreground)] line-clamp-2">{item.product?.title || 'Unknown Product'}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xs text-[var(--muted-foreground)] space-y-1">
                        <div>Ordered: <span className="text-[var(--foreground)] font-medium">{item.quantityOrdered}</span></div>
                        <div>Received: <span className="text-emerald-400 font-medium">{item.quantityReceived}</span></div>
                        <div>Remaining: <span className="text-amber-400 font-medium">{remaining}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--foreground)] mb-2">Received</label>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      value={current.received}
                      onChange={(e) => setReceiveItems({
                        ...receiveItems,
                        [item.id]: { ...current, received: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--foreground)] mb-2">Damaged</label>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      value={current.damaged}
                      onChange={(e) => setReceiveItems({
                        ...receiveItems,
                        [item.id]: { ...current, damaged: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--foreground)] mb-2">Backorder</label>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      value={current.backorder}
                      onChange={(e) => setReceiveItems({
                        ...receiveItems,
                        [item.id]: { ...current, backorder: parseInt(e.target.value) || 0 }
                      })}
                      className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => {
            setShowReceive(false)
            setReceiveItems({})
          }}>
            Cancel
          </Button>
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
          <p className="text-[var(--muted-foreground)] text-sm">
            Upload a CSV or Excel file with updated item costs, quantities, or other changes.
          </p>
          <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-8 text-center">
            <FileSpreadsheet className="w-12 h-12 mx-auto text-[var(--muted-foreground)] mb-4" />
            <p className="text-[var(--muted-foreground)] mb-2">Drop file here or click to browse</p>
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
        <p className="text-[var(--foreground)] mb-4">
          Are you sure you want to delete this purchase order? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={deletePO}>Delete</Button>
        </ModalFooter>
      </Modal>

      {/* Received Quantity Options Modal */}
      {showReceivedOptions && po && (() => {
        const item = po.items.find(i => i.id === showReceivedOptions.itemId)
        if (!item) return null
        
        const difference = showReceivedOptions.difference
        
        return (
          <Modal
            isOpen={!!showReceivedOptions}
            onClose={() => {
              setShowReceivedOptions(null)
              setEditingReceived(null)
            }}
            title={`Handle Shortfall for ${item.masterSku}`}
          >
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm text-[var(--foreground)] mb-2">
                  <strong>Ordered:</strong> {item.quantityOrdered} | <strong>Received:</strong> {receivedValue}
                </p>
                <p className="text-sm text-amber-400 font-medium">
                  Shortfall: {difference} units
                </p>
              </div>
              
              <p className="text-sm text-[var(--muted-foreground)]">
                How would you like to handle the {difference} unit{difference !== 1 ? 's' : ''} that weren't received?
              </p>
              
              <div className="space-y-3">
                <Button
                  variant="primary"
                  className="w-full justify-start"
                  onClick={() => {
                    // Remove from PO: reduce quantityOrdered to match received
                    handleReceivedUpdate(showReceivedOptions.itemId, receivedValue, difference, 0)
                  }}
                  disabled={savingReceive}
                >
                  <Minus className="w-4 h-4 mr-2" />
                  Remove {difference} from PO (change PO amount to {receivedValue})
                </Button>
                
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    // Add to backorder: add difference to backorder and reduce quantityOrdered to match received
                    handleReceivedUpdate(showReceivedOptions.itemId, receivedValue, difference, difference)
                  }}
                  disabled={savingReceive}
                >
                  <PackageCheck className="w-4 h-4 mr-2" />
                  Add {difference} to Backorder (change PO amount to {receivedValue})
                </Button>
              </div>
            </div>
            <ModalFooter>
              <Button variant="ghost" onClick={() => {
                setShowReceivedOptions(null)
                setEditingReceived(null)
              }}>
                Cancel
              </Button>
            </ModalFooter>
          </Modal>
        )
      })()}
    </MainLayout>
  )
}

