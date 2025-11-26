'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { 
  TrendingUp, 
  Calendar, 
  Package, 
  AlertTriangle, 
  RefreshCw, 
  ShoppingCart,
  Truck,
  CheckSquare,
  Square
} from 'lucide-react'

interface PurchasingRecommendation {
  masterSku: string
  title: string
  supplier: {
    id: number
    name: string
    moq: number
  } | null
  currentInventory: number
  currentVelocity: number
  daysOfStock: number
  targetDays: number
  neededInventory: number
  safetyStock: number
  leadTimeDays: number
  daysUntilReorder: number
  orderCycles: Array<{
    orderDate: string
    quantity: number
    projectedInventory: number
    needed: number
  }>
  unitCost: number
  calculationBreakdown?: {
    unitsSold30d: number
    velocity30d: number
    velocity90d: number
    baseDemand: number
    seasonalityMultiplier: number
    seasonalityNote: string
    adjustedDemand: number
    currentInventory: number
    safetyStock: number
    totalNeeded: number
    finalNeeded: number
  }
}

interface FbaShipmentRecommendation {
  masterSku: string
  channelSku: string
  title: string
  channel: string
  currentFbaInventory: number
  channelVelocity: number
  daysOfStock: number
  targetDays: number
  neededUnits: number
  batches: Array<{
    shipDate: string
    quantity: number
    projectedFbaInventory: number
  }>
  calculationBreakdown?: {
    unitsSold30d: number
    channelVelocity: number
    baseDemand: number
    seasonalityMultiplier: number
    seasonalityNote: string
    adjustedDemand: number
    currentFbaInventory: number
    finalNeeded: number
  }
}

