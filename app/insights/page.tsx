'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import {
  Zap,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Check,
  X,
  Package,
  ShoppingCart,
  ExternalLink,
  Mail,
  Eye,
  DollarSign,
  Truck,
  RotateCcw,
  CheckSquare,
  Square,
  MoreHorizontal,
  FileText,
  Users,
  RefreshCw,
} from 'lucide-react'

interface Insight {
  id: string
  type: 'critical' | 'warning' | 'opportunity' | 'info'
  message: string
  urgency?: number
  sku?: string
  poNumber?: string
  shipmentId?: string
  metadata?: Record<string, any>
}

interface InsightsResponse {
  success: boolean
  insights: Insight[]
  total: number
}

interface Product {
  sku: string
  title: string
  cost: number
  supplierId: number | null
  supplier?: { id: number; name: string }
}

interface Supplier {
  id: number
  name: string
  leadTimeDays: number | null
}

interface PurchaseOrder {
  id: number
  poNumber: string
  status: string
  supplierId: number
  supplier: { name: string }
}

const TYPE_CONFIG = {
  critical: {
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    label: 'Critical',
    labelBg: 'bg-red-500/20',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    label: 'Warning',
    labelBg: 'bg-amber-500/20',
  },
  opportunity: {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    label: 'Opportunity',
    labelBg: 'bg-emerald-500/20',
  },
  info: {
    icon: Lightbulb,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    label: 'Info',
    labelBg: 'bg-cyan-500/20',
  },
}

// Map insight IDs to alert types for determining actions
function getAlertType(insightId: string): string {
  if (insightId.startsWith('stockout-')) return 'stockout'
  if (insightId.startsWith('late-po-')) return 'late_po'
  if (insightId.startsWith('late-shipment-')) return 'late_shipment'
  if (insightId.startsWith('out-of-stock-')) return 'out_of_stock'
  if (insightId.startsWith('sales-spike-')) return 'sales_spike'
  if (insightId.startsWith('sales-drop-')) return 'sales_drop'
  if (insightId.startsWith('return-spike-')) return 'return_spike'
  if (insightId.startsWith('cost-increase-')) return 'cost_increase'
  if (insightId.startsWith('supplier-issue-')) return 'supplier_issue'
  if (insightId.startsWith('reorder-early-')) return 'reorder_early'
  if (insightId.startsWith('pricing-opportunity-')) return 'pricing_opportunity'
  if (insightId.startsWith('yesterday-profit')) return 'yesterday_profit'
  if (insightId.startsWith('top-performer-')) return 'top_performer'
  return 'unknown'
}

