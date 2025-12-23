'use client'

import { useEffect, useState, useMemo } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import { formatCurrency } from '@/lib/utils'
import { 
  Package, 
  Plus, 
  Search, 
  Filter,
  Edit,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Layers,
  EyeOff,
  Eye,
  Pencil,
  Check,
  X,
  ArrowUpDown,
  LayoutGrid,
  List,
  Settings,
  Upload
} from 'lucide-react'
import BulkProductUpdate from '@/components/products/BulkProductUpdate'
import ProductSettingsModal from '@/components/products/ProductSettingsModal'

interface SkuMapping {
  id: number
  channel: string
  channelSku: string
  channelProductId?: string
  channelFnsku?: string
  isActive: boolean
}

interface Supplier {
  id: number
  name: string
  contactName?: string
  email?: string
  leadTimeDays?: number
}

interface ProductImage {
  url?: string
  link?: string
  variant: string
  width?: number
  height?: number
}

interface Product {
  sku: string
  title: string
  displayName?: string
  isHidden?: boolean
  asin?: string
  fnsku?: string
  upc?: string
  brand: string
  category?: string
  cost: number
  price: number
  mapPrice?: number
  msrp?: number
  // Additional costs
  packagingCost?: number
  tariffPercent?: number // % of cost
  additionalCosts?: { name: string; amount: number }[]
  // Amazon fee settings
  fbaFeeEstimate?: number
  referralFeePercent?: number
  refundPercent?: number
  adsPercent?: number
  // Status
  status: string
  launchDate?: string
  recreatedFromSku?: string
  discontinuedAt?: string
  isParent?: boolean
  parentSku?: string
  variationType?: string
  variationValue?: string
  supplierId?: number
  supplierSku?: string
  labelType?: string // fnsku_only, fnsku_tp, tp_only
  transparencyEnabled?: boolean
  warehouseLocation?: string
  physicalProductGroupId?: string // For linking products that share physical inventory
  createdAt?: string
  supplier?: { id: number; name: string }
  // Listing data from Amazon
  imageUrl?: string
  images?: ProductImage[]
  bulletPoints?: string[]
  listingDescription?: string
  searchTerms?: string
  listingLastSync?: string
  // Support
  isWarrantied?: boolean
  careInstructions?: string
  sizingGuide?: string
  // Relations
  inventoryLevels?: {
    fbaAvailable: number
    warehouseAvailable: number
  }
  salesVelocity?: {
    velocity7d: number
    velocity30d: number
  }
  skuMappings?: SkuMapping[]
  variations?: Product[]
}

type ViewMode = 'parent' | 'sku'
type SortOption = 'az' | 'za' | 'date' | 'sales-high' | 'sales-low'

