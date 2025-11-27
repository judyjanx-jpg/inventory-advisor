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
  Trash2,
  Link as LinkIcon,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Globe,
  Tag,
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
  DollarSign,
  Truck
} from 'lucide-react'

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
  status: string
  isParent?: boolean
  parentSku?: string
  variationType?: string
  variationValue?: string
  supplierId?: number
  supplierSku?: string
  labelType?: string // fnsku_only, fnsku_tp, tp_only
  transparencyEnabled?: boolean
  warehouseLocation?: string
  createdAt?: string
  supplier?: { id: number; name: string }
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

const CHANNELS = [
  { id: 'amazon_us', name: 'Amazon US', flag: '🇺🇸' },
  { id: 'amazon_uk', name: 'Amazon UK', flag: '🇬🇧' },
  { id: 'amazon_ca', name: 'Amazon CA', flag: '🇨🇦' },
  { id: 'amazon_de', name: 'Amazon DE', flag: '🇩🇪' },
  { id: 'amazon_fr', name: 'Amazon FR', flag: '🇫🇷' },
  { id: 'amazon_es', name: 'Amazon ES', flag: '🇪🇸' },
  { id: 'amazon_it', name: 'Amazon IT', flag: '🇮🇹' },
  { id: 'amazon_au', name: 'Amazon AU', flag: '🇦🇺' },
  { id: 'walmart', name: 'Walmart', flag: '🛒' },
  { id: 'shopify', name: 'Shopify', flag: '🛍️' },
  { id: 'ebay', name: 'eBay', flag: '📦' },
  { id: 'supplier', name: 'Supplier SKU', flag: '🏭' },
]

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [allSkuProducts, setAllSkuProducts] = useState<Product[]>([])
  const [hiddenProducts, setHiddenProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [expandedMappings, setExpandedMappings] = useState<string | null>(null)
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
  const [showSkuMapping, setShowSkuMapping] = useState(false)
  const [showProductSettings, setShowProductSettings] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  
  // Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  
  // SKU Mapping form
  const [mappingForm, setMappingForm] = useState({
    channel: '',
    channelSku: '',
    channelProductId: '',
    channelFnsku: '',
  })
  const [savingMapping, setSavingMapping] = useState(false)
  
  // Product Settings form
  const [settingsForm, setSettingsForm] = useState({
    cost: '',
    price: '',
    supplierId: '',
    supplierSku: '',
    fnsku: '',
    upc: '',
    labelType: 'fnsku_only',
    warehouseLocation: '',
  })
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

  const openSkuMapping = (product: Product, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedProduct(product)
    setMappingForm({
      channel: '',
      channelSku: '',
      channelProductId: '',
      channelFnsku: '',
    })
    setShowSkuMapping(true)
  }

  const saveSkuMapping = async () => {
    if (!selectedProduct || !mappingForm.channel || !mappingForm.channelSku) return
    
    setSavingMapping(true)
    try {
      const res = await fetch(`/api/products/${selectedProduct.sku}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mappingForm),
      })
      
      if (res.ok) {
        fetchProducts()
        setShowSkuMapping(false)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save mapping')
      }
    } catch (error) {
      console.error('Error saving mapping:', error)
    } finally {
      setSavingMapping(false)
    }
  }

  const deleteSkuMapping = async (product: Product, mappingId: number) => {
    if (!confirm('Are you sure you want to delete this SKU mapping?')) return
    
    try {
      await fetch(`/api/products/${product.sku}/mappings?id=${mappingId}`, {
        method: 'DELETE',
      })
      fetchProducts()
    } catch (error) {
      console.error('Error deleting mapping:', error)
    }
  }

  // Product Settings
  const openProductSettings = (product: Product, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedProduct(product)
    setSettingsForm({
      cost: product.cost?.toString() || '',
      price: product.price?.toString() || '',
      supplierId: product.supplierId?.toString() || '',
      supplierSku: product.supplierSku || '',
      fnsku: product.fnsku || '',
      upc: product.upc || '',
      labelType: product.labelType || 'fnsku_only',
      warehouseLocation: product.warehouseLocation || '',
    })
    setShowProductSettings(true)
  }

  const saveProductSettings = async () => {
    if (!selectedProduct) return
    
    setSavingSettings(true)
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: selectedProduct.sku,
          cost: settingsForm.cost ? parseFloat(settingsForm.cost) : 0,
          price: settingsForm.price ? parseFloat(settingsForm.price) : 0,
          supplierId: settingsForm.supplierId ? parseInt(settingsForm.supplierId) : null,
          supplierSku: settingsForm.supplierSku || null,
          fnsku: settingsForm.fnsku || null,
          upc: settingsForm.upc || null,
          labelType: settingsForm.labelType || 'fnsku_only',
          warehouseLocation: settingsForm.warehouseLocation || null,
        }),
      })
      
      if (res.ok) {
        fetchProducts()
        setShowProductSettings(false)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSavingSettings(false)
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

  const getChannelInfo = (channelId: string) => {
    return CHANNELS.find(c => c.id === channelId) || { id: channelId, name: channelId, flag: '🔗' }
  }

  const getInventoryTotal = (product: Product) => {
    const fba = product.inventoryLevels?.fbaAvailable || 0
    const warehouse = product.inventoryLevels?.warehouseAvailable || 0
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
    const showMappings = expandedMappings === product.sku
    const isEditingThis = editingName === product.sku
    const isSkuView = viewMode === 'sku'

    // In SKU view, we show individual sales; in parent view, show aggregated
    const displaySales = isSkuView 
      ? Number(product.salesVelocity?.velocity30d || 0)
      : (hasVariations ? getAggregatedSales(product) : Number(product.salesVelocity?.velocity30d || 0))

    return (
      <div key={product.sku} className={isVariation ? 'border-l-2 border-slate-700 ml-4' : ''}>
        {/* Product Row */}
        <div 
          className={`flex items-center px-6 py-4 hover:bg-slate-800/30 cursor-pointer ${isVariation ? 'bg-slate-900/20' : ''}`}
          onClick={() => hasVariations && !isSkuView && toggleExpanded(product.sku)}
        >
          {/* Expand/Collapse for parent products with variations (only in parent view) */}
          <div className="mr-3 w-5">
            {!isSkuView && hasVariations ? (
              isExpanded ? (
                <ChevronDown className="w-5 h-5 text-cyan-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
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
                    className="px-2 py-1 bg-slate-900 border border-cyan-500 rounded text-white font-mono text-lg focus:outline-none"
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
                  <p className="font-mono font-bold text-white text-lg">{getDisplayName(product)}</p>
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
                    <span className="text-xs text-slate-500 font-mono">({product.sku})</span>
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
                <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-300">
                  {product.variationType}: {product.variationValue}
                </span>
              )}
              {product.status === 'active' && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>
              )}
            </div>
            {/* ASIN and Title below in gray */}
            <div className="flex items-center gap-4 mt-1.5">
              {product.asin && (
                <span className="text-sm text-slate-500 font-mono">
                  ASIN: {product.asin}
                </span>
              )}
              <span className="text-sm text-slate-400 truncate max-w-md" title={product.title}>
                {product.title}
              </span>
            </div>
            {product.supplier && (
              <p className="text-xs text-slate-500 mt-1">
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
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Cost</p>
                  <p className="font-medium text-white">{formatCurrency(product.cost)}</p>
                </div>
                <div className="w-20">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Price</p>
                  <p className="font-medium text-white">{formatCurrency(product.price)}</p>
                </div>
                <div className="w-16">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Margin</p>
                  <p className={`font-medium ${getProfitMargin(product) >= 30 ? 'text-emerald-400' : getProfitMargin(product) >= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                    {getProfitMargin(product)}%
                  </p>
                </div>
              </>
            ) : (
              <div className="w-56" />
            )}
            <div className="w-20">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Stock</p>
              <p className="font-medium text-white">
                {!isSkuView && hasVariations ? getAggregatedInventory(product) : getInventoryTotal(product)}
              </p>
            </div>
            <div className="w-24">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                {isSkuView ? 'Sales' : (hasVariations ? 'Total Sales' : 'Sales')}
              </p>
              <p className="font-medium text-cyan-400">
                {displaySales.toFixed(1)}/day
              </p>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1">
              {/* Only show settings for actual products, not parent containers */}
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
                onClick={(e) => openSkuMapping(product, e)}
                title="SKU Mappings"
              >
                <LinkIcon className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedMappings(showMappings ? null : product.sku)
                }}
                title="View Mappings"
              >
                <Globe className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => toggleHidden(product, e)}
                title={isHiddenView ? "Unhide" : "Hide"}
              >
                {isHiddenView ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-slate-400 hover:text-amber-400" />}
              </Button>
            </div>
          </div>
        </div>

        {/* SKU Mappings Panel */}
        {showMappings && (
          <div className="px-6 py-4 bg-slate-900/50 border-t border-slate-700/50">
            <div className="ml-8">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  Channel SKU Mappings
                </h4>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={(e) => openSkuMapping(product, e)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
              
              {(!product.skuMappings || product.skuMappings.length === 0) ? (
                <div className="text-center py-4 bg-slate-800/30 rounded-lg border border-dashed border-slate-700">
                  <Tag className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                  <p className="text-sm text-slate-400">No channel mappings</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {product.skuMappings.map((mapping) => {
                    const channel = getChannelInfo(mapping.channel)
                    return (
                      <div 
                        key={mapping.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/50"
                      >
                        <span className="text-lg">{channel.flag}</span>
                        <div className="text-sm">
                          <span className="text-white font-mono">{mapping.channelSku}</span>
                          {mapping.channelProductId && (
                            <span className="text-slate-500 ml-2">({mapping.channelProductId})</span>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteSkuMapping(product, mapping.id)}
                          className="ml-1 p-1"
                        >
                          <Trash2 className="w-3 h-3 text-slate-500 hover:text-red-400" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Variations (children) - only in parent view */}
        {!isSkuView && hasVariations && isExpanded && (
          <div className="bg-slate-900/30 border-t border-slate-700/30">
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
            <h1 className="text-3xl font-bold text-white">Products</h1>
            <p className="text-slate-400 mt-1">Manage your product catalog and variations</p>
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
              <div className="flex bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('parent')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'parent' 
                      ? 'bg-cyan-600 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Group by Parent
                </button>
                <button
                  onClick={() => setViewMode('sku')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'sku' 
                      ? 'bg-cyan-600 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <List className="w-4 h-4" />
                  All SKUs
                </button>
              </div>

              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by SKU, ASIN, name, or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
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
                    <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-50 py-1 overflow-visible">
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
                              : 'text-white'
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
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-sm text-slate-400">
              {viewMode === 'parent' ? 'Total Products' : 'Child SKUs'}
            </p>
            <p className="text-2xl font-bold text-white mt-1">
              {viewMode === 'parent' ? products.length : allSkuProducts.length}
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-sm text-slate-400">Parent Items</p>
            <p className="text-2xl font-bold text-white mt-1">
              {products.filter(p => p.isParent || (p.variations && p.variations.length > 0)).length}
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-sm text-slate-400">Variations</p>
            <p className="text-2xl font-bold text-white mt-1">
              {products.reduce((sum, p) => sum + (p.variations?.length || 0), 0)}
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-sm text-slate-400">Hidden</p>
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
                <p className="text-lg text-slate-400">
                  {viewMode === 'sku' ? 'No child SKUs found' : 'No products found'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
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

      {/* SKU Mapping Modal */}
      <Modal
        isOpen={showSkuMapping}
        onClose={() => setShowSkuMapping(false)}
        title="Add SKU Mapping"
        description={`Add a channel mapping for ${selectedProduct?.sku}`}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Channel <span className="text-red-400">*</span>
            </label>
            <select
              value={mappingForm.channel}
              onChange={(e) => setMappingForm({ ...mappingForm, channel: e.target.value })}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">Select a channel...</option>
              {CHANNELS.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.flag} {channel.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Channel SKU <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={mappingForm.channelSku}
              onChange={(e) => setMappingForm({ ...mappingForm, channelSku: e.target.value })}
              placeholder="e.g., MJBC116-UK-FBA"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Product ID (ASIN, Walmart ID, etc.)
            </label>
            <input
              type="text"
              value={mappingForm.channelProductId}
              onChange={(e) => setMappingForm({ ...mappingForm, channelProductId: e.target.value })}
              placeholder="e.g., B08XYZ1234"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              FNSKU (for FBA)
            </label>
            <input
              type="text"
              value={mappingForm.channelFnsku}
              onChange={(e) => setMappingForm({ ...mappingForm, channelFnsku: e.target.value })}
              placeholder="e.g., X001ABC123"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowSkuMapping(false)}>
            Cancel
          </Button>
          <Button 
            onClick={saveSkuMapping} 
            loading={savingMapping}
            disabled={!mappingForm.channel || !mappingForm.channelSku}
          >
            Save Mapping
          </Button>
        </ModalFooter>
      </Modal>

      {/* Add Product Modal */}
      <Modal
        isOpen={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        title="Add New Product"
        size="lg"
      >
        <p className="text-slate-400">Product creation form coming soon. For now, sync products from Amazon using the Settings page.</p>
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
      <Modal
        isOpen={showProductSettings}
        onClose={() => setShowProductSettings(false)}
        title="Product Settings"
        description={selectedProduct ? `${selectedProduct.displayName || selectedProduct.sku}` : ''}
        size="md"
      >
        <div className="space-y-5">
          {/* Product Info Header */}
          {selectedProduct && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <Package className="w-8 h-8 text-cyan-400" />
                <div>
                  <p className="font-mono font-bold text-white">{selectedProduct.sku}</p>
                  <p className="text-sm text-slate-400 truncate max-w-sm">{selectedProduct.title}</p>
                  {selectedProduct.asin && (
                    <p className="text-xs text-slate-500 font-mono">ASIN: {selectedProduct.asin}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Cost & Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Cost
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settingsForm.cost}
                  onChange={(e) => setSettingsForm({ ...settingsForm, cost: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settingsForm.price}
                  onChange={(e) => setSettingsForm({ ...settingsForm, price: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Margin Display */}
          {settingsForm.cost && settingsForm.price && (
            <div className="bg-slate-800/30 rounded-lg p-3 flex justify-between items-center">
              <span className="text-sm text-slate-400">Profit Margin:</span>
              <span className={`font-bold ${
                parseFloat(settingsForm.price) > 0 && 
                ((parseFloat(settingsForm.price) - parseFloat(settingsForm.cost)) / parseFloat(settingsForm.price) * 100) >= 30 
                  ? 'text-emerald-400' 
                  : ((parseFloat(settingsForm.price) - parseFloat(settingsForm.cost)) / parseFloat(settingsForm.price) * 100) >= 15 
                    ? 'text-amber-400' 
                    : 'text-red-400'
              }`}>
                {parseFloat(settingsForm.price) > 0 
                  ? `${Math.round((parseFloat(settingsForm.price) - parseFloat(settingsForm.cost)) / parseFloat(settingsForm.price) * 100)}%`
                  : '—'
                }
              </span>
            </div>
          )}

          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <Truck className="w-4 h-4 inline mr-1" />
              Supplier
            </label>
            <select
              value={settingsForm.supplierId}
              onChange={(e) => setSettingsForm({ ...settingsForm, supplierId: e.target.value })}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">No supplier assigned</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          {/* Supplier SKU */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Supplier SKU
            </label>
            <input
              type="text"
              value={settingsForm.supplierSku}
              onChange={(e) => setSettingsForm({ ...settingsForm, supplierSku: e.target.value })}
              placeholder="Enter supplier's SKU for this product"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700 my-2" />

          {/* Amazon & Labeling */}
          <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Amazon & Labeling</h4>

          {/* FNSKU */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              FNSKU
            </label>
            <input
              type="text"
              value={settingsForm.fnsku}
              onChange={(e) => setSettingsForm({ ...settingsForm, fnsku: e.target.value })}
              placeholder="e.g., X001ABC123"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">Amazon Fulfillment Network SKU - used on FBA labels</p>
          </div>

          {/* UPC */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              UPC (GTIN)
            </label>
            <input
              type="text"
              value={settingsForm.upc}
              onChange={(e) => setSettingsForm({ ...settingsForm, upc: e.target.value })}
              placeholder="12-14 digit UPC/EAN code"
              maxLength={14}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">Required for Transparency codes</p>
          </div>

          {/* Label Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Label Type
            </label>
            <select
              value={settingsForm.labelType}
              onChange={(e) => setSettingsForm({ ...settingsForm, labelType: e.target.value })}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="fnsku_only">FNSKU Only</option>
              <option value="fnsku_tp">FNSKU + Transparency</option>
              <option value="tp_only">Transparency Only (product has FNSKU)</option>
            </select>
          </div>

          {/* Warehouse Location */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Warehouse Location
            </label>
            <input
              type="text"
              value={settingsForm.warehouseLocation}
              onChange={(e) => setSettingsForm({ ...settingsForm, warehouseLocation: e.target.value })}
              placeholder="e.g., A-12-3, Bin 45"
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <p className="text-xs text-slate-500 mt-1">For pick labels during FBA shipments</p>
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowProductSettings(false)}>
            Cancel
          </Button>
          <Button 
            onClick={saveProductSettings} 
            loading={savingSettings}
          >
            Save Settings
          </Button>
        </ModalFooter>
      </Modal>
    </MainLayout>
  )
}