// Get detailed info for each alert type
function getAlertDetails(insight: Insight): { title: string; details: string[]; actions: { label: string; icon: any; action: string; primary?: boolean }[] } {
  const alertType = getAlertType(insight.id)
  
  switch (alertType) {
    case 'stockout':
      return {
        title: 'Stockout Risk',
        details: [
          'This item will run out of stock before a new order can arrive.',
          'Lead time: Check supplier for current lead times.',
          'Recommendation: Create a purchase order immediately.',
        ],
        actions: [
          { label: 'Add to PO', icon: ShoppingCart, action: 'add_to_po', primary: true },
          { label: 'View Product', icon: Eye, action: 'view_product' },
        ],
      }
    case 'late_po':
      return {
        title: 'Late Purchase Order',
        details: [
          'This purchase order has passed its expected arrival date.',
          'Contact your supplier to get an updated ETA.',
          'Consider expediting if stock is critical.',
        ],
        actions: [
          { label: 'Contact Supplier', icon: Mail, action: 'contact_supplier', primary: true },
          { label: 'View PO', icon: FileText, action: 'view_po' },
          { label: 'Mark Received', icon: Check, action: 'mark_received' },
        ],
      }
    case 'late_shipment':
      return {
        title: 'Delayed FBA Shipment',
        details: [
          'This FBA shipment is past its estimated arrival date.',
          'Check Amazon Seller Central for updates.',
          'Contact Amazon support if significantly delayed.',
        ],
        actions: [
          { label: 'View Shipment', icon: Truck, action: 'view_shipment', primary: true },
          { label: 'Track Status', icon: ExternalLink, action: 'track_shipment' },
        ],
      }
    case 'out_of_stock':
      return {
        title: 'Out of Stock',
        details: [
          'This item is completely out of stock.',
          'Lost sales are occurring every day.',
          'Priority: Order immediately or expedite existing orders.',
        ],
        actions: [
          { label: 'Add to PO', icon: ShoppingCart, action: 'add_to_po', primary: true },
          { label: 'Ship to FBA', icon: Truck, action: 'ship_to_fba' },
          { label: 'View Product', icon: Eye, action: 'view_product' },
        ],
      }
    case 'sales_spike':
      return {
        title: 'Sales Spike Detected',
        details: [
          'This item is selling significantly faster than normal.',
          'Current velocity may deplete stock sooner than planned.',
          'Consider reordering early to maintain stock levels.',
        ],
        actions: [
          { label: 'Add to PO', icon: ShoppingCart, action: 'add_to_po', primary: true },
          { label: 'View Analytics', icon: TrendingUp, action: 'view_analytics' },
        ],
      }
    case 'sales_drop':
      return {
        title: 'Sales Drop Detected',
        details: [
          'This item is selling significantly slower than normal.',
          'Possible causes: listing issues, competition, seasonality.',
          'Check listing quality and competitor pricing.',
        ],
        actions: [
          { label: 'View Listing', icon: ExternalLink, action: 'view_listing', primary: true },
          { label: 'View Analytics', icon: TrendingDown, action: 'view_analytics' },
          { label: 'Check Competitors', icon: Users, action: 'check_competitors' },
        ],
      }
    case 'return_spike':
      return {
        title: 'High Return Rate',
        details: [
          'This item has an unusually high return rate.',
          'Review customer feedback and return reasons.',
          'Consider quality control or listing accuracy.',
        ],
        actions: [
          { label: 'View Returns', icon: RotateCcw, action: 'view_returns', primary: true },
          { label: 'View Feedback', icon: MessageSquare, action: 'view_feedback' },
        ],
      }
    case 'cost_increase':
      return {
        title: 'Cost Increase',
        details: [
          'Your cost for this item has increased recently.',
          'Review impact on profit margins.',
          'Consider adjusting pricing or finding alternatives.',
        ],
        actions: [
          { label: 'Review Supplier', icon: Users, action: 'view_supplier', primary: true },
          { label: 'Update Cost', icon: DollarSign, action: 'update_cost' },
          { label: 'View Product', icon: Eye, action: 'view_product' },
        ],
      }
    case 'supplier_issue':
      return {
        title: 'Supplier Reliability Issue',
        details: [
          'This supplier has multiple late deliveries recently.',
          'Consider discussing delivery improvements.',
          'May need to find alternative suppliers.',
        ],
        actions: [
          { label: 'Contact Supplier', icon: Mail, action: 'contact_supplier', primary: true },
          { label: 'View PO History', icon: FileText, action: 'view_supplier_pos' },
        ],
      }
    case 'reorder_early':
      return {
        title: 'Reorder Opportunity',
        details: [
          'This item is selling faster than forecasted.',
          'Reordering early prevents potential stockouts.',
          'Consider increasing order quantity.',
        ],
        actions: [
          { label: 'Add to PO', icon: ShoppingCart, action: 'add_to_po', primary: true },
          { label: 'View Forecast', icon: TrendingUp, action: 'view_forecast' },
        ],
      }
    case 'pricing_opportunity':
      return {
        title: 'Pricing Opportunity',
        details: [
          'This item has high margins and growing sales.',
          'Market may support a higher price point.',
          'Test small price increases to optimize profit.',
        ],
        actions: [
          { label: 'Adjust Price', icon: DollarSign, action: 'adjust_price', primary: true },
          { label: 'View Analytics', icon: TrendingUp, action: 'view_analytics' },
        ],
      }
    default:
      return {
        title: 'Insight',
        details: ['Review this insight for potential action.'],
        actions: [],
      }
  }
}

// MessageSquare component for return feedback
const MessageSquare = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
)