const SORT_OPTIONS = [
  { id: 'az', label: 'A → Z' },
  { id: 'za', label: 'Z → A' },
  { id: 'date', label: 'Date Created' },
  { id: 'sales-high', label: 'Sales: High → Low' },
  { id: 'sales-low', label: 'Sales: Low → High' },
]

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [allSkuProducts, setAllSkuProducts] = useState<Product[]>([])
  const [hiddenProducts, setHiddenProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [showHiddenPanel, setShowHiddenPanel] = useState(false)
  
  // View and Sort states
  const [viewMode, setViewMode] = useState<ViewMode>('parent')
  const [sortOption, setSortOption] = useState<SortOption>('az')
  const [showSortMenu, setShowSortMenu] = useState(false)
  
  // Editing states
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState('')
  
  // Modal states
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [showProductSettings, setShowProductSettings] = useState(false)
  const [showBulkUpdate, setShowBulkUpdate] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [linkedProducts, setLinkedProducts] = useState<Product[]>([])
  const [savingLink, setSavingLink] = useState(false)
  const [showWarehouseQtyModal, setShowWarehouseQtyModal] = useState(false)
  const [warehouseQtyConflict, setWarehouseQtyConflict] = useState<{
    product1: Product
    product2: Product
    qty1: number
    qty2: number
    groupId: string
  } | null>(null)
  
  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  
  // Product Settings
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    fetchProducts()
    fetchSuppliers()
  }, [])

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers')
      const data = await res.json()
      setSuppliers(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  const fetchProducts = async () => {
    try {
      // Fetch parent-grouped products
      const res = await fetch('/api/products')
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : [])
      
      // Fetch flat products (all SKUs)
      const flatRes = await fetch('/api/products?flat=true')
      const flatData = await flatRes.json()
      // Filter to only child products (those with parentSku) for SKU view
      const childProducts = (Array.isArray(flatData) ? flatData : []).filter(
        (p: Product) => p.parentSku !== null && p.parentSku !== undefined
      )
      setAllSkuProducts(childProducts)
      
      // Fetch hidden products
      const hiddenRes = await fetch('/api/products?hiddenOnly=true')
      const hiddenData = await hiddenRes.json()
      setHiddenProducts(Array.isArray(hiddenData) ? hiddenData : [])
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate aggregated sales for parent products
  const getAggregatedSales = (product: Product): number => {
    let total = Number(product.salesVelocity?.velocity30d || 0)
    if (product.variations) {
      for (const v of product.variations) {
        total += Number(v.salesVelocity?.velocity30d || 0)
      }
    }
    return total
  }

  // Get sales value based on view mode
  const getSalesValue = (product: Product): number => {
    if (viewMode === 'parent') {
      return getAggregatedSales(product)
    }
    return Number(product.salesVelocity?.velocity30d || 0)
  }

  // Sort and filter logic
  const sortedAndFilteredProducts = useMemo(() => {
    const sourceProducts = viewMode === 'parent' ? products : allSkuProducts
    
    // First filter by search term
    let filtered = sourceProducts.filter(p => {
      const searchLower = searchTerm.toLowerCase()
      const matchesProduct = 
        p.sku.toLowerCase().includes(searchLower) ||
        p.title.toLowerCase().includes(searchLower) ||
        p.displayName?.toLowerCase().includes(searchLower) ||
        p.asin?.toLowerCase().includes(searchLower)
      
      if (viewMode === 'parent') {
        const matchesVariation = p.variations?.some(v => 
          v.sku.toLowerCase().includes(searchLower) ||
          v.title.toLowerCase().includes(searchLower) ||
          v.asin?.toLowerCase().includes(searchLower)
        )
        return matchesProduct || matchesVariation
      }
      
      return matchesProduct
    })

    // Then sort
    const sorted = [...filtered].sort((a, b) => {
      const nameA = (a.displayName || a.sku).toLowerCase()
      const nameB = (b.displayName || b.sku).toLowerCase()
      const salesA = getSalesValue(a)
      const salesB = getSalesValue(b)
      const dateA = new Date(a.createdAt || 0).getTime()
      const dateB = new Date(b.createdAt || 0).getTime()

      switch (sortOption) {
        case 'az':
          return nameA.localeCompare(nameB)
        case 'za':
          return nameB.localeCompare(nameA)
        case 'date':
          return dateB - dateA // Newest first
        case 'sales-high':
          return salesB - salesA
        case 'sales-low':
          return salesA - salesB
        default:
          return 0
      }
    })

    return sorted
  }, [products, allSkuProducts, viewMode, searchTerm, sortOption])

  const toggleExpanded = (sku: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev)
      if (next.has(sku)) {
        next.delete(sku)
      } else {
        next.add(sku)
      }
      return next
    })
  }

  // Product Settings
  const openProductSettings = async (product: Product, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedProduct(product)
    
    // Fetch linked products for this product
    const allProductsRes = await fetch('/api/products?flat=true')
    const allProductsData = await allProductsRes.json()
    const allProducts = Array.isArray(allProductsData) ? allProductsData : []
    
    if (product.physicalProductGroupId) {
      const linked = allProducts.filter((p: Product) => 
        p.physicalProductGroupId === product.physicalProductGroupId && p.sku !== product.sku
      )
      setLinkedProducts(linked)
    } else {
      setLinkedProducts([])
    }
    
    setShowProductSettings(true)
  }

  const saveProductSettings = async (data: any, applyScope: 'this' | 'all' | 'supplier' = 'this', closeAfterSave: boolean = true) => {
    if (!selectedProduct) {
      console.log('No selected product')
      return
    }
    
    const requestBody = {
      sku: selectedProduct.sku,
      applyScope,
      ...data,
    }
    
    console.log('saveProductSettings called with:', requestBody)
    
    setSavingSettings(true)
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      
      const responseData = await res.json()
      console.log('API response:', responseData)
      
      if (res.ok) {
        fetchProducts()
        // Only close modal if explicitly requested (e.g., clicking "Save Changes" button)
        if (closeAfterSave) {
          setShowProductSettings(false)
        }
      } else {
        alert(responseData.error || 'Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSavingSettings(false)
    }
  }
  
  // Search products for linking (used by ProductSettingsModal)
  const searchProductsToLink = async (term: string): Promise<Product[]> => {
    if (term.length < 2 || !selectedProduct) return []
    
    const searchLower = term.toLowerCase()
    const results = allSkuProducts.filter(p => 
      p.sku !== selectedProduct.sku &&
      (p.sku.toLowerCase().includes(searchLower) || 
       p.title.toLowerCase().includes(searchLower)) &&
      (!p.physicalProductGroupId || p.physicalProductGroupId !== selectedProduct.physicalProductGroupId)
    ).slice(0, 10)
    
    return results
  }

  // Link Products functionality
  const linkProduct = async (productToLink: Product) => {
    if (!selectedProduct) return
    
    // Check warehouse quantities before linking
    const inv1 = Array.isArray(selectedProduct.inventoryLevels) 
      ? selectedProduct.inventoryLevels[0] 
      : selectedProduct.inventoryLevels
    const inv2 = Array.isArray(productToLink.inventoryLevels) 
      ? productToLink.inventoryLevels[0] 
      : productToLink.inventoryLevels
    const warehouseQty1 = inv1?.warehouseAvailable || 0
    const warehouseQty2 = inv2?.warehouseAvailable || 0
    
    // If warehouse quantities differ, ask user which one is correct
    if (warehouseQty1 !== warehouseQty2) {
      const groupId = selectedProduct.physicalProductGroupId || `group-${selectedProduct.sku}-${Date.now()}`
      setWarehouseQtyConflict({
        product1: selectedProduct,
        product2: productToLink,
        qty1: warehouseQty1,
        qty2: warehouseQty2,
        groupId,
      })
      setShowWarehouseQtyModal(true)
      return
    }
    
    // If quantities match, proceed with linking
    await performLink(productToLink, selectedProduct.physicalProductGroupId || `group-${selectedProduct.sku}-${Date.now()}`)
  }
  
  const performLink = async (productToLink: Product, groupId: string) => {
    if (!selectedProduct) return
    
    setSavingLink(true)
    try {
      // Link both products to the same group
      const res1 = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: selectedProduct.sku,
          physicalProductGroupId: groupId,
        }),
      })
      
      let errorMessage = ''
      if (!res1.ok) {
        const errorData = await res1.json().catch(() => ({}))
        errorMessage = errorData.error || `Failed to update ${selectedProduct.sku}: ${res1.status} ${res1.statusText}`
        console.error('Error updating first product:', errorData)
      }
      
      const res2 = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: productToLink.sku,
          physicalProductGroupId: groupId,
        }),
      })
      
      if (!res2.ok) {
        const errorData = await res2.json().catch(() => ({}))
        errorMessage = errorMessage ? `${errorMessage}\n` : ''
        errorMessage += errorData.error || `Failed to update ${productToLink.sku}: ${res2.status} ${res2.statusText}`
        console.error('Error updating second product:', errorData)
      }
      
      if (res1.ok && res2.ok) {
        await fetchProducts()
        // Refresh linked products list
        const allProductsRes = await fetch('/api/products?flat=true')
        const allProductsData = await allProductsRes.json()
        const allProducts = Array.isArray(allProductsData) ? allProductsData : []
        const updatedProduct = allProducts.find((p: Product) => p.sku === selectedProduct.sku)
        if (updatedProduct?.physicalProductGroupId) {
          const linked = allProducts.filter((p: Product) => 
            p.physicalProductGroupId === updatedProduct.physicalProductGroupId && p.sku !== selectedProduct.sku
          )
          setLinkedProducts(linked)
        }
        setLinkSearchTerm('')
        setLinkSearchResults([])
      } else {
        alert(`Failed to link products:\n${errorMessage || 'Unknown error'}`)
      }
    } catch (error: any) {
      console.error('Error linking products:', error)
      alert(`Failed to link products: ${error.message || 'Unknown error'}`)
    } finally {
      setSavingLink(false)
    }
  }
  
  const handleWarehouseQtyChoice = async (correctQty: number) => {
    if (!warehouseQtyConflict) return
    
    setSavingLink(true)
    try {
      // Update both products' warehouse quantities to the chosen value
      const updatePromises = [
        fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku: warehouseQtyConflict.product1.sku,
            newQty: correctQty,
            reason: 'Linked products - warehouse quantity sync',
          }),
        }),
        fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku: warehouseQtyConflict.product2.sku,
            newQty: correctQty,
            reason: 'Linked products - warehouse quantity sync',
          }),
        }),
      ]
      
      const results = await Promise.all(updatePromises)
      const errors = results.filter(r => !r.ok)
      
      if (errors.length > 0) {
        const errorMessages = await Promise.all(errors.map(r => r.json().catch(() => ({ error: 'Unknown error' }))))
        throw new Error(errorMessages.map((e: any) => e.error).join(', '))
      }
      
      // Refresh products to get updated inventory
      await fetchProducts()
      
      // Now proceed with linking
      await performLink(warehouseQtyConflict.product2, warehouseQtyConflict.groupId)
      
      setShowWarehouseQtyModal(false)
      setWarehouseQtyConflict(null)
    } catch (error: any) {
      console.error('Error syncing warehouse quantities:', error)
      alert(`Failed to sync warehouse quantities: ${error.message || 'Unknown error'}`)
    } finally {
      setSavingLink(false)
    }
  }

  const unlinkProduct = async (productToUnlink: Product) => {
    if (!selectedProduct) return
    
    setSavingLink(true)
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: productToUnlink.sku,
          physicalProductGroupId: null,
        }),
      })
      
      if (res.ok) {
        await fetchProducts()
        // Remove from linked list
        setLinkedProducts(prev => prev.filter(p => p.sku !== productToUnlink.sku))
      } else {
        alert('Failed to unlink product')
      }
    } catch (error) {
      console.error('Error unlinking product:', error)
      alert('Failed to unlink product')
    } finally {
      setSavingLink(false)
    }
  }

  // Rename functionality
  const startEditing = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingName(product.sku)
    setEditNameValue(product.displayName || '')
  }

  const saveDisplayName = async (sku: string) => {
    try {
      await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, displayName: editNameValue }),
      })
      setEditingName(null)
      fetchProducts()
    } catch (error) {
      console.error('Error saving display name:', error)
    }
  }

  const cancelEditing = () => {
    setEditingName(null)
    setEditNameValue('')
  }

  // Hide/Unhide functionality
  const toggleHidden = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: product.sku, isHidden: !product.isHidden }),
      })
      fetchProducts()
    } catch (error) {
      console.error('Error toggling hidden:', error)
    }
  }

  const getInventoryTotal = (product: Product) => {
    // Handle both array (from Prisma) and object (from transform) cases
    const inv = Array.isArray(product.inventoryLevels) 
      ? product.inventoryLevels[0] 
      : product.inventoryLevels
    const fba = inv?.fbaAvailable || 0
    const warehouse = inv?.warehouseAvailable || 0
    return fba + warehouse
  }

  const getAggregatedInventory = (product: Product) => {
    let total = getInventoryTotal(product)
    if (product.variations) {
      for (const v of product.variations) {
        total += getInventoryTotal(v)
      }
    }
    return total
  }

  const getProfitMargin = (product: Product) => {
    if (!product.cost || !product.price || product.price === 0) return 0
    return Math.round(((product.price - product.cost) / product.price) * 100)
  }

  const getDisplayName = (product: Product) => {
    return product.displayName || product.sku
  }

  const renderProductRow = (product: Product, isVariation = false, parentExpanded = true, isHiddenView = false) => {
    const hasVariations = product.variations && product.variations.length > 0
    const isExpanded = expandedProducts.has(product.sku)
    const isEditingThis = editingName === product.sku
    const isSkuView = viewMode === 'sku'

    // In SKU view, we show individual sales; in parent view, show aggregated
    const displaySales = isSkuView 
      ? Number(product.salesVelocity?.velocity30d || 0)
      : (hasVariations ? getAggregatedSales(product) : Number(product.salesVelocity?.velocity30d || 0))

    return (
      <div key={product.sku} className={isVariation ? 'border-l-2 border-[var(--border)] ml-4' : ''}>
        {/* Product Row */}
        <div 
          className={`flex items-center px-6 py-4 hover:bg-[var(--secondary)]/30 cursor-pointer ${isVariation ? 'bg-[var(--card)]/20' : ''}`}
          onClick={() => hasVariations && !isSkuView && toggleExpanded(product.sku)}
        >
          {/* Expand/Collapse for parent products with variations (only in parent view) */}
          <div className="mr-3 w-5">
            {!isSkuView && hasVariations ? (
              isExpanded ? (
                <ChevronDown className="w-5 h-5 text-cyan-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)]" />
              )
            ) : isVariation ? (
              <div className="w-2 h-2 rounded-full bg-slate-600 ml-1.5" />
            ) : null}
          </div>
          
          {/* SKU/Name as primary identifier */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              {/* Editable display name for parent products */}
              {isEditingThis ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    placeholder={product.sku}
                    className="px-2 py-1 bg-[var(--card)] border border-cyan-500 rounded text-[var(--foreground)] font-mono text-lg focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveDisplayName(product.sku)
                      if (e.key === 'Escape') cancelEditing()
                    }}
                  />
                  <Button variant="ghost" size="sm" onClick={() => saveDisplayName(product.sku)}>
                    <Check className="w-4 h-4 text-emerald-400" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    <X className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              ) : (
                <>
                  <p className="font-mono font-bold text-[var(--foreground)] text-lg">{getDisplayName(product)}</p>
                  {/* Show edit button for parent products or products with Amazon-generated SKUs */}
                  {!isSkuView && (product.isParent || hasVariations || product.sku.startsWith('PARENT-')) && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={(e) => startEditing(product, e)}
                      title="Rename"
                      className="opacity-50 hover:opacity-100"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                  {product.displayName && (
                    <span className="text-xs text-[var(--muted-foreground)] font-mono">({product.sku})</span>
                  )}
                </>
              )}
              {!isSkuView && hasVariations && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {product.variations!.length} variations
                </span>
              )}
              {(isVariation || isSkuView) && product.variationValue && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-[var(--foreground)]">
                  {product.variationType}: {product.variationValue}
                </span>
              )}
              {product.status === 'active' && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                  <span>Active</span>
                  {product.physicalProductGroupId && (() => {
                    const linked = allSkuProducts.filter((p: Product) => 
                      p.physicalProductGroupId === product.physicalProductGroupId && p.sku !== product.sku
                    )
                    if (linked.length > 0) {
                      return (
                        <span className="text-[10px] text-emerald-300/70 font-normal">
                          ({linked.map((p: Product) => p.sku).join(', ')})
                        </span>
                      )
                    }
                    return null
                  })()}
                </span>
              )}
            </div>
            {/* ASIN and Title below in gray */}
            <div className="flex items-center gap-4 mt-1.5">
              {product.asin && (
                <span className="text-sm text-[var(--muted-foreground)] font-mono">
                  ASIN: {product.asin}
                </span>
              )}
              <span className="text-sm text-[var(--muted-foreground)] truncate max-w-md" title={product.title}>
                {product.title}
              </span>
            </div>
            {product.supplier && (
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Supplier: {product.supplier.name}
              </p>
            )}
          </div>

          {/* Stats columns */}
          <div className="flex items-center gap-6 text-right">
            {/* Only show cost/price/margin for actual products, not parent containers */}
            {!hasVariations && !product.isParent ? (
              <>
                <div className="w-20">
                  <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Cost</p>
                  <p className="font-medium text-[var(--foreground)]">{formatCurrency(product.cost)}</p>
                </div>
                <div className="w-20">
                  <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Price</p>
                  <p className="font-medium text-[var(--foreground)]">{formatCurrency(product.price)}</p>
                </div>
                <div className="w-16">
                  <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Margin</p>
                  <p className={`font-medium ${getProfitMargin(product) >= 30 ? 'text-emerald-400' : getProfitMargin(product) >= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                    {getProfitMargin(product)}%
                  </p>
                </div>
              </>
            ) : (
              <div className="w-56" />
            )}
            <div className="w-20">
              <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Stock</p>
              <p className="font-medium text-[var(--foreground)]">
                {!isSkuView && hasVariations ? getAggregatedInventory(product) : getInventoryTotal(product)}
              </p>
            </div>
            <div className="w-24">
              <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">
                {isSkuView ? 'Sales' : (hasVariations ? 'Total Sales' : 'Sales')}
              </p>
              <p className="font-medium text-cyan-400">
                {displaySales.toFixed(1)}/day
              </p>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1">
              {/* Settings button for actual products */}
              {!hasVariations && !product.isParent && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={(e) => openProductSettings(product, e)}
                  title="Product Settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => toggleHidden(product, e)}
                title={isHiddenView ? "Unhide" : "Hide"}
              >
                {isHiddenView ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-[var(--muted-foreground)] hover:text-amber-400" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Variations (children) - only in parent view */}
        {!isSkuView && hasVariations && isExpanded && (
          <div className="bg-[var(--card)]/30 border-t border-[var(--border)]/30">
            {product.variations!.map((variation) => renderProductRow(variation, true, true, isHiddenView))}
          </div>
        )}
      </div>
    )
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
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Products</h1>
            <p className="text-[var(--muted-foreground)] mt-1">Manage your product catalog and variations</p>
          </div>
          <div className="flex gap-3">
            {hiddenProducts.length > 0 && (
              <Button 
                variant="outline" 
                onClick={() => setShowHiddenPanel(!showHiddenPanel)}
                className={showHiddenPanel ? 'border-amber-500 text-amber-400' : ''}
              >
                <EyeOff className="w-4 h-4 mr-2" />
                Hidden ({hiddenProducts.length})
              </Button>
            )}
            <Button variant="outline" onClick={fetchProducts}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => setShowBulkUpdate(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Bulk Update
            </Button>
            <Button onClick={() => setShowAddProduct(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </div>
        </div>

        {/* Hidden Products Panel */}
        {showHiddenPanel && hiddenProducts.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <EyeOff className="w-5 h-5 text-amber-400" />
                  <div>
                    <CardTitle className="text-amber-400">Hidden Products</CardTitle>
                    <CardDescription>These products are hidden from all reports and views</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowHiddenPanel(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-700/50 max-h-80 overflow-y-auto">
                {hiddenProducts.map((product) => renderProductRow(product, false, true, true))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* View Toggle & Search */}
        <Card className="overflow-visible">
          <CardContent className="py-4 overflow-visible">
            <div className="flex gap-4 items-center">
              {/* View Mode Toggle */}
              <div className="flex bg-[var(--secondary)] rounded-lg p-1">
                <button
                  onClick={() => setViewMode('parent')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'parent' 
                      ? 'bg-cyan-600 text-[var(--foreground)]' 
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Group by Parent
                </button>
                <button
                  onClick={() => setViewMode('sku')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'sku' 
                      ? 'bg-cyan-600 text-[var(--foreground)]' 
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <List className="w-4 h-4" />
                  All SKUs
                </button>
              </div>

              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  placeholder="Search by SKU, ASIN, name, or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  style={{ 
                    color: 'var(--foreground)',
                  }}
                />
              </div>

              {/* Sort Dropdown */}
              <div className="relative z-50">
                <Button 
                  variant="outline" 
                  onClick={() => setShowSortMenu(!showSortMenu)}
                >
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  Sort: {SORT_OPTIONS.find(o => o.id === sortOption)?.label}
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
                
                {showSortMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowSortMenu(false)} 
                    />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--secondary)] border border-[var(--border)] rounded-lg shadow-2xl z-50 py-1 overflow-visible">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => {
                            setSortOption(option.id as SortOption)
                            setShowSortMenu(false)
                          }}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-700 ${
                            sortOption === option.id 
                              ? 'text-cyan-400 bg-slate-700/50' 
                              : 'text-[var(--foreground)]'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[var(--secondary)]/50 border border-[var(--border)]/50 rounded-xl p-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              {viewMode === 'parent' ? 'Total Products' : 'Child SKUs'}
            </p>
            <p className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {viewMode === 'parent' ? products.length : allSkuProducts.length}
            </p>
          </div>
          <div className="bg-[var(--secondary)]/50 border border-[var(--border)]/50 rounded-xl p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Parent Items</p>
            <p className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {products.filter(p => p.isParent || (p.variations && p.variations.length > 0)).length}
            </p>
          </div>
          <div className="bg-[var(--secondary)]/50 border border-[var(--border)]/50 rounded-xl p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Variations</p>
            <p className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {products.reduce((sum, p) => sum + (p.variations?.length || 0), 0)}
            </p>
          </div>
          <div className="bg-[var(--secondary)]/50 border border-[var(--border)]/50 rounded-xl p-4">
            <p className="text-sm text-[var(--muted-foreground)]">Hidden</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {hiddenProducts.length}
            </p>
          </div>
        </div>

        {/* Products List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {viewMode === 'parent' ? 'Product Catalog' : 'All Child SKUs'}
                </CardTitle>
                <CardDescription>
                  {sortedAndFilteredProducts.length} {viewMode === 'parent' ? 'products' : 'SKUs'}
                  {viewMode === 'sku' && ' (variations only)'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {sortedAndFilteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-lg text-[var(--muted-foreground)]">
                  {viewMode === 'sku' ? 'No child SKUs found' : 'No products found'}
                </p>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">
                  {viewMode === 'sku' 
                    ? 'Products without parent relationships will not appear here'
                    : 'Add products or sync from Amazon'
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {sortedAndFilteredProducts.map((product) => renderProductRow(product))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Product Modal */}
      <Modal
        isOpen={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        title="Add New Product"
        size="lg"
      >
        <p className="text-[var(--muted-foreground)]">Product creation form coming soon. For now, sync products from Amazon using the Settings page.</p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowAddProduct(false)}>
            Close
          </Button>
          <Button onClick={() => window.location.href = '/settings/amazon'}>
            Go to Amazon Settings
          </Button>
        </ModalFooter>
      </Modal>

      {/* Product Settings Modal */}
      <ProductSettingsModal
        isOpen={showProductSettings}
        onClose={() => setShowProductSettings(false)}
        product={selectedProduct}
        allProducts={allSkuProducts}
        suppliers={suppliers}
        linkedProducts={linkedProducts}
        onSave={saveProductSettings}
        onLinkProduct={linkProduct}
        onUnlinkProduct={unlinkProduct}
        onSearchLinked={searchProductsToLink}
        onSaveMapping={async (channel, channelSku, channelProductId) => {
          if (!selectedProduct) return
          await fetch(`/api/products/${selectedProduct.sku}/mappings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, channelSku, channelProductId }),
          })
          fetchProducts()
        }}
        onDeleteMapping={async (mappingId) => {
          if (!selectedProduct) return
          await fetch(`/api/products/${selectedProduct.sku}/mappings?id=${mappingId}`, {
            method: 'DELETE',
          })
          fetchProducts()
        }}
        saving={savingSettings}
      />

      {/* Bulk Update Modal */}
      <BulkProductUpdate
        isOpen={showBulkUpdate}
        onClose={() => setShowBulkUpdate(false)}
        onComplete={fetchProducts}
        suppliers={suppliers}
        products={[...products, ...hiddenProducts]}
      />

      {/* Warehouse Quantity Conflict Modal */}
      {showWarehouseQtyModal && warehouseQtyConflict && (
        <Modal
          isOpen={showWarehouseQtyModal}
          onClose={() => {
            setShowWarehouseQtyModal(false)
            setWarehouseQtyConflict(null)
          }}
          title="Warehouse Quantity Mismatch"
        >
          <div className="space-y-4">
            <p className="text-[var(--foreground)]">
              The warehouse quantities for these linked products are different. Linked products should share the same warehouse inventory.
            </p>
            <div className="bg-[var(--card)]/50 border border-[var(--border)] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[var(--foreground)]">{warehouseQtyConflict.product1.sku}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">{warehouseQtyConflict.product1.title}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--muted-foreground)]">Warehouse Qty</p>
                  <p className="text-lg font-bold text-[var(--foreground)]">{warehouseQtyConflict.qty1}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[var(--foreground)]">{warehouseQtyConflict.product2.sku}</p>
                  <p className="text-sm text-[var(--muted-foreground)]">{warehouseQtyConflict.product2.title}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--muted-foreground)]">Warehouse Qty</p>
                  <p className="text-lg font-bold text-[var(--foreground)]">{warehouseQtyConflict.qty2}</p>
                </div>
              </div>
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">
              Which warehouse quantity is correct? Both products will be updated to match.
            </p>
            <ModalFooter>
              <Button
                onClick={() => handleWarehouseQtyChoice(warehouseQtyConflict.qty1)}
                disabled={savingLink}
                className="flex-1"
              >
                Use {warehouseQtyConflict.product1.sku} ({warehouseQtyConflict.qty1})
              </Button>
              <Button
                onClick={() => handleWarehouseQtyChoice(warehouseQtyConflict.qty2)}
                disabled={savingLink}
                className="flex-1"
              >
                Use {warehouseQtyConflict.product2.sku} ({warehouseQtyConflict.qty2})
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowWarehouseQtyModal(false)
                  setWarehouseQtyConflict(null)
                }}
                disabled={savingLink}
              >
                Cancel
              </Button>
            </ModalFooter>
          </div>
        </Modal>
      )}
    </MainLayout>
  )
}