export default function ForecastingPage() {
  const [activeTab, setActiveTab] = useState<'purchasing' | 'fba'>('purchasing')
  
  // Purchasing state
  const [purchasingLoading, setPurchasingLoading] = useState(false)
  const [purchasingRecommendations, setPurchasingRecommendations] = useState<PurchasingRecommendation[]>([])
  const [purchasingDaysTarget, setPurchasingDaysTarget] = useState(180)
  const [orderFrequency, setOrderFrequency] = useState<'weekly' | 'bi-weekly' | 'monthly'>('monthly')
  const [selectedPurchasingSkus, setSelectedPurchasingSkus] = useState<Set<string>>(new Set())
  const [showCreatePO, setShowCreatePO] = useState(false)
  const [suppliers, setSuppliers] = useState<any[]>([])

  // FBA Shipments state
  const [fbaLoading, setFbaLoading] = useState(false)
  const [fbaRecommendations, setFbaRecommendations] = useState<FbaShipmentRecommendation[]>([])
  const [fbaDaysTarget, setFbaDaysTarget] = useState(45)
  const [capacityFrequency, setCapacityFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [capacityAmount, setCapacityAmount] = useState(700)
  const [channel, setChannel] = useState('amazon_us')
  const [selectedFbaSkus, setSelectedFbaSkus] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchSuppliers()
    
    // Try to load from sessionStorage first
    if (typeof window !== 'undefined') {
      const storedPurchasing = sessionStorage.getItem('purchasingForecast')
      if (storedPurchasing) {
        try {
          const data = JSON.parse(storedPurchasing)
          // Check if settings match and data is recent (less than 1 hour old)
          const isRecent = Date.now() - data.timestamp < 3600000 // 1 hour
          const settingsMatch = 
            data.settings?.daysTarget === purchasingDaysTarget &&
            data.settings?.orderFrequency === orderFrequency
          
          if (isRecent && settingsMatch && data.recommendations?.length > 0) {
            setPurchasingRecommendations(data.recommendations)
            console.log('Loaded purchasing forecast from cache')
          } else {
            generatePurchasingForecast()
          }
        } catch (e) {
          generatePurchasingForecast()
        }
      } else {
        generatePurchasingForecast()
      }

      const storedFba = sessionStorage.getItem('fbaForecast')
      if (storedFba) {
        try {
          const data = JSON.parse(storedFba)
          // Check if settings match and data is recent
          const isRecent = Date.now() - data.timestamp < 3600000 // 1 hour
          const settingsMatch = 
            data.settings?.daysTarget === fbaDaysTarget &&
            data.settings?.capacityFrequency === capacityFrequency &&
            data.settings?.capacityAmount === capacityAmount &&
            data.settings?.channel === channel
          
          if (isRecent && settingsMatch && data.recommendations?.length > 0) {
            setFbaRecommendations(data.recommendations)
            console.log('Loaded FBA forecast from cache')
          } else {
            generateFbaForecast()
          }
        } catch (e) {
          generateFbaForecast()
        }
      } else {
        generateFbaForecast()
      }
    } else {
      // Server-side, just generate
      generatePurchasingForecast()
      generateFbaForecast()
    }
  }, [])

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers')
      if (res.ok) {
        const data = await res.json()
        setSuppliers(data)
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  const generatePurchasingForecast = async () => {
    setPurchasingLoading(true)
    try {
      const res = await fetch('/api/forecasting/purchasing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daysTarget: purchasingDaysTarget,
          orderFrequency,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setPurchasingRecommendations(data.recommendations || [])
        // Store in sessionStorage for persistence
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('purchasingForecast', JSON.stringify({
            recommendations: data.recommendations || [],
            timestamp: Date.now(),
            settings: { daysTarget: purchasingDaysTarget, orderFrequency },
          }))
        }
        console.log('Purchasing forecast summary:', data.summary)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error generating purchasing forecast:', error)
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setPurchasingLoading(false)
    }
  }

  const generateFbaForecast = async () => {
    setFbaLoading(true)
    try {
      // Convert capacity based on frequency
      const dailyCapacity = capacityFrequency === 'daily' 
        ? capacityAmount 
        : capacityFrequency === 'weekly' 
        ? Math.ceil(capacityAmount / 7) 
        : Math.ceil(capacityAmount / 30)
      
      const weeklyCapacity = capacityFrequency === 'daily'
        ? capacityAmount * 7
        : capacityFrequency === 'weekly'
        ? capacityAmount
        : Math.ceil(capacityAmount / 4)

      const res = await fetch('/api/forecasting/fba-shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daysTarget: fbaDaysTarget,
          dailyCapacity,
          weeklyCapacity,
          channel,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setFbaRecommendations(data.recommendations || [])
        // Store in sessionStorage for persistence
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('fbaForecast', JSON.stringify({
            recommendations: data.recommendations || [],
            timestamp: Date.now(),
            settings: { daysTarget: fbaDaysTarget, capacityFrequency, capacityAmount, channel },
          }))
        }
        console.log('FBA forecast summary:', data.summary)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error generating FBA forecast:', error)
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setFbaLoading(false)
    }
  }

  const togglePurchasingSku = (sku: string) => {
    const newSelected = new Set(selectedPurchasingSkus)
    if (newSelected.has(sku)) {
      newSelected.delete(sku)
    } else {
      newSelected.add(sku)
    }
    setSelectedPurchasingSkus(newSelected)
  }

  const toggleFbaSku = (sku: string) => {
    const newSelected = new Set(selectedFbaSkus)
    if (newSelected.has(sku)) {
      newSelected.delete(sku)
    } else {
      newSelected.add(sku)
    }
    setSelectedFbaSkus(newSelected)
  }

  const createPurchaseOrder = async () => {
    if (selectedPurchasingSkus.size === 0) {
      alert('Please select at least one SKU')
      return
    }

    // Group selected SKUs by supplier
    const skusBySupplier = new Map<number, PurchasingRecommendation[]>()

    for (const sku of selectedPurchasingSkus) {
      const rec = purchasingRecommendations.find(r => r.masterSku === sku)
      if (rec && rec.supplier) {
        if (!skusBySupplier.has(rec.supplier.id)) {
          skusBySupplier.set(rec.supplier.id, [])
        }
        skusBySupplier.get(rec.supplier.id)!.push(rec)
      }
    }

    // For now, create PO for first supplier (can be enhanced to support multiple)
    const [supplierId, items] = Array.from(skusBySupplier.entries())[0] || []
    
    if (!supplierId) {
      alert('Selected SKUs must have a supplier assigned')
      return
    }

    // Calculate total quantities and costs
    const poItems = items.map(rec => {
      const firstOrderCycle = rec.orderCycles[0]
      return {
        masterSku: rec.masterSku,
        quantityOrdered: firstOrderCycle?.quantity || rec.neededInventory,
        unitCost: rec.unitCost,
      }
    })

    const subtotal = poItems.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0)

    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber: `PO-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
          supplierId,
          status: 'draft',
          subtotal,
          shippingCost: 0,
          tax: 0,
          total: subtotal,
          items: poItems.map(item => ({
            masterSku: item.masterSku,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
            lineTotal: item.quantityOrdered * item.unitCost,
          })),
          notes: `Generated from forecasting - ${orderFrequency} ordering, ${purchasingDaysTarget} day target`,
        }),
      })

      if (res.ok) {
        alert('Purchase Order created successfully!')
        setSelectedPurchasingSkus(new Set())
        setShowCreatePO(false)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to create PO')
      }
    } catch (error) {
      console.error('Error creating PO:', error)
      alert('Failed to create purchase order')
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Inventory Forecasting</h1>
            <p className="text-slate-400 mt-1">Purchasing and FBA shipment recommendations</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('purchasing')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'purchasing'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <ShoppingCart className="w-4 h-4 inline mr-2" />
            Purchasing Forecast
          </button>
          <button
            onClick={() => setActiveTab('fba')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'fba'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <Truck className="w-4 h-4 inline mr-2" />
            FBA Shipment Forecast
          </button>
        </div>

        {/* Purchasing Forecast Tab */}
        {activeTab === 'purchasing' && (
          <div className="space-y-6">
            {/* Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Purchasing Forecast</CardTitle>
                <CardDescription>
                  Auto-updates when data changes. Analyze all SKUs across all channels to suggest purchase orders for maintaining inventory levels
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Days Target
                    </label>
                    <input
                      type="number"
                      value={purchasingDaysTarget}
                      onChange={(e) => setPurchasingDaysTarget(parseInt(e.target.value))}
                      min="30"
                      max="365"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Order Frequency
                    </label>
                    <select
                      value={orderFrequency}
                      onChange={(e) => setOrderFrequency(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="bi-weekly">Bi-Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={generatePurchasingForecast} loading={purchasingLoading} className="w-full">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh Forecast
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recommendations */}
            {purchasingRecommendations.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Purchase Recommendations</CardTitle>
                      <CardDescription>
                        {purchasingRecommendations.length} SKUs need reordering
                        {selectedPurchasingSkus.size > 0 && (
                          <span className="ml-2 text-cyan-400">
                            ({selectedPurchasingSkus.size} selected)
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    {selectedPurchasingSkus.size > 0 && (
                      <Button onClick={() => setShowCreatePO(true)}>
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Create PO ({selectedPurchasingSkus.size} SKUs)
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-800/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase w-12"></th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">SKU</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Product</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Supplier</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Current Stock</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Days of Stock</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Needed</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Next Order</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Order Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {purchasingRecommendations.map((rec) => (
                          <tr key={rec.masterSku} className="hover:bg-slate-800/30">
                            <td className="px-4 py-4">
                              <button
                                onClick={() => togglePurchasingSku(rec.masterSku)}
                                className="text-cyan-400 hover:text-cyan-300"
                              >
                                {selectedPurchasingSkus.has(rec.masterSku) ? (
                                  <CheckSquare className="w-5 h-5" />
                                ) : (
                                  <Square className="w-5 h-5" />
                                )}
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-white">
                              {rec.masterSku}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-300 max-w-xs truncate">
                              {rec.title}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-300">
                              {rec.supplier?.name || 'No Supplier'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                              {rec.currentInventory.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <span className={rec.daysOfStock < 14 ? 'text-red-400' : rec.daysOfStock < 30 ? 'text-amber-400' : 'text-slate-300'}>
                                {rec.daysOfStock} days
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-cyan-400">
                              <div className="group relative">
                                <span className="cursor-help underline decoration-dotted">
                                  {rec.neededInventory.toLocaleString()}
                                </span>
                                {rec.calculationBreakdown && (
                                  <div className="absolute left-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-4 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                                    <div className="space-y-2 text-xs">
                                      <div className="font-semibold text-white mb-2 border-b border-slate-700 pb-2">
                                        Calculation Breakdown
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Sold (30 days):</span>
                                        <span className="text-white font-mono">{rec.calculationBreakdown.unitsSold30d} units</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Velocity (30d):</span>
                                        <span className="text-white font-mono">{rec.calculationBreakdown.velocity30d.toFixed(2)}/day</span>
                                      </div>
                                      {rec.calculationBreakdown.velocity90d > 0 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-400">Velocity (90d):</span>
                                          <span className="text-white font-mono">{rec.calculationBreakdown.velocity90d.toFixed(2)}/day</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between pt-2 border-t border-slate-700">
                                        <span className="text-slate-400">Base Demand ({rec.targetDays}d):</span>
                                        <span className="text-white font-mono">{Math.ceil(rec.calculationBreakdown.baseDemand).toLocaleString()}</span>
                                      </div>
                                      {rec.calculationBreakdown.seasonalityMultiplier > 1 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-400">Seasonality:</span>
                                          <span className="text-emerald-400 font-semibold">
                                            {rec.calculationBreakdown.seasonalityNote || `×${rec.calculationBreakdown.seasonalityMultiplier.toFixed(2)}`}
                                          </span>
                                        </div>
                                      )}
                                      {rec.calculationBreakdown.seasonalityMultiplier > 1 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-400">Adjusted Demand:</span>
                                          <span className="text-white font-mono">{Math.ceil(rec.calculationBreakdown.adjustedDemand).toLocaleString()}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Safety Stock:</span>
                                        <span className="text-amber-400 font-mono">+{rec.calculationBreakdown.safetyStock.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between pt-2 border-t border-slate-700">
                                        <span className="text-slate-400">Total Needed:</span>
                                        <span className="text-white font-mono font-semibold">{Math.ceil(rec.calculationBreakdown.totalNeeded).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Current Inventory:</span>
                                        <span className="text-slate-300 font-mono">-{rec.calculationBreakdown.currentInventory.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between pt-2 border-t border-slate-700">
                                        <span className="text-cyan-400 font-semibold">Final Needed:</span>
                                        <span className="text-cyan-400 font-mono font-bold">{rec.calculationBreakdown.finalNeeded.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                              {rec.orderCycles[0] ? formatDate(rec.orderCycles[0].orderDate) : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-white">
                              {rec.orderCycles[0]?.quantity.toLocaleString() || rec.neededInventory.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* FBA Shipment Forecast Tab */}
        {activeTab === 'fba' && (
          <div className="space-y-6">
            {/* Settings */}
            <Card>
              <CardHeader>
                <CardTitle>FBA Shipment Forecast</CardTitle>
                <CardDescription>
                  Auto-updates when data changes. Analyze channel-specific SKU sales to suggest FBA shipments with capacity constraints
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Days Target
                    </label>
                    <input
                      type="number"
                      value={fbaDaysTarget}
                      onChange={(e) => setFbaDaysTarget(parseInt(e.target.value))}
                      min="14"
                      max="90"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Capacity Frequency
                    </label>
                    <select
                      value={capacityFrequency}
                      onChange={(e) => setCapacityFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Capacity ({capacityFrequency === 'daily' ? 'units/day' : capacityFrequency === 'weekly' ? 'units/week' : 'units/month'})
                    </label>
                    <input
                      type="number"
                      value={capacityAmount}
                      onChange={(e) => setCapacityAmount(parseInt(e.target.value))}
                      min="1"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Channel
                    </label>
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="amazon_us">Amazon US</option>
                      <option value="amazon_uk">Amazon UK</option>
                      <option value="amazon_ca">Amazon CA</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={generateFbaForecast} loading={fbaLoading}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Forecast
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Recommendations */}
            {fbaRecommendations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>FBA Shipment Recommendations</CardTitle>
                  <CardDescription>
                    {fbaRecommendations.length} SKUs need FBA shipments
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-800/50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">SKU</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Product</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">FBA Stock</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Days of Stock</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Needed</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Shipment Batches</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {fbaRecommendations.map((rec) => (
                          <tr key={rec.masterSku} className="hover:bg-slate-800/30">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-white">
                              {rec.channelSku}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-300 max-w-xs truncate">
                              {rec.title}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                              {rec.currentFbaInventory.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <span className={rec.daysOfStock < 14 ? 'text-red-400' : rec.daysOfStock < 30 ? 'text-amber-400' : 'text-slate-300'}>
                                {rec.daysOfStock} days
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-cyan-400">
                              <div className="group relative">
                                <span className="cursor-help underline decoration-dotted">
                                  {rec.neededUnits.toLocaleString()}
                                </span>
                                {rec.calculationBreakdown && (
                                  <div className="absolute left-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-4 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                                    <div className="space-y-2 text-xs">
                                      <div className="font-semibold text-white mb-2 border-b border-slate-700 pb-2">
                                        Calculation Breakdown
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Sold (30 days):</span>
                                        <span className="text-white font-mono">{rec.calculationBreakdown.unitsSold30d} units</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Channel Velocity:</span>
                                        <span className="text-white font-mono">{rec.calculationBreakdown.channelVelocity.toFixed(2)}/day</span>
                                      </div>
                                      <div className="flex justify-between pt-2 border-t border-slate-700">
                                        <span className="text-slate-400">Base Demand ({rec.targetDays}d):</span>
                                        <span className="text-white font-mono">{Math.ceil(rec.calculationBreakdown.baseDemand).toLocaleString()}</span>
                                      </div>
                                      {rec.calculationBreakdown.seasonalityMultiplier > 1 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-400">Seasonality:</span>
                                          <span className="text-emerald-400 font-semibold">
                                            {rec.calculationBreakdown.seasonalityNote || `×${rec.calculationBreakdown.seasonalityMultiplier.toFixed(2)}`}
                                          </span>
                                        </div>
                                      )}
                                      {rec.calculationBreakdown.seasonalityMultiplier > 1 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-400">Adjusted Demand:</span>
                                          <span className="text-white font-mono">{Math.ceil(rec.calculationBreakdown.adjustedDemand).toLocaleString()}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Current FBA Inventory:</span>
                                        <span className="text-slate-300 font-mono">-{rec.calculationBreakdown.currentFbaInventory.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between pt-2 border-t border-slate-700">
                                        <span className="text-cyan-400 font-semibold">Final Needed:</span>
                                        <span className="text-cyan-400 font-mono font-bold">{rec.calculationBreakdown.finalNeeded.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-300">
                              <div className="space-y-1">
                                {rec.batches.map((batch, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <span className="text-cyan-400">{batch.quantity}</span>
                                    <span className="text-slate-500">units on</span>
                                    <span>{formatDate(batch.shipDate)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Create PO Modal */}
        {showCreatePO && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>Create Purchase Order</CardTitle>
                <CardDescription>
                  Review selected items and create purchase order
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {Array.from(selectedPurchasingSkus).map(sku => {
                    const rec = purchasingRecommendations.find(r => r.masterSku === sku)
                    if (!rec) return null
                    const firstOrderCycle = rec.orderCycles[0]
                    return (
                      <div key={sku} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                        <div>
                          <p className="font-semibold text-white">{rec.masterSku}</p>
                          <p className="text-sm text-slate-400">{rec.title}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-300">Qty: {firstOrderCycle?.quantity || rec.neededInventory}</p>
                          <p className="text-sm text-slate-400">Cost: {formatCurrency((firstOrderCycle?.quantity || rec.neededInventory) * rec.unitCost)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setShowCreatePO(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createPurchaseOrder}>
                    Create Purchase Order
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
