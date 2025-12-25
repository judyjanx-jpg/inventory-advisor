'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  AlertCircle,
  Upload,
  FileSpreadsheet,
  ClipboardCheck
} from 'lucide-react'
import StatusButton from '@/components/purchase-orders/StatusButton'
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
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-slate-500/20 text-[var(--muted-foreground)] border-slate-500/30', icon: FileText },
  sent: { label: 'Sent', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Send },
  confirmed: { label: 'Confirmed', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: CheckCircle },
  shipped: { label: 'Shipped', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Truck },
  partial: { label: 'Partial', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: AlertTriangle },
  received: { label: 'Received', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: PackageCheck },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
}

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [backorders, setBackorders] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // Modal states
  const [showCreatePO, setShowCreatePO] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEditCosts, setShowEditCosts] = useState(false)
  const [showEditDates, setShowEditDates] = useState(false)
  const [showSendEmail, setShowSendEmail] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  
  // Edit costs form
  const [costsForm, setCostsForm] = useState({
    shippingCost: 0,
    tax: 0,
    otherCosts: 0,
  })
  
  // Edit dates form
  const [datesForm, setDatesForm] = useState({
    orderDate: '',
    expectedArrivalDate: '',
  })
  
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
  const [receiveDate, setReceiveDate] = useState<string>('')
  const [savingReceive, setSavingReceive] = useState(false)
  const [selectedReceiveItems, setSelectedReceiveItems] = useState<Set<number>>(new Set())
  
  // Delete options
  const [deductOnDelete, setDeductOnDelete] = useState(true)

  // Searchable SKU dropdown states
  const [skuSearchTerms, setSkuSearchTerms] = useState<Record<number, string>>({})
  const [openSkuDropdown, setOpenSkuDropdown] = useState<number | null>(null)
  const [itemsFileInputRef, setItemsFileInputRef] = useState<HTMLInputElement | null>(null)

  // Pending audit state
  const [pendingAuditCount, setPendingAuditCount] = useState(0)

  /**
   * Fetches all initial data when component mounts
   * Called: Automatically on component mount
   * Updates: Sets purchaseOrders, suppliers, products, backorders, and loading state
   */
  useEffect(() => {
    fetchData()
  }, [])

  // Track which field was last changed to prevent circular updates
  const lastChangedField = useRef<'days' | 'date' | null>(null)

  /**
   * Calculates expected arrival date based on order date and lead time (days)
   * Called: Automatically when orderDate or expectedDays changes in create form
   * Updates: Sets createForm.expectedDate to orderDate + expectedDays
   */
  useEffect(() => {
    // Calculate expected date if:
    // 1. User changed lead time (days), OR
    // 2. Initial load and expectedDate is empty
    const shouldCalculate = lastChangedField.current === 'days' || 
                           (lastChangedField.current === null && !createForm.expectedDate && createForm.expectedDays > 0)
    
    if (shouldCalculate && createForm.orderDate && createForm.expectedDays) {
      const orderDate = new Date(createForm.orderDate)
      orderDate.setDate(orderDate.getDate() + createForm.expectedDays)
      setCreateForm(prev => ({
        ...prev,
        expectedDate: orderDate.toISOString().split('T')[0]
      }))
      if (lastChangedField.current === 'days') {
        lastChangedField.current = null
      }
    }
  }, [createForm.orderDate, createForm.expectedDays, createForm.expectedDate])

  /**
   * Calculates lead time (days) based on order date and expected arrival date
   * Called: Automatically when expectedDate changes in create form (only if user changed the date field)
   * Updates: Sets createForm.expectedDays to the difference between expectedDate and orderDate
   */
  useEffect(() => {
    if (lastChangedField.current === 'date' && createForm.orderDate && createForm.expectedDate) {
      const orderDate = new Date(createForm.orderDate)
      const expectedDate = new Date(createForm.expectedDate)
      const daysDiff = Math.round((expectedDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysDiff >= 0) {
        setCreateForm(prev => ({
          ...prev,
          expectedDays: daysDiff
        }))
      }
      lastChangedField.current = null
    }
  }, [createForm.orderDate, createForm.expectedDate])

  /**
   * Automatically sets lead time days when a supplier is selected
   * Called: Automatically when supplierId changes in create form
   * Updates: Sets createForm.expectedDays from supplier's leadTimeDays if available
   */
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

  /**
   * Fetches all purchase orders, suppliers, products, and backorders from the API
   * Called: On component mount and after successful create/update/delete operations
   * Updates: Sets purchaseOrders, suppliers, products, backorders state, and sets loading to false
   */
  const fetchData = async () => {
    try {
      const [posRes, suppliersRes, productsRes, backordersRes, pendingAuditRes] = await Promise.all([
        fetch('/api/purchase-orders'),
        fetch('/api/suppliers'),
        fetch('/api/products?flat=true'), // Fetch all products including child SKUs
        fetch('/api/backorders'),
        fetch('/api/audit/pending'),
      ])
      
      const posData = await posRes.json()
      const suppliersData = await suppliersRes.json()
      const productsData = await productsRes.json()
      const backordersData = await backordersRes.json().catch(() => [])
      const pendingAuditData = await pendingAuditRes.json().catch(() => ({ count: 0 }))
      
      setPurchaseOrders(Array.isArray(posData) ? posData : [])
      setSuppliers(Array.isArray(suppliersData) ? suppliersData : [])
      setProducts(Array.isArray(productsData) ? productsData : [])
      setBackorders(Array.isArray(backordersData) ? backordersData : [])
      setPendingAuditCount(pendingAuditData.count || 0)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Generates a unique purchase order number in format PO-YYYY-XXX
   * Called: Before creating a new purchase order
   * Updates: Returns a new PO number string (does not update state)
   */
  const generatePONumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `PO-${year}-${random}`
  }

  /**
   * Creates a new purchase order with supplier, items, dates, and costs
   * Called: When user clicks "Create Purchase Order" button in the create modal
   * Updates: Creates new PO in database via API, refreshes data, resets create form, closes modal
   */
  const createPurchaseOrder = async () => {
    if (!createForm.supplierId || createForm.items.length === 0) return
    
    // Validate that all items have valid SKUs
    const invalidItems = createForm.items.filter(item => !item.masterSku || item.masterSku.trim() === '')
    if (invalidItems.length > 0) {
      alert('Please select a SKU for all items before creating the purchase order.')
      return
    }
    
    // Validate that all SKUs exist in the products list
    const itemSkus = createForm.items.map(item => item.masterSku)
    const missingSkus = itemSkus.filter(sku => !products.find(p => p.sku === sku))
    if (missingSkus.length > 0) {
      alert(`The following SKUs are not in the system: ${missingSkus.join(', ')}\n\nPlease add these products first or remove them from the purchase order.`)
      return
    }
    
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
        const errorMessage = data.error || 'Failed to create purchase order'
        const missingSkus = data.missingSkus || []
        
        if (missingSkus.length > 0) {
          alert(`Failed to create purchase order:\n\n${errorMessage}\n\nMissing SKUs: ${missingSkus.join(', ')}\n\nPlease add these products to the system first.`)
        } else {
          alert(`Failed to create purchase order: ${errorMessage}`)
        }
      }
    } catch (error) {
      console.error('Error creating PO:', error)
    } finally {
      setSavingPO(false)
    }
  }

  /**
   * Updates the status of a purchase order and automatically sets related dates
   * Called: When user changes PO status via StatusButton component
   * Updates: Updates PO status in database, sets confirmedDate/shippedDate/arrivalDate based on status, refreshes data
   */
  const updatePOStatus = async (po: PurchaseOrder, newStatus: string) => {
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
      
      await fetch(`/api/purchase-orders/${po.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })
      fetchData()
    } catch (error) {
      console.error('Error updating PO:', error)
    }
  }

  /**
   * Opens the edit costs modal and pre-fills form with current PO costs
   * Called: When user clicks to edit costs for a purchase order
   * Updates: Sets selectedPO, pre-fills costsForm with current shipping/tax/other costs, shows edit costs modal
   */
  const openEditCostsModal = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setCostsForm({
      shippingCost: Number(po.shippingCost) || 0,
      tax: Number(po.tax) || 0,
      otherCosts: Number(po.otherCosts) || 0,
    })
    setShowEditCosts(true)
  }

  /**
   * Saves updated shipping, tax, and other costs for a purchase order
   * Called: When user clicks "Save Costs" button in edit costs modal
   * Updates: Updates PO costs in database, recalculates total, refreshes data, closes modal
   */
  const saveCosts = async () => {
    if (!selectedPO) return
    
    try {
      const newSubtotal = selectedPO.subtotal
      const newTotal = newSubtotal + costsForm.shippingCost + costsForm.tax + costsForm.otherCosts
      
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}`, {
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
        fetchData()
        setShowEditCosts(false)
        setSelectedPO(null)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update costs')
      }
    } catch (error) {
      console.error('Error updating costs:', error)
      alert('Failed to update costs')
    }
  }

  /**
   * Opens the edit dates modal and pre-fills form with current PO dates
   * Called: When user clicks to edit dates for a purchase order
   * Updates: Sets selectedPO, pre-fills datesForm with current order date and expected arrival date, shows edit dates modal
   */
  const openEditDatesModal = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setDatesForm({
      orderDate: po.orderDate ? new Date(po.orderDate).toISOString().split('T')[0] : new Date(po.createdDate).toISOString().split('T')[0],
      expectedArrivalDate: po.expectedArrivalDate ? new Date(po.expectedArrivalDate).toISOString().split('T')[0] : '',
    })
    setShowEditDates(true)
  }

  /**
   * Saves updated order date and expected arrival date for a purchase order
   * Called: When user clicks "Save Dates" button in edit dates modal
   * Updates: Updates PO dates in database, refreshes data, closes modal
   */
  const saveDates = async () => {
    if (!selectedPO) return
    
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDate: datesForm.orderDate,
          expectedArrivalDate: datesForm.expectedArrivalDate || null,
        }),
      })
      
      if (res.ok) {
        fetchData()
        setShowEditDates(false)
        setSelectedPO(null)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update dates')
      }
    } catch (error) {
      console.error('Error updating dates:', error)
      alert('Failed to update dates')
    }
  }

  /**
   * Generates an Excel file (.xlsx) with SKU and Quantity columns for the purchase order
   * Called: When sending email to supplier or downloading PO
   * Updates: Creates and downloads Excel file, returns filename (does not update database)
   */
  const generatePOExcel = async (po: PurchaseOrder) => {
    const XLSX = await import('xlsx')
    
    // Create worksheet data
    const worksheetData = [
      ['SKU', 'Quantity'],
      ...po.items.map(item => [item.masterSku, item.quantityOrdered]),
    ]
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(worksheetData)
    
    // Set column widths
    ws['!cols'] = [{ wch: 20 }, { wch: 10 }]
    
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Order')
    
    // Generate file
    const fileName = `PO-${po.poNumber}-${po.supplier.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`
    XLSX.writeFile(wb, fileName)
    
    return fileName
  }

  /**
   * Opens the send email modal for a purchase order
   * Called: When user clicks to send email to supplier
   * Updates: Sets selectedPO and shows send email modal
   */
  const openSendEmailModal = async (po: PurchaseOrder) => {
    setSelectedPO(po)
    setShowSendEmail(true)
  }

  /**
   * Generates Excel file and opens email client with pre-filled message to supplier
   * Called: When user clicks "Open Email Client" button in send email modal
   * Updates: Downloads Excel file, opens mailto link, optionally updates PO status to "sent", closes modal
   */
  const sendEmailToSupplier = async (markAsSent: boolean) => {
    if (!selectedPO) return
    
    try {
      // Generate Excel file
      const fileName = await generatePOExcel(selectedPO)
      
      // Get supplier email
      const supplier = suppliers.find(s => s.id === selectedPO.supplier.id)
      const supplierEmail = supplier?.email || supplier?.contactEmail || ''
      
      // Create email subject and body
      const subject = encodeURIComponent(`Purchase Order ${selectedPO.poNumber}`)
      const body = encodeURIComponent(
        `Dear ${selectedPO.supplier.name},\n\n` +
        `Please find attached the purchase order ${selectedPO.poNumber}.\n\n` +
        `Order Date: ${formatDate(new Date(selectedPO.orderDate || selectedPO.createdDate))}\n` +
        `Expected Arrival: ${selectedPO.expectedArrivalDate ? formatDate(new Date(selectedPO.expectedArrivalDate)) : 'TBD'}\n\n` +
        `Items:\n${selectedPO.items.map(item => `- ${item.masterSku}: ${item.quantityOrdered} units`).join('\n')}\n\n` +
        `Total: ${formatCurrency(selectedPO.total)}\n\n` +
        `Please confirm receipt and expected delivery date.\n\n` +
        `Thank you,\n` +
        `Inventory Advisor`
      )
      
      // Open email client (mailto link)
      const mailtoLink = `mailto:${supplierEmail}?subject=${subject}&body=${body}`
      window.open(mailtoLink)
      
      // If mark as sent is checked, update status
      if (markAsSent) {
        await updatePOStatus(selectedPO, 'sent')
      }
      
      setShowSendEmail(false)
      setSelectedPO(null)
    } catch (error) {
      console.error('Error sending email:', error)
      alert('Failed to generate email. Please check your email client.')
    }
  }

  /**
   * Deletes a purchase order with optional inventory deduction
   * Called: When user confirms deletion in delete confirmation modal
   * Updates: Deletes PO from database, optionally deducts received inventory, refreshes data, closes modal
   */
  const deletePO = async () => {
    if (!selectedPO) return
    
    const hasReceivedItems = selectedPO.status === 'received' || selectedPO.status === 'partial'
    
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deductInventory: hasReceivedItems && deductOnDelete
        }),
      })
      
      if (res.ok) {
        fetchData()
        setShowDeleteConfirm(false)
        setSelectedPO(null)
        setDeductOnDelete(true) // Reset for next time
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete PO')
      }
    } catch (error) {
      console.error('Error deleting PO:', error)
    }
  }

  /**
   * Opens the receive items modal and pre-fills with remaining quantities to receive
   * Called: When user clicks to receive items for a purchase order
   * Updates: Sets selectedPO, initializes receiveItems with remaining quantities, sets receive date to today, shows receive modal
   */
  /**
   * Opens the receive modal for a purchase order
   * Called: When user clicks "Receive" button on a PO
   * Updates: Sets selectedPO, initializes receiveItems, pre-selects items with remaining quantity, opens modal
   */
  const openReceiveModal = (po: PurchaseOrder) => {
    setSelectedPO(po)
    const initialReceive: Record<number, { received: number; damaged: number; backorder: number }> = {}
    const initialSelected = new Set<number>()
    po.items.forEach(item => {
      const remaining = item.quantityOrdered - item.quantityReceived - (item.quantityBackordered || 0)
      initialReceive[item.id] = { 
        received: 0, // Start with 0, user will select items to receive
        damaged: 0,
        backorder: 0
      }
      // Pre-select items that have remaining quantity
      if (remaining > 0) {
        initialSelected.add(item.id)
      }
    })
    setReceiveItems(initialReceive)
    setSelectedReceiveItems(initialSelected)
    setShowReceive(true)
  }

  /**
   * Toggle selection of an item in receive modal
   * Called: When user clicks checkbox on an item
   */
  const toggleReceiveItemSelection = (itemId: number) => {
    const newSelected = new Set(selectedReceiveItems)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedReceiveItems(newSelected)
  }

  /**
   * Select/deselect all items in receive modal
   * Called: When user clicks "Select All" checkbox
   */
  const toggleSelectAllReceive = () => {
    if (!selectedPO) return
    const itemsWithRemaining = selectedPO.items.filter(item => {
      const remaining = item.quantityOrdered - item.quantityReceived - (item.quantityBackordered || 0)
      return remaining > 0
    })
    
    if (selectedReceiveItems.size === itemsWithRemaining.length) {
      // All selected, deselect all
      setSelectedReceiveItems(new Set())
    } else {
      // Select all items with remaining quantity
      setSelectedReceiveItems(new Set(itemsWithRemaining.map(item => item.id)))
    }
  }

  /**
   * Receive all selected items at full quantity
   * Called: When user clicks "Receive Selected" button in receive modal
   * Updates: Sets receiveItems to receive all remaining quantities for selected items
   */
  const receiveAllSelected = () => {
    if (!selectedPO) return
    const newReceiveItems = { ...receiveItems }
    selectedReceiveItems.forEach(itemId => {
      const item = selectedPO.items.find(i => i.id === itemId)
      if (item) {
        const remaining = item.quantityOrdered - item.quantityReceived - (item.quantityBackordered || 0)
        newReceiveItems[itemId] = {
          received: remaining,
          damaged: 0,
          backorder: 0
        }
      }
    })
    setReceiveItems(newReceiveItems)
  }

  /**
   * Saves received items, updates inventory, and creates backorders if needed
   * Called: When user clicks "Confirm Received" button in receive modal
   * Updates: Updates PO item quantities, adds received items to inventory, creates backorders for unfulfilled quantities, refreshes data, closes modal
   */
  const saveReceive = async () => {
    if (!selectedPO) return
    
    // Validate that at least one item has a quantity
    const hasQuantities = Object.values(receiveItems).some(item => 
      item.received > 0 || item.damaged > 0 || item.backorder > 0
    )
    
    if (!hasQuantities) {
      alert('Please enter at least one quantity to receive')
      return
    }
    
    setSavingReceive(true)
    try {
      const res = await fetch(`/api/purchase-orders/${selectedPO.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: receiveItems,
          receivedDate: receiveDate || new Date().toISOString().split('T')[0]
        }),
      })
      
      const data = await res.json()
      
      if (res.ok) {
        // Refresh the data
        await fetchData()
        setShowReceive(false)
        setReceiveItems({})
        setReceiveDate('')
        // Show success message
        if (data.backordersCreated > 0) {
          alert(`Items received successfully! ${data.backordersCreated} backorder(s) created.`)
        } else {
          alert('Items received successfully!')
        }
      } else {
        alert(data.error || 'Failed to receive items')
      }
    } catch (error: any) {
      console.error('Error receiving items:', error)
      alert(`Error receiving items: ${error.message || 'Unknown error'}`)
    } finally {
      setSavingReceive(false)
    }
  }

  /**
   * Adds a new empty item row to the create PO form
   * Called: When user clicks "Add Item" button in create PO modal
   * Updates: Adds new item object to createForm.items array with default values
   */
  const addItemToForm = () => {
    setCreateForm({
      ...createForm,
      items: [...createForm.items, { masterSku: '', quantityOrdered: 1, unitCost: 0 }],
    })
  }

  /**
   * Updates a field value for a specific item in the create PO form
   * Called: When user types/changes SKU, quantity, or unit cost in create PO modal
   * Updates: Updates the specified item field, auto-fills unit cost if SKU matches a product
   */
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

  /**
   * Removes an item from the create PO form and reindexes search terms
   * Called: When user clicks delete button on an item in create PO modal
   * Updates: Removes item from createForm.items array and reindexes skuSearchTerms
   */
  const removeFormItem = (index: number) => {
    const newItems = createForm.items.filter((_, i) => i !== index)
    setCreateForm({ ...createForm, items: newItems })
    // Clean up search terms
    const newSearchTerms = { ...skuSearchTerms }
    delete newSearchTerms[index]
    // Reindex remaining search terms
    const reindexed: Record<number, string> = {}
    Object.keys(newSearchTerms).forEach(key => {
      const oldIdx = parseInt(key)
      if (oldIdx > index) {
        reindexed[oldIdx - 1] = newSearchTerms[oldIdx]
      } else if (oldIdx < index) {
        reindexed[oldIdx] = newSearchTerms[oldIdx]
      }
    })
    setSkuSearchTerms(reindexed)
  }

  /**
   * Handles file upload for bulk adding items to create PO form from Excel/CSV
   * Called: When user selects a file using the upload button in create PO modal
   * Updates: Parses file, extracts SKU/quantity/cost data, adds new items to createForm.items array
   */
  const handleItemsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      // Check if xlsx library is available
      const XLSX = await import('xlsx')
      
      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const data = evt.target?.result
          const workbook = XLSX.read(data, { type: 'binary' })
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
          
          if (json.length < 2) {
            alert('File must have headers and at least one data row')
            return
          }

          const headers = json[0] as string[]
          const rows = json.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''))
          
          // Find column indices
          const skuCol = headers.findIndex(h => 
            h.toLowerCase().includes('sku') || h.toLowerCase().includes('product')
          )
          const qtyCol = headers.findIndex(h => 
            h.toLowerCase().includes('qty') || h.toLowerCase().includes('quantity') || h.toLowerCase().includes('qty')
          )
          const costCol = headers.findIndex(h => 
            h.toLowerCase().includes('cost') || h.toLowerCase().includes('price') || h.toLowerCase().includes('unit')
          )

          if (skuCol === -1) {
            alert('File must have a SKU column')
            return
          }

          // Parse rows and add to form
          const newItems = rows.map(row => {
            const sku = String(row[skuCol] || '').trim()
            const qty = qtyCol >= 0 ? parseInt(String(row[qtyCol] || '1')) : 1
            const cost = costCol >= 0 ? parseFloat(String(row[costCol] || '0')) : 0
            
            // Find product to get default cost if not provided
            const product = products.find(p => p.sku === sku)
            const unitCost = cost > 0 ? cost : (product ? parseFloat(product.cost) || 0 : 0)
            
            return {
              masterSku: sku,
              quantityOrdered: qty || 1,
              unitCost: unitCost
            }
          }).filter(item => item.masterSku) // Only add items with valid SKUs

          // Add to existing items (don't replace)
          setCreateForm({
            ...createForm,
            items: [...createForm.items, ...newItems]
          })

          alert(`Added ${newItems.length} items from file`)
        } catch (error: any) {
          console.error('Error parsing file:', error)
          alert(`Error parsing file: ${error.message}`)
        }
      }
      reader.readAsBinaryString(file)
    } catch (error: any) {
      console.error('Error loading xlsx library:', error)
      alert('Error loading file parser. Please ensure the file is in Excel (.xlsx) or CSV format.')
    }
    
    // Reset file input
    if (e.target) {
      e.target.value = ''
    }
  }

  /**
   * Filters purchase orders based on search term and status filter
   * Called: Automatically whenever purchaseOrders, searchTerm, or statusFilter changes
   * Updates: Returns filtered array of purchase orders (does not update state directly)
   */
  const filteredPOs = purchaseOrders
    .filter(po => statusFilter === 'all' || po.status === statusFilter)
    .filter(po => 
      po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

  /**
   * Calculates the percentage of items received for a purchase order
   * Called: When displaying PO cards in the list to show progress
   * Updates: Returns percentage 0-100 (does not update state)
   */
  const getReceiveProgress = (po: PurchaseOrder) => {
    const totalOrdered = po.items.reduce((sum, item) => sum + item.quantityOrdered, 0)
    const totalReceived = po.items.reduce((sum, item) => sum + item.quantityReceived, 0)
    return totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0
  }

  /**
   * Determines if PO arrived on time, early, or late based on expected vs actual dates
   * Called: When displaying PO details to show arrival status
   * Updates: Returns status object with text and color (does not update state)
   */
  const getArrivalStatus = (po: PurchaseOrder) => {
    if (!po.actualArrivalDate || !po.expectedArrivalDate) return null
    
    const expected = new Date(po.expectedArrivalDate)
    const actual = new Date(po.actualArrivalDate)
    const diffDays = Math.round((actual.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return { text: 'On time', color: 'text-emerald-400' }
    if (diffDays < 0) return { text: `${Math.abs(diffDays)} days early`, color: 'text-cyan-400' }
    return { text: `${diffDays} days late`, color: 'text-red-400' }
  }

  /**
   * Calculates number of days until expected arrival date
   * Called: When displaying PO cards to show countdown
   * Updates: Returns number of days (positive = future, negative = past) or null (does not update state)
   */
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
        {/* Header Section: Displays page title, description, and "Create Purchase Order" button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Purchase Orders</h1>
            <p className="text-[var(--muted-foreground)] mt-1">Manage supplier orders and receiving</p>
          </div>
          <div className="flex items-center gap-3">
            {pendingAuditCount > 0 && (
              <Button 
                variant="outline" 
                onClick={() => router.push('/audit')}
                className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
              >
                <ClipboardCheck className="w-4 h-4 mr-2" />
                Needs Auditing
                <span className="ml-2 px-2 py-0.5 text-xs bg-amber-500/20 rounded-full">
                  {pendingAuditCount}
                </span>
              </Button>
            )}
            <Button onClick={() => setShowCreatePO(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Purchase Order
            </Button>
          </div>
        </div>

        {/* Status Summary Cards Section: Displays clickable cards showing count of POs in each status (draft, sent, confirmed, shipped, received) */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Object.entries(STATUS_CONFIG).slice(0, 5).map(([status, config]) => {
            const count = purchaseOrders.filter(po => po.status === status).length
            const Icon = config.icon
            const isActive = statusFilter === status
            return (
              <div 
                key={status} 
                onClick={() => setStatusFilter(status === statusFilter ? 'all' : status)} 
                className={`cursor-pointer transition-all ${
                  isActive ? 'ring-2 ring-cyan-500' : ''
                }`}
              >
                <Card hover>
                  <CardContent className={`py-4 ${isActive ? 'bg-cyan-500/10' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold text-[var(--foreground)]">{count}</p>
                        <p className="text-sm text-[var(--muted-foreground)]">{config.label}</p>
                      </div>
                      <Icon className={`w-8 h-8 ${config.color.split(' ').find(c => c.startsWith('text-')) || 'text-[var(--muted-foreground)]'}`} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>

        {/* Backorders Alert Section: Displays warning banner if there are items in backorder with link to view backorders */}
        {backorders.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <AlertCircle className="w-6 h-6 text-amber-400" />
                <div className="flex-1">
                  <p className="font-medium text-[var(--foreground)]">{backorders.length} items in backorder</p>
                  <p className="text-sm text-[var(--muted-foreground)]">Items awaiting receipt from previous POs</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.location.href = '/backorders'}>
                  View Backorders
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search and Filters Section: Displays search input for PO number/supplier and status filter dropdown */}
        <Card>
          <CardContent className="py-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  placeholder="Search by PO number or supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
                style={{ colorScheme: 'dark' }}
              >
                <option value="all" style={{ backgroundColor: 'var(--card)', color: 'var(--foreground)' }}>All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                  <option key={status} value={status} style={{ backgroundColor: 'var(--card)', color: 'var(--foreground)' }}>{config.label}</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Orders List Section: Displays all filtered purchase orders as cards with PO number, status, supplier, progress timeline, totals, and actions */}
        <Card>
          <CardHeader>
            <CardTitle>Purchase Orders</CardTitle>
            <CardDescription>{filteredPOs.length} orders</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredPOs.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-[var(--muted-foreground)] mx-auto mb-4" />
                <p className="text-lg text-[var(--muted-foreground)]">No purchase orders found</p>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">Create your first PO to get started</p>
                <Button className="mt-4" onClick={() => setShowCreatePO(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Purchase Order
                </Button>
              </div>
            ) : (
              <div className="space-y-4 p-6">
                {filteredPOs.map((po) => {
                  const statusConfig = STATUS_CONFIG[po.status] || STATUS_CONFIG.draft
                  const progress = getReceiveProgress(po)
                  const daysUntil = getDaysUntilExpected(po)
                  
                  return (
                    <Card 
                      key={po.id}
                      className="hover:border-cyan-500/30 transition-all cursor-pointer"
                      onClick={() => router.push(`/purchase-orders/${po.id}`)}
                    >
                      <CardContent className="p-5">
                        {/* Header Row */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-[var(--foreground)] font-mono text-lg">{po.poNumber}</p>
                            <div onClick={(e) => e.stopPropagation()} className="relative z-10">
                              <StatusButton
                                currentStatus={po.status}
                                onStatusChange={(newStatus) => updatePOStatus(po, newStatus)}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
                            <span>{po.supplier.name}</span>
                            <span>•</span>
                            <span>{po.items.length} items</span>
                          </div>
                        </div>

                        {/* Progress Timeline */}
                        <ProgressTimeline
                          status={po.status}
                          createdDate={po.createdDate}
                          orderDate={po.orderDate}
                          confirmedDate={po.confirmedDate}
                          shippedDate={po.actualShipDate}
                          receivedDate={po.actualArrivalDate}
                          expectedDate={po.expectedArrivalDate}
                          compact={true}
                        />

                        {/* Footer Row */}
                        <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]/50">
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-[var(--muted-foreground)]">
                              {progress}% Received
                            </span>
                            <span className="text-[var(--muted-foreground)]">
                              Total: <span className="text-[var(--foreground)] font-medium">{formatCurrency(po.total)}</span>
                            </span>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
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
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create PO Modal Section: Form for creating a new purchase order with supplier selection, dates, items list, and notes */}
      <Modal
        isOpen={showCreatePO}
        onClose={() => setShowCreatePO(false)}
        title="Create Purchase Order"
        size="xl"
      >
        <div className="space-y-6">
          {/* Supplier Selection Section: Dropdown to select supplier and order date input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Supplier <span className="text-red-400">*</span>
              </label>
              <select
                value={createForm.supplierId}
                onChange={(e) => setCreateForm({ ...createForm, supplierId: e.target.value })}
                className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
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
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Order Date
              </label>
              <input
                type="date"
                value={createForm.orderDate}
                onChange={(e) => setCreateForm({ ...createForm, orderDate: e.target.value })}
                className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Expected Arrival Section: Lead time (days) input and expected arrival date input with auto-calculation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Lead Time (days)
              </label>
              <input
                type="number"
                value={createForm.expectedDays}
                onChange={(e) => {
                  lastChangedField.current = 'days'
                  setCreateForm({ ...createForm, expectedDays: parseInt(e.target.value) || 0 })
                }}
                className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Expected Arrival Date
              </label>
              <input
                type="date"
                value={createForm.expectedDate}
                onChange={(e) => {
                  lastChangedField.current = 'date'
                  setCreateForm({ ...createForm, expectedDate: e.target.value })
                }}
                className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Items Section: List of items with SKU search, quantity, unit cost, line total, and file upload option */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-[var(--foreground)]">
                Items <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => itemsFileInputRef?.click()}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Upload List
                </Button>
                <input
                  ref={(el) => setItemsFileInputRef(el)}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleItemsFileUpload}
                  className="hidden"
                />
                <Button variant="ghost" size="sm" onClick={addItemToForm}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Item
                </Button>
              </div>
            </div>
            
            {createForm.items.length === 0 ? (
              <div className="text-center py-8 bg-[var(--secondary)]/30 rounded-lg border border-dashed border-[var(--border)]">
                <Package className="w-8 h-8 text-[var(--muted-foreground)] mx-auto mb-2" />
                <p className="text-sm text-[var(--muted-foreground)]">No items added yet</p>
                <div className="flex gap-2 justify-center mt-3">
                  <Button variant="ghost" size="sm" onClick={() => itemsFileInputRef?.click()}>
                    <Upload className="w-4 h-4 mr-1" />
                    Upload List
                  </Button>
                  <Button variant="ghost" size="sm" onClick={addItemToForm}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Item
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {createForm.items.map((item, index) => {
                  const searchTerm = skuSearchTerms[index] || ''
                  const filteredProducts = products.filter(p => 
                    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  const isDropdownOpen = openSkuDropdown === index
                  
                  return (
                  <div key={index} className="flex items-center gap-3 p-3 bg-[var(--secondary)]/50 rounded-lg">
                    <div className="flex-1 relative">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search SKU..."
                          value={isDropdownOpen ? searchTerm : (item.masterSku || '')}
                          onChange={(e) => {
                            const value = e.target.value
                            setSkuSearchTerms({ ...skuSearchTerms, [index]: value })
                            setOpenSkuDropdown(index)
                            // Clear selection if typing
                            if (value && item.masterSku) {
                              updateFormItem(index, 'masterSku', '')
                            }
                          }}
                          onFocus={() => {
                            setOpenSkuDropdown(index)
                            if (!skuSearchTerms[index] && item.masterSku) {
                              setSkuSearchTerms({ ...skuSearchTerms, [index]: item.masterSku })
                            }
                          }}
                          onBlur={() => {
                            // Delay to allow clicking on dropdown items
                            setTimeout(() => {
                              setOpenSkuDropdown(null)
                              if (item.masterSku) {
                                setSkuSearchTerms({ ...skuSearchTerms, [index]: '' })
                              }
                            }, 200)
                          }}
                          className="w-full pl-9 pr-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      {isDropdownOpen && filteredProducts.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredProducts.map((product) => (
                            <button
                              key={product.sku}
                              type="button"
                              onClick={() => {
                                updateFormItem(index, 'masterSku', product.sku)
                                setSkuSearchTerms({ ...skuSearchTerms, [index]: '' })
                                setOpenSkuDropdown(null)
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--hover-bg)] focus:bg-[var(--muted)] focus:outline-none"
                            >
                              {product.sku}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      value={item.quantityOrdered}
                      onChange={(e) => updateFormItem(index, 'quantityOrdered', parseInt(e.target.value) || 0)}
                      placeholder="Qty"
                      min="1"
                      className="w-24 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:border-cyan-500"
                    />
                    <div className="relative w-28">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">$</span>
                      <input
                        type="number"
                        value={item.unitCost}
                        onChange={(e) => updateFormItem(index, 'unitCost', parseFloat(e.target.value) || 0)}
                        placeholder="Cost"
                        step="0.01"
                        className="w-full pl-7 pr-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="w-24 text-right">
                      <span className="text-[var(--foreground)] font-medium">
                        {formatCurrency(item.quantityOrdered * item.unitCost)}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFormItem(index)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                  )
                })}
                
                {/* Totals */}
                <div className="flex justify-end pt-3 border-t border-[var(--border)]">
                  <div className="text-right">
                    <p className="text-sm text-[var(--muted-foreground)]">Subtotal</p>
                    <p className="text-xl font-bold text-[var(--foreground)]">
                      {formatCurrency(createForm.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0))}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes Section: Textarea for adding optional notes to the purchase order */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Notes
            </label>
            <textarea
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              placeholder="Add any notes for this order..."
              rows={3}
              className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500 resize-none"
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

      {/* Receive Items Modal Section: Form for receiving items with quantities for good, damaged, and backorder items, plus received date */}
      <Modal
        isOpen={showReceive}
        onClose={() => setShowReceive(false)}
        title="Receive Items"
        description={`Receiving for ${selectedPO?.poNumber}`}
        size="lg"
      >
        {selectedPO && (
          <div className="space-y-4">
            <div className="bg-[var(--secondary)]/50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">Supplier: <span className="text-[var(--foreground)]">{selectedPO.supplier.name}</span></p>
                  {selectedPO.expectedArrivalDate && (
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                      Expected: <span className="text-[var(--foreground)]">{formatDate(new Date(selectedPO.expectedArrivalDate))}</span>
                    </p>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={autoReceiveAll}
                  className="flex items-center gap-2"
                >
                  <PackageCheck className="w-4 h-4" />
                  Auto-Receive All
                </Button>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Received Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
            </div>

            {/* Select All & Receive Selected Actions */}
            {(() => {
              const itemsWithRemaining = selectedPO.items.filter(item => {
                const remaining = item.quantityOrdered - item.quantityReceived - (item.quantityBackordered || 0)
                return remaining > 0
              })
              const allSelected = itemsWithRemaining.length > 0 && selectedReceiveItems.size === itemsWithRemaining.length
              const someSelected = selectedReceiveItems.size > 0
              
              return (
                <div className="flex items-center justify-between p-3 bg-[var(--card)]/50 border border-[var(--border)] rounded-lg">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAllReceive}
                      className="w-5 h-5 rounded border-[var(--border)] bg-[var(--muted)] text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {allSelected ? 'Deselect All' : 'Select All'} ({selectedReceiveItems.size}/{itemsWithRemaining.length})
                    </span>
                  </label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={receiveAllSelected}
                    disabled={!someSelected}
                    className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                  >
                    <PackageCheck className="w-4 h-4 mr-1" />
                    Receive Selected ({selectedReceiveItems.size})
                  </Button>
                </div>
              )
            })()}
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {selectedPO.items.map((item) => {
                const remaining = item.quantityOrdered - item.quantityReceived - (item.quantityBackordered || 0)
                if (remaining <= 0) return null
                const isSelected = selectedReceiveItems.has(item.id)
                
                return (
                  <div 
                    key={item.id} 
                    className={`p-4 rounded-lg transition-all ${
                      isSelected 
                        ? 'bg-cyan-500/10 border border-cyan-500/30' 
                        : 'bg-[var(--secondary)]/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleReceiveItemSelection(item.id)}
                        className="mt-1 w-5 h-5 rounded border-[var(--border)] bg-[var(--muted)] text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-[var(--foreground)]">{item.masterSku}</p>
                            <p className="text-sm text-[var(--muted-foreground)]">{item.product?.title}</p>
                          </div>
                          <div className="text-right text-sm">
                            <p className="text-[var(--muted-foreground)]">Ordered: {item.quantityOrdered}</p>
                            <p className="text-[var(--muted-foreground)]">Already received: {item.quantityReceived}</p>
                            <p className="text-cyan-400 font-medium">Remaining: {remaining}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 ml-8">
                      <div className="flex-1">
                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">Good Qty</label>
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
                          className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">Damaged Qty</label>
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
                          className="w-full px-3 py-2 bg-[var(--card)] border border-red-700/50 rounded-lg text-[var(--foreground)] focus:outline-none focus:border-red-500"
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
                          className="w-full px-3 py-2 bg-[var(--card)] border border-amber-700/50 rounded-lg text-[var(--foreground)] focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                    
                    {(receiveItems[item.id]?.backorder || 0) > 0 && (
                      <p className="text-xs text-amber-400 mt-2 ml-8">
                        ⚠ {receiveItems[item.id]?.backorder} units will be added to backorder for later receipt
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Summary */}
            {(() => {
              const totalToReceive = Object.values(receiveItems).reduce((sum, item) => sum + (item.received || 0), 0)
              const totalDamaged = Object.values(receiveItems).reduce((sum, item) => sum + (item.damaged || 0), 0)
              const totalBackorder = Object.values(receiveItems).reduce((sum, item) => sum + (item.backorder || 0), 0)
              
              if (totalToReceive === 0 && totalDamaged === 0 && totalBackorder === 0) return null
              
              return (
                <div className="p-4 bg-[var(--card)]/50 border border-[var(--border)] rounded-lg">
                  <p className="text-sm font-medium text-[var(--foreground)] mb-2">Summary</p>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-[var(--muted-foreground)]">Good: </span>
                      <span className="text-emerald-400 font-medium">{totalToReceive}</span>
                    </div>
                    {totalDamaged > 0 && (
                      <div>
                        <span className="text-[var(--muted-foreground)]">Damaged: </span>
                        <span className="text-red-400 font-medium">{totalDamaged}</span>
                      </div>
                    )}
                    {totalBackorder > 0 && (
                      <div>
                        <span className="text-[var(--muted-foreground)]">Backorder: </span>
                        <span className="text-amber-400 font-medium">{totalBackorder}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
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

      {/* Edit Dates Modal Section: Form to edit order date and expected arrival date for an existing purchase order */}
      <Modal
        isOpen={showEditDates}
        onClose={() => { setShowEditDates(false); setSelectedPO(null); }}
        title="Edit Purchase Order Dates"
        size="md"
      >
        {selectedPO && (
          <div className="space-y-4">
            <div className="p-4 bg-[var(--card)]/50 rounded-lg">
              <p className="text-sm text-[var(--muted-foreground)] mb-2">PO Number</p>
              <p className="text-[var(--foreground)] font-medium">{selectedPO.poNumber}</p>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Order Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={datesForm.orderDate}
                  onChange={(e) => setDatesForm({ ...datesForm, orderDate: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
                  required
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">The date the order was placed with the supplier</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Expected Arrival Date
                </label>
                <input
                  type="date"
                  value={datesForm.expectedArrivalDate}
                  onChange={(e) => setDatesForm({ ...datesForm, expectedArrivalDate: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Expected delivery date from supplier</p>
              </div>
            </div>
            
            {datesForm.orderDate && datesForm.expectedArrivalDate && (
              <div className="p-4 bg-[var(--card)]/50 rounded-lg border border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted-foreground)]">Lead Time</span>
                  <span className="text-[var(--foreground)] font-medium">
                    {Math.round((new Date(datesForm.expectedArrivalDate).getTime() - new Date(datesForm.orderDate).getTime()) / (1000 * 60 * 60 * 24))} days
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setShowEditDates(false); setSelectedPO(null); }}>
            Cancel
          </Button>
          <Button onClick={saveDates} disabled={!datesForm.orderDate}>
            Save Dates
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Costs Modal Section: Form to edit shipping cost, tax, and other costs for an existing purchase order with total calculation */}
      <Modal
        isOpen={showEditCosts}
        onClose={() => { setShowEditCosts(false); setSelectedPO(null); }}
        title="Edit Purchase Order Costs"
        size="md"
      >
        {selectedPO && (
          <div className="space-y-4">
            <div className="p-4 bg-[var(--card)]/50 rounded-lg">
              <p className="text-sm text-[var(--muted-foreground)] mb-2">PO Number</p>
              <p className="text-[var(--foreground)] font-medium">{selectedPO.poNumber}</p>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Shipping Cost
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costsForm.shippingCost}
                  onChange={(e) => setCostsForm({ ...costsForm, shippingCost: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Tax
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costsForm.tax}
                  onChange={(e) => setCostsForm({ ...costsForm, tax: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Other Costs
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costsForm.otherCosts}
                  onChange={(e) => setCostsForm({ ...costsForm, otherCosts: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
                  placeholder="Additional fees, handling, etc."
                />
              </div>
            </div>
            
            <div className="p-4 bg-[var(--card)]/50 rounded-lg border border-[var(--border)]">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[var(--muted-foreground)]">Subtotal</span>
                <span className="text-[var(--foreground)] font-medium">{formatCurrency(selectedPO.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[var(--muted-foreground)]">Shipping</span>
                <span className="text-[var(--foreground)]">{formatCurrency(costsForm.shippingCost)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[var(--muted-foreground)]">Tax</span>
                <span className="text-[var(--foreground)]">{formatCurrency(costsForm.tax)}</span>
              </div>
              {costsForm.otherCosts > 0 && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[var(--muted-foreground)]">Other Costs</span>
                  <span className="text-[var(--foreground)]">{formatCurrency(costsForm.otherCosts)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-[var(--border)]">
                <span className="text-[var(--foreground)] font-medium">Total</span>
                <span className="text-[var(--foreground)] font-bold text-lg">
                  {formatCurrency(selectedPO.subtotal + costsForm.shippingCost + costsForm.tax + costsForm.otherCosts)}
                </span>
              </div>
            </div>
          </div>
        )}
        
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setShowEditCosts(false); setSelectedPO(null); }}>
            Cancel
          </Button>
          <Button onClick={saveCosts}>
            Save Costs
          </Button>
        </ModalFooter>
      </Modal>

      {/* Send Email Modal Section: Interface to generate Excel file and open email client with pre-filled message to supplier */}
      <Modal
        isOpen={showSendEmail}
        onClose={() => { setShowSendEmail(false); setSelectedPO(null); }}
        title="Send Purchase Order to Supplier"
        size="md"
      >
        {selectedPO && (
          <div className="space-y-4">
            <div className="p-4 bg-[var(--card)]/50 rounded-lg">
              <p className="text-sm text-[var(--muted-foreground)] mb-1">PO Number</p>
              <p className="text-[var(--foreground)] font-medium">{selectedPO.poNumber}</p>
              <p className="text-sm text-[var(--muted-foreground)] mt-2 mb-1">Supplier</p>
              <p className="text-[var(--foreground)]">{selectedPO.supplier.name}</p>
              {(selectedPO.supplier as any).email && (
                <p className="text-sm text-[var(--muted-foreground)] mt-2">{(selectedPO.supplier as any).email}</p>
              )}
            </div>
            
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-400">
                This will:
              </p>
              <ul className="text-sm text-[var(--foreground)] mt-2 space-y-1 list-disc list-inside">
                <li>Generate an Excel file with SKU and Quantity columns</li>
                <li>Open your email client with a pre-filled message</li>
                <li>Allow you to attach the Excel file manually</li>
              </ul>
            </div>
            
            <div className="flex items-center gap-2 p-3 bg-[var(--card)]/50 rounded-lg">
              <input
                type="checkbox"
                id="markAsSent"
                defaultChecked={true}
                className="w-4 h-4 rounded border-[var(--border)] bg-[var(--muted)] text-cyan-500"
              />
              <label htmlFor="markAsSent" className="text-sm text-[var(--foreground)] cursor-pointer">
                Mark purchase order as "Sent" after opening email
              </label>
            </div>
          </div>
        )}
        
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setShowSendEmail(false); setSelectedPO(null); }}>
            Cancel
          </Button>
          <Button onClick={() => {
            const checkbox = document.getElementById('markAsSent') as HTMLInputElement
            sendEmailToSupplier(checkbox?.checked || false)
          }}>
            <Send className="w-4 h-4 mr-2" />
            Open Email Client
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal Section: Confirmation dialog with option to deduct inventory when deleting a received/partial PO */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeductOnDelete(true); }}
        title="Delete Purchase Order"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-[var(--foreground)]">Are you sure you want to delete {selectedPO?.poNumber}?</p>
              <p className="text-sm text-[var(--muted-foreground)] mt-2">This action cannot be undone.</p>
            </div>
          </div>
          
          {/* Show inventory options only if items were received */}
          {(selectedPO?.status === 'received' || selectedPO?.status === 'partial') && (
            <div className="p-4 bg-[var(--card)]/50 border border-[var(--border)] rounded-lg space-y-3">
              <p className="text-sm font-medium text-[var(--foreground)]">What should happen to the received inventory?</p>
              
              <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-[var(--hover-bg)]/50 transition-colors">
                <input
                  type="radio"
                  name="deductOption"
                  checked={deductOnDelete}
                  onChange={() => setDeductOnDelete(true)}
                  className="mt-1 w-4 h-4 text-cyan-500 bg-[var(--muted)] border-[var(--border)] focus:ring-cyan-500"
                />
                <div>
                  <p className="font-medium text-[var(--foreground)]">Deduct from inventory</p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Remove the received quantities from warehouse inventory (use if items are being returned or were never actually received)
                  </p>
                </div>
              </label>
              
              <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-[var(--hover-bg)]/50 transition-colors">
                <input
                  type="radio"
                  name="deductOption"
                  checked={!deductOnDelete}
                  onChange={() => setDeductOnDelete(false)}
                  className="mt-1 w-4 h-4 text-cyan-500 bg-[var(--muted)] border-[var(--border)] focus:ring-cyan-500"
                />
                <div>
                  <p className="font-medium text-[var(--foreground)]">Keep inventory as is</p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Keep the received quantities in inventory (use if items are already in stock and you just want to delete the PO record)
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => { setShowDeleteConfirm(false); setDeductOnDelete(true); }}>
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
