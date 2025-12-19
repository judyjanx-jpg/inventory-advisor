'use client'

import { useState, useEffect } from 'react'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import {
  Package,
  DollarSign,
  Truck,
  Tag,
  Layers,
  Image as ImageIcon,
  FileText,
  Settings,
  X,
  ExternalLink,
  RefreshCw,
  ChevronRight,
  List,
  Info,
  Copy,
  Check
} from 'lucide-react'

interface Supplier {
  id: number
  name: string
  contactName?: string
  email?: string
  leadTimeDays?: number
}

interface ProductImage {
  link: string
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
  status: string
  isParent?: boolean
  parentSku?: string
  variationType?: string
  variationValue?: string
  supplierId?: number
  supplierSku?: string
  labelType?: string
  transparencyEnabled?: boolean
  warehouseLocation?: string
  physicalProductGroupId?: string
  createdAt?: string
  supplier?: { id: number; name: string }
  // Listing data
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
}

interface ProductSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  product: Product | null
  suppliers: Supplier[]
  linkedProducts: Product[]
  onSave: (data: any) => Promise<void>
  onLinkProduct: (product: Product) => Promise<void>
  onUnlinkProduct: (product: Product) => Promise<void>
  onSearchLinked: (term: string) => Promise<Product[]>
  saving?: boolean
}

type TabId = 'overview' | 'pricing' | 'amazon' | 'listing' | 'links' | 'support'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Package className="w-4 h-4" /> },
  { id: 'pricing', label: 'Pricing & Supplier', icon: <DollarSign className="w-4 h-4" /> },
  { id: 'amazon', label: 'Amazon & Labels', icon: <Tag className="w-4 h-4" /> },
  { id: 'listing', label: 'Listing Details', icon: <FileText className="w-4 h-4" /> },
  { id: 'links', label: 'Linked Products', icon: <Layers className="w-4 h-4" /> },
  { id: 'support', label: 'Support & Warranty', icon: <Info className="w-4 h-4" /> },
]

