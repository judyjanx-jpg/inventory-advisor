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
  X,
  ExternalLink,
  RefreshCw,
  ChevronRight,
  List,
  Info,
  Copy,
  Check,
  Plus,
  Trash2,
  Calculator,
  Globe,
  AlertCircle,
  Sparkles,
  Archive,
  RotateCcw,
  Calendar
} from 'lucide-react'

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

interface SkuMapping {
  id: number
  channel: string
  channelSku: string
  channelProductId?: string
  channelFnsku?: string
  isActive: boolean
}

interface AdditionalCost {
  name: string
  amount: number
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
  tariffPercent?: number
  additionalCosts?: AdditionalCost[]
  // Amazon fees
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
  // SKU Mappings
  skuMappings?: SkuMapping[]
}

interface ProductSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  product: Product | null
  allProducts?: Product[] // For recreate linking
  suppliers: Supplier[]
  linkedProducts: Product[]
  onSave: (data: any, applyScope?: 'this' | 'all' | 'supplier') => Promise<void>
  onLinkProduct: (product: Product) => Promise<void>
  onUnlinkProduct: (product: Product) => Promise<void>
  onSearchLinked: (term: string) => Promise<Product[]>
  onSaveMapping?: (channel: string, channelSku: string, channelProductId?: string) => Promise<void>
  onDeleteMapping?: (mappingId: number) => Promise<void>
  saving?: boolean
}

type TabId = 'overview' | 'pricing' | 'amazon' | 'status' | 'listing' | 'skus' | 'links' | 'support'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Package className="w-4 h-4" /> },
  { id: 'pricing', label: 'Pricing & Costs', icon: <DollarSign className="w-4 h-4" /> },
  { id: 'amazon', label: 'Amazon & Labels', icon: <Tag className="w-4 h-4" /> },
  { id: 'status', label: 'Status', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'listing', label: 'Listing Details', icon: <FileText className="w-4 h-4" /> },
  { id: 'skus', label: 'Alternate SKUs', icon: <Globe className="w-4 h-4" /> },
  { id: 'links', label: 'Linked Products', icon: <Layers className="w-4 h-4" /> },
  { id: 'support', label: 'Support & Warranty', icon: <Info className="w-4 h-4" /> },
]

const CHANNELS = [
  { id: 'amazon_us', name: 'Amazon US', flag: '🇺🇸' },
  { id: 'amazon_ca', name: 'Amazon CA', flag: '🇨🇦' },
  { id: 'amazon_uk', name: 'Amazon UK', flag: '🇬🇧' },
  { id: 'amazon_de', name: 'Amazon DE', flag: '🇩🇪' },
  { id: 'amazon_fr', name: 'Amazon FR', flag: '🇫🇷' },
  { id: 'walmart', name: 'Walmart', flag: '🛒' },
  { id: 'shopify', name: 'Shopify', flag: '🛍️' },
  { id: 'ebay', name: 'eBay', flag: '📦' },
  { id: 'supplier', name: 'Supplier SKU', flag: '🏭' },
]

