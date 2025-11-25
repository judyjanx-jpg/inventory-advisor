'use client'

import { useEffect, useState } from 'react'
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
  Layers
} from 'lucide-react'

interface SkuMapping {
  id: number
  channel: string
  channelSku: string
  channelProductId?: string
  channelFnsku?: string
  isActive: boolean
}

interface Product {
  sku: string
  title: string
  asin?: string
  fnsku?: string
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
  supplier?: { name: string }
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
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [expandedMappings, setExpandedMappings] = useState<string | null>(null)
  
  // Modal states
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [showSkuMapping, setShowSkuMapping] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  
  // SKU Mapping form
  const [mappingForm, setMappingForm] = useState({
    channel: '',
    channelSku: '',
    channelProductId: '',
    channelFnsku: '',
  })
  const [savingMapping, setSavingMapping] = useState(false)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products')
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }

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

  // Filter products (including search in variations)
  const filteredProducts = products.filter(p => {
    const searchLower = searchTerm.toLowerCase()
    const matchesParent = 
      p.sku.toLowerCase().includes(searchLower) ||
      p.title.toLowerCase().includes(searchLower) ||
      p.asin?.toLowerCase().includes(searchLower)
    
    const matchesVariation = p.variations?.some(v => 
      v.sku.toLowerCase().includes(searchLower) ||
      v.title.toLowerCase().includes(searchLower) ||
      v.asin?.toLowerCase().includes(searchLower)
    )
    
    return matchesParent || matchesVariation
  })

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

  const renderProductRow = (product: Product, isVariation = false, parentExpanded = true) => {
    const hasVariations = product.variations && product.variations.length > 0
    const isExpanded = expandedProducts.has(product.sku)
    const showMappings = expandedMappings === product.sku

    return (
      <div key={product.sku} className={isVariation ? 'border-l-2 border-slate-700 ml-4' : ''}>
        {/* Product Row */}
        <div 
          className={`flex items-center px-6 py-4 hover:bg-slate-800/30 cursor-pointer ${isVariation ? 'bg-slate-900/20' : ''}`}
          onClick={() => hasVariations && toggleExpanded(product.sku)}
        >
          {/* Expand/Collapse for parent products with variations */}
          <div className="mr-3 w-5">
            {hasVariations ? (
              isExpanded ? (
                <ChevronDown className="w-5 h-5 text-cyan-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )
            ) : isVariation ? (
              <div className="w-2 h-2 rounded-full bg-slate-600 ml-1.5" />
            ) : null}
          </div>
          
          {/* SKU as primary identifier */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <p className="font-mono font-bold text-white text-lg">{product.sku}</p>
              {hasVariations && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {product.variations!.length} variations
                </span>
              )}
              {isVariation && product.variationValue && (
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
            <div className="w-20">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Stock</p>
              <p className="font-medium text-white">
                {hasVariations ? getAggregatedInventory(product) : getInventoryTotal(product)}
              </p>
            </div>
            <div className="w-20">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Velocity</p>
              <p className="font-medium text-cyan-400">
                {Number(product.salesVelocity?.velocity30d || 0).toFixed(1)}/day
              </p>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1">
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
              <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} title="Edit">
                <Edit className="w-4 h-4" />
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

        {/* Variations (children) */}
        {hasVariations && isExpanded && (
          <div className="bg-slate-900/30 border-t border-slate-700/30">
            {product.variations!.map((variation) => renderProductRow(variation, true))}
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

        {/* Search and Filter */}
        <Card>
          <CardContent className="py-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by SKU, ASIN, or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <Button variant="outline">
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-sm text-slate-400">Total Products</p>
            <p className="text-2xl font-bold text-white mt-1">{products.length}</p>
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
            <p className="text-sm text-slate-400">Active</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {products.filter(p => p.status === 'active').length}
            </p>
          </div>
        </div>

        {/* Products List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Product Catalog</CardTitle>
                <CardDescription>{filteredProducts.length} products</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-lg text-slate-400">No products found</p>
                <p className="text-sm text-slate-500 mt-1">Add products or sync from Amazon</p>
                <Button className="mt-4" onClick={() => setShowAddProduct(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {filteredProducts.map((product) => renderProductRow(product))}
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
    </MainLayout>
  )
}