export default function ProductSettingsModal({
  isOpen,
  onClose,
  product,
  suppliers,
  linkedProducts,
  onSave,
  onLinkProduct,
  onUnlinkProduct,
  onSearchLinked,
  saving = false,
}: ProductSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [form, setForm] = useState({
    cost: '',
    price: '',
    mapPrice: '',
    msrp: '',
    supplierId: '',
    supplierSku: '',
    fnsku: '',
    upc: '',
    labelType: 'fnsku_only',
    warehouseLocation: '',
    isWarrantied: true,
    careInstructions: '',
    sizingGuide: '',
  })
  const [linkSearchTerm, setLinkSearchTerm] = useState('')
  const [linkSearchResults, setLinkSearchResults] = useState<Product[]>([])
  const [searchingLinks, setSearchingLinks] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Initialize form when product changes
  useEffect(() => {
    if (product) {
      setForm({
        cost: product.cost?.toString() || '',
        price: product.price?.toString() || '',
        mapPrice: product.mapPrice?.toString() || '',
        msrp: product.msrp?.toString() || '',
        supplierId: product.supplierId?.toString() || '',
        supplierSku: product.supplierSku || '',
        fnsku: product.fnsku || '',
        upc: product.upc || '',
        labelType: product.labelType || 'fnsku_only',
        warehouseLocation: product.warehouseLocation || '',
        isWarrantied: product.isWarrantied !== false,
        careInstructions: product.careInstructions || '',
        sizingGuide: product.sizingGuide || '',
      })
      setActiveTab('overview')
      setLinkSearchTerm('')
      setLinkSearchResults([])
    }
  }, [product])

  const handleSave = async () => {
    await onSave({
      cost: form.cost ? parseFloat(form.cost) : 0,
      price: form.price ? parseFloat(form.price) : 0,
      mapPrice: form.mapPrice ? parseFloat(form.mapPrice) : null,
      msrp: form.msrp ? parseFloat(form.msrp) : null,
      supplierId: form.supplierId ? parseInt(form.supplierId) : null,
      supplierSku: form.supplierSku || null,
      fnsku: form.fnsku || null,
      upc: form.upc || null,
      labelType: form.labelType || 'fnsku_only',
      warehouseLocation: form.warehouseLocation || null,
      isWarrantied: form.isWarrantied,
      careInstructions: form.careInstructions || null,
      sizingGuide: form.sizingGuide || null,
    })
  }

  const handleLinkSearch = async (term: string) => {
    setLinkSearchTerm(term)
    if (term.length < 2) {
      setLinkSearchResults([])
      return
    }
    setSearchingLinks(true)
    try {
      const results = await onSearchLinked(term)
      setLinkSearchResults(results)
    } finally {
      setSearchingLinks(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const profitMargin = form.price && form.cost && parseFloat(form.price) > 0
    ? ((parseFloat(form.price) - parseFloat(form.cost)) / parseFloat(form.price) * 100)
    : null

  if (!product) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="5xl"
      showCloseButton={false}
    >
      <div className="flex flex-col lg:flex-row min-h-[600px] -m-4 sm:-m-6">
        {/* Sidebar */}
        <div className="lg:w-64 bg-slate-900/50 border-b lg:border-b-0 lg:border-r border-slate-700/50 p-4">
          {/* Product Header */}
          <div className="flex items-start gap-3 pb-4 mb-4 border-b border-slate-700/50">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.title}
                className="w-16 h-16 rounded-lg object-cover bg-slate-800 flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Package className="w-8 h-8 text-slate-600" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono font-bold text-white text-sm truncate">{product.sku}</p>
              <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                {product.displayName || product.title}
              </p>
              {product.asin && (
                <a
                  href={`https://www.amazon.com/dp/${product.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mt-1"
                >
                  ASIN: {product.asin}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs - Horizontal on mobile, vertical on desktop */}
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-2 px-2 lg:mx-0 lg:px-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.id === 'links' && linkedProducts.length > 0 && (
                  <span className="ml-auto bg-cyan-500/30 text-cyan-300 text-xs px-1.5 py-0.5 rounded">
                    {linkedProducts.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Close button - desktop */}
          <button
            onClick={onClose}
            className="hidden lg:flex items-center gap-2 px-3 py-2 mt-4 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors w-full"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-400" />
                Product Overview
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Product Image */}
                <div className="sm:col-span-2 bg-slate-800/30 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-32 h-32 rounded-lg object-cover bg-slate-800"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-lg bg-slate-800 flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-slate-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white text-lg">{product.displayName || product.title}</h4>
                      {product.displayName && (
                        <p className="text-sm text-slate-400 mt-1 line-clamp-2">{product.title}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          product.status === 'active' 
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : product.status === 'discontinued'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {product.status}
                        </span>
                        {product.brand && (
                          <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">
                            {product.brand}
                          </span>
                        )}
                        {product.category && (
                          <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">
                            {product.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="bg-slate-800/30 rounded-xl p-4">
                  <p className="text-sm text-slate-400 mb-1">Current Price</p>
                  <p className="text-2xl font-bold text-white">${Number(product.price || 0).toFixed(2)}</p>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-4">
                  <p className="text-sm text-slate-400 mb-1">Cost</p>
                  <p className="text-2xl font-bold text-white">${Number(product.cost || 0).toFixed(2)}</p>
                </div>

                {/* Identifiers */}
                <div className="sm:col-span-2 bg-slate-800/30 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Product Identifiers</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Master SKU', value: product.sku },
                      { label: 'ASIN', value: product.asin },
                      { label: 'FNSKU', value: product.fnsku },
                      { label: 'UPC', value: product.upc },
                    ].map((item) => (
                      <div key={item.label}>
                        <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm text-white truncate flex-1">
                            {item.value || '—'}
                          </p>
                          {item.value && (
                            <button
                              onClick={() => copyToClipboard(item.value!, item.label)}
                              className="p-1 text-slate-500 hover:text-white transition-colors"
                              title="Copy"
                            >
                              {copiedField === item.label ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pricing & Supplier Tab */}
          {activeTab === 'pricing' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-cyan-400" />
                Pricing & Supplier
              </h3>

              {/* Pricing Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Cost</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">MAP Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.mapPrice}
                      onChange={(e) => setForm({ ...form, mapPrice: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">MSRP</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.msrp}
                      onChange={(e) => setForm({ ...form, msrp: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Margin Display */}
              {profitMargin !== null && (
                <div className="bg-slate-800/30 rounded-xl p-4 flex justify-between items-center">
                  <span className="text-sm text-slate-400">Profit Margin:</span>
                  <span className={`text-xl font-bold ${
                    profitMargin >= 30 
                      ? 'text-emerald-400' 
                      : profitMargin >= 15 
                        ? 'text-amber-400' 
                        : 'text-red-400'
                  }`}>
                    {Math.round(profitMargin)}%
                  </span>
                </div>
              )}

              {/* Supplier Section */}
              <div className="border-t border-slate-700/50 pt-6">
                <h4 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Supplier Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Supplier</label>
                    <select
                      value={form.supplierId}
                      onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">No supplier assigned</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Supplier SKU</label>
                    <input
                      type="text"
                      value={form.supplierSku}
                      onChange={(e) => setForm({ ...form, supplierSku: e.target.value })}
                      placeholder="Enter supplier's SKU"
                      className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Amazon & Labels Tab */}
          {activeTab === 'amazon' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-cyan-400" />
                Amazon & Labeling
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">FNSKU</label>
                  <input
                    type="text"
                    value={form.fnsku}
                    onChange={(e) => setForm({ ...form, fnsku: e.target.value })}
                    placeholder="e.g., X001ABC123"
                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <p className="text-xs text-slate-500 mt-1">Amazon Fulfillment Network SKU</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">UPC (GTIN)</label>
                  <input
                    type="text"
                    value={form.upc}
                    onChange={(e) => setForm({ ...form, upc: e.target.value })}
                    placeholder="12-14 digit UPC/EAN code"
                    maxLength={14}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <p className="text-xs text-slate-500 mt-1">Required for Transparency codes</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Label Type</label>
                  <select
                    value={form.labelType}
                    onChange={(e) => setForm({ ...form, labelType: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="fnsku_only">FNSKU Only</option>
                    <option value="fnsku_tp">FNSKU + Transparency</option>
                    <option value="tp_only">Transparency Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Warehouse Location</label>
                  <input
                    type="text"
                    value={form.warehouseLocation}
                    onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })}
                    placeholder="e.g., A-12-3, Bin 45"
                    className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">For pick labels during FBA shipments</p>
                </div>
              </div>
            </div>
          )}

          {/* Listing Details Tab */}
          {activeTab === 'listing' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" />
                  Amazon Listing Details
                </h3>
                {product.listingLastSync && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Last synced: {new Date(product.listingLastSync).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Images Gallery */}
              {product.images && Array.isArray(product.images) && product.images.length > 0 ? (
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Product Images</h4>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {(product.images as ProductImage[]).map((img, index) => (
                      <a
                        key={index}
                        href={img.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-lg bg-slate-800 overflow-hidden hover:ring-2 hover:ring-cyan-500 transition-all"
                      >
                        <img
                          src={img.link}
                          alt={`${product.title} - ${img.variant}`}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/30 rounded-xl p-6 text-center">
                  <ImageIcon className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No images synced</p>
                  <p className="text-slate-500 text-xs mt-1">Run a product sync to fetch images from Amazon</p>
                </div>
              )}

              {/* Bullet Points */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3">Bullet Points</h4>
                {product.bulletPoints && Array.isArray(product.bulletPoints) && product.bulletPoints.length > 0 ? (
                  <ul className="space-y-2">
                    {(product.bulletPoints as string[]).map((bullet, index) => (
                      <li key={index} className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-3">
                        <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <span className="text-sm text-slate-300">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="bg-slate-800/30 rounded-xl p-4 text-center">
                    <List className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">No bullet points synced</p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3">Product Description</h4>
                {product.listingDescription ? (
                  <div 
                    className="bg-slate-800/30 rounded-xl p-4 text-sm text-slate-300 prose prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: product.listingDescription }}
                  />
                ) : (
                  <div className="bg-slate-800/30 rounded-xl p-4 text-center">
                    <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">No description synced</p>
                  </div>
                )}
              </div>

              {/* Search Terms */}
              {product.searchTerms && (
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Backend Search Terms</h4>
                  <div className="bg-slate-800/30 rounded-xl p-4">
                    <p className="text-sm text-slate-400 font-mono break-all">{product.searchTerms}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Linked Products Tab */}
          {activeTab === 'links' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                Linked Products
              </h3>

              <div className="bg-slate-800/30 rounded-xl p-4">
                <p className="text-sm text-slate-400">
                  Linked products share the same physical inventory and purchasing velocity, but maintain separate FBA listings.
                </p>
              </div>

              {/* Currently Linked */}
              {linkedProducts.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Currently Linked ({linkedProducts.length})</h4>
                  <div className="space-y-2">
                    {linkedProducts.map((linked) => (
                      <div
                        key={linked.sku}
                        className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {linked.imageUrl ? (
                            <img
                              src={linked.imageUrl}
                              alt={linked.title}
                              className="w-10 h-10 rounded-lg object-cover bg-slate-800"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                              <Package className="w-5 h-5 text-slate-600" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-mono text-white text-sm truncate">{linked.sku}</p>
                            <p className="text-xs text-slate-400 truncate">{linked.title}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onUnlinkProduct(linked)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search & Add Links */}
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3">Add Product Link</h4>
                <input
                  type="text"
                  value={linkSearchTerm}
                  onChange={(e) => handleLinkSearch(e.target.value)}
                  placeholder="Search by SKU or title..."
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                {searchingLinks && (
                  <p className="text-sm text-slate-400 mt-2">Searching...</p>
                )}
                {linkSearchResults.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                    {linkSearchResults.map((result) => (
                      <div
                        key={result.sku}
                        className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-cyan-500/50 cursor-pointer transition-colors"
                        onClick={() => onLinkProduct(result)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {result.imageUrl ? (
                            <img
                              src={result.imageUrl}
                              alt={result.title}
                              className="w-10 h-10 rounded-lg object-cover bg-slate-800"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                              <Package className="w-5 h-5 text-slate-600" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-mono text-white text-sm truncate">{result.sku}</p>
                            <p className="text-xs text-slate-400 truncate">{result.title}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Support & Warranty Tab */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Info className="w-5 h-5 text-cyan-400" />
                Support & Warranty
              </h3>

              <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-white">Warranty Eligible</p>
                  <p className="text-xs text-slate-400">Allow customers to submit warranty claims</p>
                </div>
                <button
                  onClick={() => setForm({ ...form, isWarrantied: !form.isWarrantied })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    form.isWarrantied ? 'bg-cyan-500' : 'bg-slate-600'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    form.isWarrantied ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Care Instructions</label>
                <textarea
                  value={form.careInstructions}
                  onChange={(e) => setForm({ ...form, careInstructions: e.target.value })}
                  placeholder="Enter care instructions for AI support reference..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Sizing Guide</label>
                <textarea
                  value={form.sizingGuide}
                  onChange={(e) => setForm({ ...form, sizingGuide: e.target.value })}
                  placeholder="Enter product-specific sizing information..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer - only show on editable tabs */}
      {activeTab !== 'listing' && activeTab !== 'overview' && (
        <ModalFooter className="border-t border-slate-700/50 mt-0 pt-4 -mx-4 sm:-mx-6 px-4 sm:px-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
        </ModalFooter>
      )}
    </Modal>
  )
}