export default function ProductSettingsModal({
  isOpen,
  onClose,
  product,
  allProducts = [],
  suppliers,
  linkedProducts,
  onSave,
  onLinkProduct,
  onUnlinkProduct,
  onSearchLinked,
  onSaveMapping,
  onDeleteMapping,
  saving = false,
}: ProductSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [form, setForm] = useState({
    cost: '',
    price: '',
    mapPrice: '',
    msrp: '',
    packagingCost: '',
    tariffPercent: '',
    additionalCosts: [] as AdditionalCost[],
    fbaFeeEstimate: '',
    referralFeePercent: '20', // Default 20% for jewelry
    refundPercent: '2',
    adsPercent: '0',
    supplierId: '',
    supplierSku: '',
    fnsku: '',
    upc: '',
    labelType: 'fnsku_only',
    warehouseLocation: '',
    isWarrantied: true,
    careInstructions: '',
    sizingGuide: '',
    // Status fields
    status: 'active',
    launchDate: '',
    recreatedFromSku: '',
  })
  const [linkSearchTerm, setLinkSearchTerm] = useState('')
  const [linkSearchResults, setLinkSearchResults] = useState<Product[]>([])
  const [searchingLinks, setSearchingLinks] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  
  // Apply scope modal
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [pendingField, setPendingField] = useState<string | null>(null)
  const [pendingValue, setPendingValue] = useState<any>(null)
  const [applyScope, setApplyScope] = useState<'this' | 'all' | 'supplier'>('this')
  
  // Custom cost
  const [newCostName, setNewCostName] = useState('')
  const [newCostAmount, setNewCostAmount] = useState('')
  
  // SKU Mapping form
  const [showAddMapping, setShowAddMapping] = useState(false)
  const [mappingForm, setMappingForm] = useState({
    channel: '',
    channelSku: '',
    channelProductId: '',
  })
  
  // Recreate SKU search
  const [recreateSearchTerm, setRecreateSearchTerm] = useState('')

  // Initialize form when product changes
  useEffect(() => {
    if (product) {
      setForm({
        cost: product.cost?.toString() || '',
        price: product.price?.toString() || '',
        mapPrice: product.mapPrice?.toString() || '',
        msrp: product.msrp?.toString() || '',
        packagingCost: product.packagingCost?.toString() || '',
        tariffPercent: product.tariffPercent?.toString() || '',
        additionalCosts: product.additionalCosts || [],
        fbaFeeEstimate: product.fbaFeeEstimate?.toString() || '',
        referralFeePercent: product.referralFeePercent?.toString() || '20',
        refundPercent: product.refundPercent?.toString() || '2',
        adsPercent: product.adsPercent?.toString() || '0',
        supplierId: product.supplierId?.toString() || '',
        supplierSku: product.supplierSku || '',
        fnsku: product.fnsku || '',
        upc: product.upc || '',
        labelType: product.labelType || 'fnsku_only',
        warehouseLocation: product.warehouseLocation || '',
        isWarrantied: product.isWarrantied !== false,
        careInstructions: product.careInstructions || '',
        sizingGuide: product.sizingGuide || '',
        status: product.status || 'active',
        launchDate: product.launchDate ? product.launchDate.split('T')[0] : '',
        recreatedFromSku: product.recreatedFromSku || '',
      })
      setActiveTab('overview')
      setLinkSearchTerm('')
      setLinkSearchResults([])
      setShowAddMapping(false)
      setMappingForm({ channel: '', channelSku: '', channelProductId: '' })
    }
  }, [product])

  // Field change with apply scope prompt
  const handleFieldChange = (field: string, value: any, askScope: boolean = true) => {
    setForm(prev => ({ ...prev, [field]: value }))
    
    // Fields that should prompt for scope
    const scopeFields = [
      'packagingCost', 'tariffPercent', 'fbaFeeEstimate', 
      'referralFeePercent', 'refundPercent', 'adsPercent'
    ]
    
    if (askScope && scopeFields.includes(field) && value && parseFloat(value) > 0) {
      setPendingField(field)
      setPendingValue(value)
      setShowApplyModal(true)
    }
  }

  const confirmApplyScope = async () => {
    // Save with the selected scope
    await handleSave(applyScope)
    setShowApplyModal(false)
    setPendingField(null)
    setPendingValue(null)
    setApplyScope('this')
  }

  const handleSave = async (scope: 'this' | 'all' | 'supplier' = 'this') => {
    const data = {
      cost: form.cost ? parseFloat(form.cost) : 0,
      price: form.price ? parseFloat(form.price) : 0,
      mapPrice: form.mapPrice ? parseFloat(form.mapPrice) : null,
      msrp: form.msrp ? parseFloat(form.msrp) : null,
      packagingCost: form.packagingCost ? parseFloat(form.packagingCost) : null,
      tariffPercent: form.tariffPercent ? parseFloat(form.tariffPercent) : null,
      additionalCosts: form.additionalCosts.length > 0 ? form.additionalCosts : null,
      fbaFeeEstimate: form.fbaFeeEstimate ? parseFloat(form.fbaFeeEstimate) : null,
      referralFeePercent: form.referralFeePercent ? parseFloat(form.referralFeePercent) : 20,
      refundPercent: form.refundPercent ? parseFloat(form.refundPercent) : 2,
      adsPercent: form.adsPercent ? parseFloat(form.adsPercent) : 0,
      supplierId: form.supplierId ? parseInt(form.supplierId) : null,
      supplierSku: form.supplierSku || null,
      fnsku: form.fnsku || null,
      upc: form.upc || null,
      labelType: form.labelType || 'fnsku_only',
      warehouseLocation: form.warehouseLocation || null,
      isWarrantied: form.isWarrantied,
      careInstructions: form.careInstructions || null,
      sizingGuide: form.sizingGuide || null,
      status: form.status,
      launchDate: form.launchDate ? new Date(form.launchDate).toISOString() : null,
      recreatedFromSku: form.recreatedFromSku || null,
      discontinuedAt: form.status === 'discontinued' ? new Date().toISOString() : null,
    }
    
    await onSave(data, scope)
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
  
  const addCustomCost = () => {
    if (newCostName && newCostAmount) {
      const newCost = { name: newCostName, amount: parseFloat(newCostAmount) }
      setForm({
        ...form,
        additionalCosts: [...form.additionalCosts, newCost]
      })
      setNewCostName('')
      setNewCostAmount('')
    }
  }
  
  const removeCustomCost = (index: number) => {
    setForm({
      ...form,
      additionalCosts: form.additionalCosts.filter((_, i) => i !== index)
    })
  }

  // Calculate Amazon profit
  const calculateProfit = () => {
    const price = parseFloat(form.price) || 0
    const cost = parseFloat(form.cost) || 0
    const packaging = parseFloat(form.packagingCost) || 0
    const tariffPct = parseFloat(form.tariffPercent) || 0
    const tariffCost = cost * (tariffPct / 100)
    const customCosts = form.additionalCosts.reduce((sum, c) => sum + c.amount, 0)
    const fbaFee = parseFloat(form.fbaFeeEstimate) || 0
    const referralPercent = parseFloat(form.referralFeePercent) || 20
    const refundPercent = parseFloat(form.refundPercent) || 2
    const adsPercent = parseFloat(form.adsPercent) || 0
    
    const referralFee = price * (referralPercent / 100)
    const refundCost = price * (refundPercent / 100)
    const adsCost = price * (adsPercent / 100)
    
    const landedCost = cost + packaging + tariffCost + customCosts
    const totalCosts = landedCost + fbaFee + referralFee + refundCost + adsCost
    const profit = price - totalCosts
    const margin = price > 0 ? (profit / price) * 100 : 0
    const roi = cost > 0 ? (profit / cost) * 100 : 0
    
    return { profit, margin, roi, totalCosts, referralFee, refundCost, adsCost, tariffCost, landedCost }
  }
  
  const profitCalc = calculateProfit()
  
  // Get image URL helper
  const getImageUrl = (img: ProductImage): string => img.url || img.link || ''
  
  // Check if product is "new" (within 6 months of launch)
  const isNewProduct = () => {
    if (form.status !== 'new' || !form.launchDate) return false
    const launchDate = new Date(form.launchDate)
    const sixMonthsLater = new Date(launchDate)
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6)
    return new Date() < sixMonthsLater
  }
  
  // Filter products for recreate search
  const filteredRecreateProducts = allProducts.filter(p => 
    p.sku !== product?.sku && 
    (p.sku.toLowerCase().includes(recreateSearchTerm.toLowerCase()) ||
     p.title.toLowerCase().includes(recreateSearchTerm.toLowerCase()))
  ).slice(0, 10)

  if (!product) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="5xl" showCloseButton={false}>
      <div className="flex flex-col lg:flex-row min-h-[600px] -m-4 sm:-m-6">
        {/* Sidebar */}
        <div className="lg:w-64 bg-slate-900/50 border-b lg:border-b-0 lg:border-r border-slate-700/50 p-4">
          {/* Product Header */}
          <div className="flex items-start gap-3 pb-4 mb-4 border-b border-slate-700/50">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.title} className="w-16 h-16 rounded-lg object-cover bg-slate-800 flex-shrink-0" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Package className="w-8 h-8 text-slate-600" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono font-bold text-white text-sm truncate">{product.sku}</p>
              <p className="text-xs text-slate-400 line-clamp-2 mt-1">{product.displayName || product.title}</p>
              {product.asin && (
                <a href={`https://www.amazon.com/dp/${product.asin}`} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mt-1">
                  ASIN: {product.asin} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors lg:hidden">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-2 px-2 lg:mx-0 lg:px-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <button onClick={onClose} className="hidden lg:flex items-center gap-2 px-3 py-2 mt-4 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors w-full">
            <X className="w-4 h-4" /> Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-400" /> Product Overview
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 bg-slate-800/30 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.title} className="w-32 h-32 rounded-lg object-cover bg-slate-800" />
                    ) : (
                      <div className="w-32 h-32 rounded-lg bg-slate-800 flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-slate-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white text-lg">{product.displayName || product.title}</h4>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          form.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                          form.status === 'new' ? 'bg-cyan-500/20 text-cyan-400' :
                          form.status === 'recreated' ? 'bg-purple-500/20 text-purple-400' :
                          form.status === 'discontinued' ? 'bg-red-500/20 text-red-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>{form.status}</span>
                        {product.brand && <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">{product.brand}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-4">
                  <p className="text-sm text-slate-400 mb-1">Current Price</p>
                  <p className="text-2xl font-bold text-white">${Number(product.price || 0).toFixed(2)}</p>
                </div>
                <div className="bg-slate-800/30 rounded-xl p-4">
                  <p className="text-sm text-slate-400 mb-1">Est. Profit</p>
                  <p className={`text-2xl font-bold ${profitCalc.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${profitCalc.profit.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">{profitCalc.margin.toFixed(1)}% margin</p>
                </div>
                <div className="sm:col-span-2 bg-slate-800/30 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Product Identifiers</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[{ label: 'Master SKU', value: product.sku }, { label: 'ASIN', value: product.asin }, { label: 'FNSKU', value: product.fnsku }, { label: 'UPC', value: product.upc }].map((item) => (
                      <div key={item.label}>
                        <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm text-white truncate flex-1">{item.value || '—'}</p>
                          {item.value && (
                            <button onClick={() => copyToClipboard(item.value!, item.label)} className="p-1 text-slate-500 hover:text-white transition-colors">
                              {copiedField === item.label ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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

          {/* Pricing & Costs Tab */}
          {activeTab === 'pricing' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-cyan-400" /> Pricing & Costs
              </h3>

              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3">Base Pricing</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { field: 'cost', label: 'Cost', prefix: '$' },
                    { field: 'price', label: 'Price', prefix: '$' },
                    { field: 'mapPrice', label: 'MAP', prefix: '$' },
                    { field: 'msrp', label: 'MSRP', prefix: '$' },
                  ].map(({ field, label, prefix }) => (
                    <div key={field}>
                      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{prefix}</span>
                        <input
                          type="number" step="0.01" min="0"
                          value={(form as any)[field]}
                          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                          placeholder="0.00"
                          className="w-full pl-8 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-700/50 pt-6">
                <h4 className="text-sm font-medium text-slate-400 mb-3">Additional Costs</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Packaging</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input type="number" step="0.01" min="0" value={form.packagingCost} onChange={(e) => handleFieldChange('packagingCost', e.target.value)} placeholder="0.00" className="w-full pl-8 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Tariff %</label>
                    <div className="relative">
                      <input type="number" step="0.1" min="0" max="100" value={form.tariffPercent} onChange={(e) => handleFieldChange('tariffPercent', e.target.value)} placeholder="0" className="w-full pl-4 pr-8 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">= ${profitCalc.tariffCost.toFixed(2)}/unit</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Landed Cost</label>
                    <div className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                      <span className="text-white font-medium">${profitCalc.landedCost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                
                {form.additionalCosts.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {form.additionalCosts.map((cost, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg">
                        <span className="text-sm text-slate-300 flex-1">{cost.name}</span>
                        <span className="text-sm font-medium text-white">${cost.amount.toFixed(2)}</span>
                        <button onClick={() => removeCustomCost(index)} className="p-1 text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="mt-4 flex gap-2">
                  <input type="text" value={newCostName} onChange={(e) => setNewCostName(e.target.value)} placeholder="Cost name..." className="flex-1 px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm" />
                  <div className="relative w-24">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                    <input type="number" step="0.01" min="0" value={newCostAmount} onChange={(e) => setNewCostAmount(e.target.value)} placeholder="0.00" className="w-full pl-7 pr-2 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm" />
                  </div>
                  <Button size="sm" onClick={addCustomCost} disabled={!newCostName || !newCostAmount}><Plus className="w-4 h-4" /></Button>
                </div>
              </div>

              <div className="border-t border-slate-700/50 pt-6">
                <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2"><Truck className="w-4 h-4" /> Supplier</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Supplier</label>
                    <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500">
                      <option value="">No supplier</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Supplier SKU</label>
                    <input type="text" value={form.supplierSku} onChange={(e) => setForm({ ...form, supplierSku: e.target.value })} placeholder="Supplier's SKU" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-700/50 pt-6">
                <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2"><Calculator className="w-4 h-4" /> Amazon Profit Calculator</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">FBA Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input type="number" step="0.01" min="0" value={form.fbaFeeEstimate} onChange={(e) => handleFieldChange('fbaFeeEstimate', e.target.value)} placeholder="0.00" className="w-full pl-8 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Referral %</label>
                    <div className="relative">
                      <input type="number" step="0.1" min="0" max="100" value={form.referralFeePercent} onChange={(e) => handleFieldChange('referralFeePercent', e.target.value)} placeholder="20" className="w-full pl-4 pr-8 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Refund %</label>
                    <div className="relative">
                      <input type="number" step="0.1" min="0" max="100" value={form.refundPercent} onChange={(e) => handleFieldChange('refundPercent', e.target.value)} placeholder="2" className="w-full pl-4 pr-8 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Ads %</label>
                    <div className="relative">
                      <input type="number" step="0.1" min="0" max="100" value={form.adsPercent} onChange={(e) => handleFieldChange('adsPercent', e.target.value)} placeholder="0" className="w-full pl-4 pr-8 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-800/30 rounded-xl p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-slate-400">Price</p><p className="text-white font-medium">${parseFloat(form.price || '0').toFixed(2)}</p></div>
                    <div><p className="text-slate-400">Landed</p><p className="text-red-400 font-medium">-${profitCalc.landedCost.toFixed(2)}</p></div>
                    <div><p className="text-slate-400">FBA</p><p className="text-red-400 font-medium">-${parseFloat(form.fbaFeeEstimate || '0').toFixed(2)}</p></div>
                    <div><p className="text-slate-400">Referral</p><p className="text-red-400 font-medium">-${profitCalc.referralFee.toFixed(2)}</p></div>
                    <div><p className="text-slate-400">Refund</p><p className="text-red-400 font-medium">-${profitCalc.refundCost.toFixed(2)}</p></div>
                    <div><p className="text-slate-400">Ads</p><p className="text-red-400 font-medium">-${profitCalc.adsCost.toFixed(2)}</p></div>
                    <div className="sm:col-span-2 border-t border-slate-700 pt-2">
                      <p className="text-slate-400">Net Profit</p>
                      <p className={`text-xl font-bold ${profitCalc.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${profitCalc.profit.toFixed(2)}</p>
                      <p className="text-xs text-slate-500">{profitCalc.margin.toFixed(1)}% margin · {profitCalc.roi.toFixed(0)}% ROI</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Amazon & Labels Tab */}
          {activeTab === 'amazon' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Tag className="w-5 h-5 text-cyan-400" /> Amazon & Labeling</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">FNSKU</label>
                  <input type="text" value={form.fnsku} onChange={(e) => setForm({ ...form, fnsku: e.target.value })} placeholder="X001ABC123" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">UPC</label>
                  <input type="text" value={form.upc} onChange={(e) => setForm({ ...form, upc: e.target.value })} placeholder="12-14 digit" maxLength={14} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Label Type</label>
                  <select value={form.labelType} onChange={(e) => setForm({ ...form, labelType: e.target.value })} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500">
                    <option value="fnsku_only">FNSKU Only</option>
                    <option value="fnsku_tp">FNSKU + Transparency</option>
                    <option value="tp_only">Transparency Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Warehouse Location</label>
                  <input type="text" value={form.warehouseLocation} onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })} placeholder="A-12-3" className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                </div>
              </div>
            </div>
          )}

          {/* Status Tab */}
          {activeTab === 'status' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-cyan-400" /> Product Status</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { value: 'active', label: 'Active', icon: <Check className="w-5 h-5" />, color: 'emerald', desc: 'Normal product' },
                  { value: 'new', label: 'New', icon: <Sparkles className="w-5 h-5" />, color: 'cyan', desc: '6-month launch period' },
                  { value: 'recreated', label: 'Re-Created', icon: <RotateCcw className="w-5 h-5" />, color: 'purple', desc: 'Replaced old listing' },
                  { value: 'discontinued', label: 'Discontinued', icon: <Archive className="w-5 h-5" />, color: 'red', desc: 'No more shipments' },
                ].map(({ value, label, icon, color, desc }) => (
                  <button
                    key={value}
                    onClick={() => setForm({ ...form, status: value })}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      form.status === value 
                        ? `bg-${color}-500/20 border-${color}-500/50 text-${color}-400` 
                        : 'bg-slate-800/30 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className={`mb-2 ${form.status === value ? `text-${color}-400` : 'text-slate-500'}`}>{icon}</div>
                    <p className={`font-medium ${form.status === value ? `text-${color}-400` : 'text-white'}`}>{label}</p>
                    <p className="text-xs mt-1 text-slate-500">{desc}</p>
                  </button>
                ))}
              </div>

              {/* New Product Settings */}
              {form.status === 'new' && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-cyan-400 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> New Product Launch Date
                  </h4>
                  <input
                    type="date"
                    value={form.launchDate}
                    onChange={(e) => setForm({ ...form, launchDate: e.target.value })}
                    className="px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-xs text-slate-400 mt-2">
                    Product will be marked as "new" for 6 months from this date.
                    {form.launchDate && (
                      <span className="text-cyan-400 ml-1">
                        Expires: {new Date(new Date(form.launchDate).setMonth(new Date(form.launchDate).getMonth() + 6)).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Re-Created Settings */}
              {form.status === 'recreated' && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-purple-400 mb-3 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Link to Old SKU
                  </h4>
                  <p className="text-xs text-slate-400 mb-3">
                    Select the old SKU this product replaces. The old SKU will be ignored in FBA shipments and purchasing.
                  </p>
                  
                  {form.recreatedFromSku ? (
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <p className="text-sm text-white font-mono">{form.recreatedFromSku}</p>
                        <p className="text-xs text-slate-400">Old listing being replaced</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, recreatedFromSku: '' })}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={recreateSearchTerm}
                        onChange={(e) => setRecreateSearchTerm(e.target.value)}
                        placeholder="Search for old SKU..."
                        className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      />
                      {recreateSearchTerm && filteredRecreateProducts.length > 0 && (
                        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                          {filteredRecreateProducts.map((p) => (
                            <button
                              key={p.sku}
                              onClick={() => {
                                setForm({ ...form, recreatedFromSku: p.sku })
                                setRecreateSearchTerm('')
                              }}
                              className="w-full text-left p-2 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
                            >
                              <p className="text-sm text-white font-mono">{p.sku}</p>
                              <p className="text-xs text-slate-400 truncate">{p.title}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Discontinued Info */}
              {form.status === 'discontinued' && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
                    <Archive className="w-4 h-4" /> Discontinued Product
                  </h4>
                  <p className="text-xs text-slate-400">
                    This product will be excluded from:
                  </p>
                  <ul className="text-xs text-slate-400 mt-2 space-y-1">
                    <li>• Future FBA shipment recommendations</li>
                    <li>• Purchase order suggestions</li>
                    <li>• Restock alerts</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Listing Details Tab */}
          {activeTab === 'listing' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2"><FileText className="w-5 h-5 text-cyan-400" /> Amazon Listing Details</h3>
                {product.listingLastSync && <p className="text-xs text-slate-500 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> {new Date(product.listingLastSync).toLocaleDateString()}</p>}
              </div>
              
              {product.images && Array.isArray(product.images) && product.images.length > 0 ? (
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Images</h4>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {(product.images as ProductImage[]).map((img, i) => {
                      const url = getImageUrl(img)
                      return url ? (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg bg-slate-800 overflow-hidden hover:ring-2 hover:ring-cyan-500">
                          <img src={url} alt={img.variant} className="w-full h-full object-cover" />
                        </a>
                      ) : null
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/30 rounded-xl p-6 text-center">
                  <ImageIcon className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No images synced</p>
                </div>
              )}

              {product.bulletPoints && Array.isArray(product.bulletPoints) && product.bulletPoints.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Bullet Points</h4>
                  <ul className="space-y-2">
                    {(product.bulletPoints as string[]).map((bullet, i) => (
                      <li key={i} className="flex items-start gap-3 bg-slate-800/30 rounded-lg p-3">
                        <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <span className="text-sm text-slate-300">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Alternate SKUs Tab */}
          {activeTab === 'skus' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Globe className="w-5 h-5 text-cyan-400" /> Alternate SKUs</h3>
                <Button size="sm" onClick={() => setShowAddMapping(!showAddMapping)}><Plus className="w-4 h-4 mr-1" /> Add</Button>
              </div>
              
              {showAddMapping && (
                <div className="bg-slate-800/30 rounded-xl p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <select value={mappingForm.channel} onChange={(e) => setMappingForm({ ...mappingForm, channel: e.target.value })} className="px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500">
                      <option value="">Select channel...</option>
                      {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.flag} {c.name}</option>)}
                    </select>
                    <input type="text" value={mappingForm.channelSku} onChange={(e) => setMappingForm({ ...mappingForm, channelSku: e.target.value })} placeholder="Channel SKU" className="px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                    <input type="text" value={mappingForm.channelProductId} onChange={(e) => setMappingForm({ ...mappingForm, channelProductId: e.target.value })} placeholder="Product ID (optional)" className="px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={async () => { if (onSaveMapping && mappingForm.channel && mappingForm.channelSku) { await onSaveMapping(mappingForm.channel, mappingForm.channelSku, mappingForm.channelProductId); setMappingForm({ channel: '', channelSku: '', channelProductId: '' }); setShowAddMapping(false) } }} disabled={!mappingForm.channel || !mappingForm.channelSku}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowAddMapping(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {product.skuMappings && product.skuMappings.length > 0 ? (
                <div className="space-y-2">
                  {product.skuMappings.map((m) => {
                    const ch = CHANNELS.find(c => c.id === m.channel)
                    return (
                      <div key={m.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{ch?.flag || '📦'}</span>
                          <div>
                            <p className="text-white font-medium">{ch?.name || m.channel}</p>
                            <p className="text-sm text-slate-400 font-mono">{m.channelSku}</p>
                          </div>
                        </div>
                        {onDeleteMapping && <button onClick={() => onDeleteMapping(m.id)} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="bg-slate-800/30 rounded-xl p-6 text-center">
                  <Globe className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No mappings</p>
                </div>
              )}
            </div>
          )}

          {/* Linked Products Tab */}
          {activeTab === 'links' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Layers className="w-5 h-5 text-cyan-400" /> Linked Products</h3>
              <p className="text-sm text-slate-400">Products that share physical inventory and purchasing velocity.</p>
              
              {linkedProducts.length > 0 && (
                <div className="space-y-2">
                  {linkedProducts.map((p) => (
                    <div key={p.sku} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? <img src={p.imageUrl} className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center"><Package className="w-5 h-5 text-slate-600" /></div>}
                        <div><p className="font-mono text-white text-sm">{p.sku}</p><p className="text-xs text-slate-400 truncate max-w-[200px]">{p.title}</p></div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => onUnlinkProduct(p)} className="text-red-400"><X className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
              )}
              
              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-3">Add Link</h4>
                <input type="text" value={linkSearchTerm} onChange={(e) => handleLinkSearch(e.target.value)} placeholder="Search SKU or title..." className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
                {linkSearchResults.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                    {linkSearchResults.map((r) => (
                      <div key={r.sku} onClick={() => onLinkProduct(r)} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:border-cyan-500/50 border border-transparent">
                        <div className="flex items-center gap-3">
                          {r.imageUrl ? <img src={r.imageUrl} className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center"><Package className="w-5 h-5 text-slate-600" /></div>}
                          <div><p className="font-mono text-white text-sm">{r.sku}</p><p className="text-xs text-slate-400 truncate">{r.title}</p></div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Support Tab */}
          {activeTab === 'support' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Info className="w-5 h-5 text-cyan-400" /> Support & Warranty</h3>
              
              <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl">
                <div><p className="text-sm font-medium text-white">Warranty Eligible</p><p className="text-xs text-slate-400">Allow warranty claims</p></div>
                <button onClick={() => setForm({ ...form, isWarrantied: !form.isWarrantied })} className={`relative w-12 h-6 rounded-full transition-colors ${form.isWarrantied ? 'bg-cyan-500' : 'bg-slate-600'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.isWarrantied ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Care Instructions</label>
                <textarea value={form.careInstructions} onChange={(e) => setForm({ ...form, careInstructions: e.target.value })} placeholder="Care instructions..." rows={3} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Sizing Guide</label>
                <textarea value={form.sizingGuide} onChange={(e) => setForm({ ...form, sizingGuide: e.target.value })} placeholder="Sizing info..." rows={3} className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {activeTab !== 'listing' && activeTab !== 'overview' && (
        <ModalFooter className="border-t border-slate-700/50 mt-0 pt-4 -mx-4 sm:-mx-6 px-4 sm:px-6">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => handleSave('this')} loading={saving}>Save Changes</Button>
        </ModalFooter>
      )}

      {/* Apply Scope Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-cyan-400" /> Apply Setting To...
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Apply this {pendingField?.replace(/([A-Z])/g, ' $1').toLowerCase().replace('percent', '%')} to:
            </p>
            <div className="space-y-2 mb-6">
              {[
                { value: 'this', label: 'This SKU only', desc: product?.sku },
                { value: 'supplier', label: `All from ${product?.supplier?.name || 'this supplier'}`, desc: 'All products from same supplier', show: !!product?.supplier },
                { value: 'all', label: 'All SKUs', desc: 'Apply to entire catalog' },
              ].filter(o => o.show !== false).map(({ value, label, desc }) => (
                <label key={value} className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700">
                  <input type="radio" name="scope" value={value} checked={applyScope === value} onChange={() => setApplyScope(value as any)} className="text-cyan-500" />
                  <div><p className="text-white text-sm font-medium">{label}</p><p className="text-xs text-slate-400">{desc}</p></div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setShowApplyModal(false); setPendingField(null) }}>Cancel</Button>
              <Button onClick={confirmApplyScope}>Apply</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