export default function InsightsPage() {
  const router = useRouter()
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  // Add to PO Modal State
  const [showAddToPOModal, setShowAddToPOModal] = useState(false)
  const [addToPOItems, setAddToPOItems] = useState<{ sku: string; message: string }[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [existingPOs, setExistingPOs] = useState<PurchaseOrder[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null)
  const [selectedPOId, setSelectedPOId] = useState<number | 'new' | null>(null)
  const [productDetails, setProductDetails] = useState<Record<string, Product>>({})
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({})
  const [addingToPO, setAddingToPO] = useState(false)

  // Bulk action menu
  const [showBulkMenu, setShowBulkMenu] = useState(false)

  useEffect(() => {
    fetchInsights()
  }, [])

  const fetchInsights = async () => {
    try {
      setRefreshing(true)
      const res = await fetch('/api/dashboard/insights?limit=100')
      if (!res.ok) {
        setInsights([])
        return
      }
      const data: InsightsResponse = await res.json()
      if (data.success) {
        setInsights(data.insights || [])
      }
    } catch (error) {
      console.error('Error fetching insights:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    const visibleInsights = insights.filter(i => !dismissedIds.has(i.id))
    if (selectedIds.size === visibleInsights.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleInsights.map(i => i.id)))
    }
  }

  const dismissInsight = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    // Optionally persist to server
    fetch('/api/insights/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insightIds: [id] }),
    }).catch(console.error)
  }

  const dismissSelected = () => {
    const ids = Array.from(selectedIds)
    setDismissedIds(prev => new Set([...prev, ...ids]))
    setSelectedIds(new Set())
    setShowBulkMenu(false)
    // Persist to server
    fetch('/api/insights/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insightIds: ids }),
    }).catch(console.error)
  }

  // Action handlers
  const handleAction = async (action: string, insight: Insight) => {
    switch (action) {
      case 'add_to_po':
        openAddToPOModal([insight])
        break
      case 'view_product':
        if (insight.sku) router.push(`/inventory?sku=${insight.sku}`)
        break
      case 'view_po':
        if (insight.poNumber) router.push(`/purchase-orders`)
        break
      case 'view_shipment':
        if (insight.shipmentId) router.push(`/fba-shipments`)
        break
      case 'view_analytics':
        if (insight.sku) router.push(`/inventory?sku=${insight.sku}`)
        break
      case 'view_listing':
        if (insight.sku) {
          // Open Amazon listing in new tab
          window.open(`https://www.amazon.com/dp/${insight.sku}`, '_blank')
        }
        break
      case 'view_returns':
        router.push('/returns')
        break
      case 'view_supplier':
        if (insight.metadata?.supplierId) {
          router.push(`/suppliers/${insight.metadata.supplierId}`)
        }
        break
      case 'contact_supplier':
        // Could open email or contact modal
        if (insight.metadata?.supplierId) {
          router.push(`/suppliers/${insight.metadata.supplierId}`)
        } else if (insight.poNumber) {
          router.push(`/purchase-orders`)
        }
        break
      case 'ship_to_fba':
        router.push('/fba-shipments/create')
        break
      case 'mark_received':
        if (insight.poNumber) router.push(`/purchase-orders`)
        break
      case 'adjust_price':
        if (insight.sku) router.push(`/inventory?sku=${insight.sku}`)
        break
      case 'view_supplier_pos':
        router.push('/purchase-orders')
        break
      case 'view_forecast':
        if (insight.sku) router.push(`/inventory?sku=${insight.sku}`)
        break
      case 'update_cost':
        if (insight.sku) router.push(`/inventory?sku=${insight.sku}`)
        break
      case 'track_shipment':
        router.push('/fba-shipments')
        break
      case 'check_competitors':
        // Could integrate with competitor tracking
        if (insight.sku) window.open(`https://www.amazon.com/s?k=${insight.sku}`, '_blank')
        break
      default:
        console.log('Unknown action:', action)
    }
  }

  // Add to PO Modal Functions
  const openAddToPOModal = async (insightsToAdd: Insight[]) => {
    const items = insightsToAdd
      .filter(i => i.sku)
      .map(i => ({ sku: i.sku!, message: i.message }))
    
    if (items.length === 0) return

    setAddToPOItems(items)
    setShowAddToPOModal(true)

    // Fetch suppliers and existing draft POs
    try {
      const [suppliersRes, posRes] = await Promise.all([
        fetch('/api/suppliers'),
        fetch('/api/purchase-orders'),
      ])
      
      if (suppliersRes.ok) {
        const suppliersData = await suppliersRes.json()
        setSuppliers(suppliersData)
      }
      
      if (posRes.ok) {
        const posData = await posRes.json()
        // Only show draft/pending POs that can have items added
        const draftPOs = posData.filter((po: PurchaseOrder) => 
          po.status === 'draft' || po.status === 'pending'
        )
        setExistingPOs(draftPOs)
      }

      // Fetch product details for each SKU
      const productDetailsMap: Record<string, Product> = {}
      const quantities: Record<string, number> = {}
      
      for (const item of items) {
        try {
          const productRes = await fetch(`/api/products/${item.sku}`)
          if (productRes.ok) {
            const product = await productRes.json()
            productDetailsMap[item.sku] = product
            quantities[item.sku] = product.recommendedQty || 100 // Default quantity
          }
        } catch (e) {
          console.error(`Failed to fetch product ${item.sku}:`, e)
        }
      }
      
      setProductDetails(productDetailsMap)
      setItemQuantities(quantities)
    } catch (error) {
      console.error('Error loading add to PO data:', error)
    }
  }

  const handleAddToPO = async () => {
    if (!selectedPOId) return

    setAddingToPO(true)
    try {
      if (selectedPOId === 'new') {
        // Create new PO
        if (!selectedSupplierId) {
          alert('Please select a supplier')
          setAddingToPO(false)
          return
        }

        const items = addToPOItems.map(item => ({
          masterSku: item.sku,
          quantityOrdered: itemQuantities[item.sku] || 100,
          unitCost: productDetails[item.sku]?.cost || 0,
        }))

        const subtotal = items.reduce((sum, item) => sum + (item.unitCost * item.quantityOrdered), 0)

        const res = await fetch('/api/purchase-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poNumber: `PO-${Date.now()}`,
            supplierId: selectedSupplierId,
            status: 'draft',
            subtotal,
            total: subtotal,
            items,
          }),
        })

        if (res.ok) {
          const newPO = await res.json()
          setShowAddToPOModal(false)
          router.push(`/purchase-orders/${newPO.id}`)
        } else {
          const error = await res.json()
          alert(error.error || 'Failed to create PO')
        }
      } else {
        // Add to existing PO
        const items = addToPOItems.map(item => ({
          masterSku: item.sku,
          quantityOrdered: itemQuantities[item.sku] || 100,
          unitCost: productDetails[item.sku]?.cost || 0,
        }))

        const res = await fetch(`/api/purchase-orders/${selectedPOId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        })

        if (res.ok) {
          setShowAddToPOModal(false)
          router.push(`/purchase-orders/${selectedPOId}`)
        } else {
          const error = await res.json()
          alert(error.error || 'Failed to add items to PO')
        }
      }
    } catch (error) {
      console.error('Error adding to PO:', error)
      alert('Failed to add items to PO')
    } finally {
      setAddingToPO(false)
    }
  }

  const handleBulkAddToPO = () => {
    const selectedInsights = insights.filter(i => selectedIds.has(i.id) && i.sku)
    if (selectedInsights.length > 0) {
      openAddToPOModal(selectedInsights)
    }
    setShowBulkMenu(false)
  }

  const visibleInsights = insights.filter(i => !dismissedIds.has(i.id))
  const criticalCount = visibleInsights.filter(i => i.type === 'critical').length
  const warningCount = visibleInsights.filter(i => i.type === 'warning').length
  const selectedWithSkus = Array.from(selectedIds).filter(id => 
    insights.find(i => i.id === id)?.sku
  ).length

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Zap className="w-8 h-8 text-cyan-400" />
              <div className="absolute inset-0 blur-lg bg-cyan-400/30" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--foreground)]">AI Insights</h1>
              <p className="text-sm text-[var(--muted-foreground)]">
                {visibleInsights.length} alerts requiring attention
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status badges */}
            <div className="flex items-center gap-2">
              {criticalCount > 0 && (
                <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                  {criticalCount} Critical
                </span>
              )}
              {warningCount > 0 && (
                <span className="px-3 py-1 text-sm font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  {warningCount} Warning
                </span>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={fetchInsights}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Selection toolbar */}
        {selectedIds.size > 0 && (
          <Card className="bg-cyan-500/10 border-cyan-500/30">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--foreground)]">
                  {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-2">
                  {selectedWithSkus > 0 && (
                    <Button size="sm" onClick={handleBulkAddToPO}>
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Add {selectedWithSkus} to PO
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={dismissSelected}>
                    <X className="w-4 h-4 mr-2" />
                    Dismiss Selected
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Select all checkbox */}
        {visibleInsights.length > 0 && (
          <div className="flex items-center gap-2 px-2">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              {selectedIds.size === visibleInsights.length ? (
                <CheckSquare className="w-5 h-5 text-cyan-400" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              Select All
            </button>
          </div>
        )}

        {/* Insights list */}
        <div className="space-y-3">
          {visibleInsights.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">All Clear!</h3>
                <p className="text-[var(--muted-foreground)]">
                  No alerts requiring your attention right now.
                </p>
              </CardContent>
            </Card>
          ) : (
            visibleInsights.map((insight) => {
              const config = TYPE_CONFIG[insight.type]
              const Icon = config.icon
              const isExpanded = expandedIds.has(insight.id)
              const isSelected = selectedIds.has(insight.id)
              const alertDetails = getAlertDetails(insight)

              return (
                <Card
                  key={insight.id}
                  className={`border transition-all duration-200 ${config.border} ${
                    isSelected ? 'ring-2 ring-cyan-500/50' : ''
                  }`}
                >
                  <CardContent className="py-0">
                    {/* Main row */}
                    <div className="flex items-center gap-3 py-4">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelected(insight.id)}
                        className="flex-shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-cyan-400" />
                        ) : (
                          <Square className="w-5 h-5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" />
                        )}
                      </button>

                      {/* Icon */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${config.bg}`}>
                        <Icon className={`w-5 h-5 ${config.color}`} />
                      </div>

                      {/* Message */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.labelBg} ${config.color}`}>
                            {config.label}
                          </span>
                          {insight.sku && (
                            <span className="text-xs text-[var(--muted-foreground)]">
                              SKU: {insight.sku}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--foreground)]">{insight.message}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => toggleExpanded(insight.id)}
                          className={`p-2 rounded-lg hover:bg-[var(--hover-bg)] transition-colors ${config.color}`}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={() => dismissInsight(insight.id)}
                          className="p-2 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                          title="Dismiss"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-[var(--border)] py-4 ml-14 space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-[var(--foreground)] mb-2">
                            {alertDetails.title}
                          </h4>
                          <ul className="space-y-1">
                            {alertDetails.details.map((detail, idx) => (
                              <li key={idx} className="text-sm text-[var(--muted-foreground)] flex items-start gap-2">
                                <span className="text-cyan-400 mt-1">•</span>
                                {detail}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {alertDetails.actions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {alertDetails.actions.map((action) => {
                              const ActionIcon = action.icon
                              return (
                                <Button
                                  key={action.action}
                                  variant={action.primary ? 'primary' : 'secondary'}
                                  size="sm"
                                  onClick={() => handleAction(action.action, insight)}
                                >
                                  <ActionIcon className="w-4 h-4 mr-2" />
                                  {action.label}
                                </Button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      {/* Add to PO Modal */}
      <Modal
        isOpen={showAddToPOModal}
        onClose={() => setShowAddToPOModal(false)}
        title="Add Items to Purchase Order"
        size="lg"
      >
        <div className="space-y-6">
          {/* Items to add */}
          <div>
            <h4 className="text-sm font-medium text-[var(--foreground)] mb-3">Items to Add</h4>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {addToPOItems.map((item) => (
                <div
                  key={item.sku}
                  className="flex items-center gap-4 p-3 bg-[var(--hover-bg)] rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-[var(--foreground)]">{item.sku}</p>
                    <p className="text-sm text-[var(--muted-foreground)] line-clamp-1">
                      {productDetails[item.sku]?.title || 'Loading...'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-[var(--muted-foreground)]">Qty:</label>
                    <input
                      type="number"
                      min="1"
                      value={itemQuantities[item.sku] || 100}
                      onChange={(e) => setItemQuantities(prev => ({
                        ...prev,
                        [item.sku]: parseInt(e.target.value) || 1
                      }))}
                      className="w-24 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm"
                    />
                  </div>
                  {productDetails[item.sku]?.cost && (
                    <span className="text-sm text-[var(--muted-foreground)]">
                      ${productDetails[item.sku].cost.toFixed(2)}/unit
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* PO Selection */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Add to Purchase Order
              </label>
              <select
                value={selectedPOId || ''}
                onChange={(e) => setSelectedPOId(e.target.value === 'new' ? 'new' : parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)]"
              >
                <option value="">Select a PO...</option>
                <option value="new">+ Create New PO</option>
                {existingPOs.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber} - {po.supplier?.name} ({po.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier selection for new PO */}
            {selectedPOId === 'new' && (
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Supplier
                </label>
                <select
                  value={selectedSupplierId || ''}
                  onChange={(e) => setSelectedSupplierId(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)]"
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} {supplier.leadTimeDays ? `(${supplier.leadTimeDays} day lead time)` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Summary */}
          {selectedPOId && (
            <div className="p-4 bg-[var(--hover-bg)] rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted-foreground)]">Total Items:</span>
                <span className="text-[var(--foreground)]">{addToPOItems.length}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-[var(--muted-foreground)]">Total Units:</span>
                <span className="text-[var(--foreground)]">
                  {Object.values(itemQuantities).reduce((a, b) => a + b, 0)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-[var(--muted-foreground)]">Estimated Cost:</span>
                <span className="text-[var(--foreground)] font-medium">
                  ${addToPOItems
                    .reduce((sum, item) => 
                      sum + (itemQuantities[item.sku] || 0) * (productDetails[item.sku]?.cost || 0), 0)
                    .toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAddToPOModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddToPO}
              disabled={!selectedPOId || (selectedPOId === 'new' && !selectedSupplierId) || addingToPO}
            >
              {addingToPO ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : selectedPOId === 'new' ? (
                'Create PO'
              ) : (
                'Add to PO'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </MainLayout>
  )
}

