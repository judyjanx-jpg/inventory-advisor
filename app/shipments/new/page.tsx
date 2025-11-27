'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Package, Plus, Trash2, Save, X } from 'lucide-react'

interface Warehouse {
  id: number
  name: string
  code: string
}

interface Product {
  sku: string
  title: string
  fnsku: string | null
  transparencyEnabled?: boolean
  warehouseLocation?: string | null
}

interface ShipmentItem {
  id?: number
  sku: string
  productName: string
  fnsku: string | null
  requestedQty: number
  adjustedQty: number
  availableQty?: number
  product?: Product
}

export default function NewShipmentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [fromLocationId, setFromLocationId] = useState<number | null>(null)
  const [destination, setDestination] = useState<string>('') // FBA destination like 'fba_us'
  const [optimalPlacementEnabled, setOptimalPlacementEnabled] = useState(true)
  const [items, setItems] = useState<ShipmentItem[]>([])
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])

  useEffect(() => {
    fetchWarehouses()
  }, [])

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouses')
      const data = await res.json()
      if (res.ok) {
        setWarehouses(data)
        // Set default warehouse if available
        const defaultWarehouse = data.find((w: Warehouse) => w.isDefault)
        if (defaultWarehouse) {
          setFromLocationId(defaultWarehouse.id)
        }
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error)
    }
  }

  const searchProducts = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    try {
      const res = await fetch(`/api/products?flat=true&showHidden=false`)
      const data = await res.json()
      if (res.ok) {
        const filtered = data
          .filter((p: any) => {
            const searchLower = query.toLowerCase()
            return (
              p.sku.toLowerCase().includes(searchLower) ||
              p.title.toLowerCase().includes(searchLower) ||
              p.asin?.toLowerCase().includes(searchLower)
            )
          })
          .slice(0, 20) // Limit results
        setSearchResults(filtered)
      }
    } catch (error) {
      console.error('Error searching products:', error)
    }
  }

  const handleProductSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setProductSearch(query)
    searchProducts(query)
  }

  const addProduct = (product: Product) => {
    // Check if already added
    if (items.some(item => item.sku === product.sku)) {
      alert('Product already added to shipment')
      return
    }

    // Get available quantity from warehouse inventory
    const getAvailableQty = async () => {
      if (!fromLocationId) return 0
      try {
        const res = await fetch(`/api/warehouses/${fromLocationId}/inventory`)
        const data = await res.json()
        if (res.ok) {
          const inventory = data.find((inv: any) => inv.masterSku === product.sku)
          return inventory?.available || 0
        }
      } catch (error) {
        console.error('Error fetching warehouse inventory:', error)
      }
      return 0
    }

    getAvailableQty().then(availableQty => {
      const newItem: ShipmentItem = {
        sku: product.sku,
        productName: product.title,
        fnsku: product.fnsku,
        requestedQty: 0,
        adjustedQty: 0,
        availableQty,
        product,
      }
      setItems([...items, newItem])
      setShowAddProduct(false)
      setProductSearch('')
      setSearchResults([])
    })
  }

  const removeItem = (sku: string) => {
    setItems(items.filter(item => item.sku !== sku))
  }

  const updateItemQty = (sku: string, field: 'requestedQty' | 'adjustedQty', value: number) => {
    setItems(items.map(item => {
      if (item.sku === sku) {
        const updated = { ...item, [field]: value }
        // Auto-calculate adjusted qty if optimal placement is enabled
        if (field === 'requestedQty' && optimalPlacementEnabled) {
          updated.adjustedQty = Math.ceil(value / 5) * 5
        }
        return updated
      }
      return item
    }))
  }

  const calculateAdjustedQty = (requestedQty: number): number => {
    if (!optimalPlacementEnabled) return requestedQty
    return Math.ceil(requestedQty / 5) * 5
  }

  useEffect(() => {
    if (optimalPlacementEnabled) {
      setItems(items.map(item => ({
        ...item,
        adjustedQty: calculateAdjustedQty(item.requestedQty)
      })))
    }
  }, [optimalPlacementEnabled])

  const saveShipment = async () => {
    if (!fromLocationId) {
      alert('Please select a from location')
      return
    }

    if (!destination) {
      alert('Please select an FBA destination')
      return
    }

    if (items.length === 0) {
      alert('Please add at least one item to the shipment')
      return
    }

    // Validate quantities
    for (const item of items) {
      if (item.requestedQty <= 0) {
        alert(`Please enter a quantity for ${item.productName}`)
        return
      }
      if (item.adjustedQty > (item.availableQty || 0)) {
        alert(`${item.productName}: Adjusted quantity (${item.adjustedQty}) exceeds available (${item.availableQty || 0})`)
        return
      }
    }

    setLoading(true)
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromLocationId,
          destination, // FBA destination like 'fba_us', 'fba_ca', 'fba_uk'
          optimalPlacementEnabled,
          items: items.map(item => ({
            sku: item.sku,
            fnsku: item.fnsku,
            productName: item.productName,
            requestedQty: item.requestedQty,
            adjustedQty: item.adjustedQty,
          })),
        }),
      })

      const data = await res.json()
      if (res.ok) {
        router.push(`/shipments/${data.shipment.id}`)
      } else {
        alert(`Error: ${data.error || 'Failed to create shipment'}`)
      }
    } catch (error) {
      console.error('Error creating shipment:', error)
      alert('Failed to create shipment')
    } finally {
      setLoading(false)
    }
  }

  const totalUnits = items.reduce((sum, item) => sum + item.adjustedQty, 0)
  const totalSkus = items.length

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Create FBA Shipment</h1>
            <p className="text-slate-400 mt-1">Create a new shipment to Amazon FBA</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={saveShipment} disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Draft'}
            </Button>
          </div>
        </div>

        {/* Location Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Shipment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  From Location
                </label>
                <select
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  value={fromLocationId || ''}
                  onChange={(e) => setFromLocationId(parseInt(e.target.value) || null)}
                >
                  <option value="">Select warehouse...</option>
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  To Location
                </label>
                <select
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  <option value="">Select FBA location...</option>
                  <option value="fba_us">FBA US</option>
                  <option value="fba_ca">FBA CA</option>
                  <option value="fba_uk">FBA UK</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="optimalPlacement"
                checked={optimalPlacementEnabled}
                onChange={(e) => setOptimalPlacementEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500"
              />
              <label htmlFor="optimalPlacement" className="text-sm text-slate-300">
                Optimal Placement Service (Round quantities to nearest 5)
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Items Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Items</CardTitle>
              <Button onClick={() => setShowAddProduct(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No items added yet</p>
                <p className="text-sm mt-1">Click "Add Product" to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">SKU</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Product Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">FNSKU</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Requested</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Available</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Adjusted</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.sku} className="border-b border-slate-800">
                        <td className="py-3 px-4 text-white">{item.sku}</td>
                        <td className="py-3 px-4 text-white">{item.productName}</td>
                        <td className="py-3 px-4 text-slate-400">{item.fnsku || '—'}</td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            min="0"
                            value={item.requestedQty}
                            onChange={(e) => updateItemQty(item.sku, 'requestedQty', parseInt(e.target.value) || 0)}
                            className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm"
                          />
                        </td>
                        <td className="py-3 px-4 text-slate-400">{item.availableQty || 0}</td>
                        <td className="py-3 px-4 text-white font-medium">{item.adjustedQty}</td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => removeItem(item.sku)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800/50">
                      <td colSpan={3} className="py-3 px-4 text-right text-sm font-medium text-slate-400">
                        Total:
                      </td>
                      <td colSpan={2} className="py-3 px-4 text-white font-bold">
                        {totalSkus} SKUs
                      </td>
                      <td className="py-3 px-4 text-white font-bold">
                        {totalUnits} units
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Product Modal */}
        {showAddProduct && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Add Product</h2>
                <button
                  onClick={() => {
                    setShowAddProduct(false)
                    setProductSearch('')
                    setSearchResults([])
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search by SKU, Product Name, or ASIN..."
                  value={productSearch}
                  onChange={handleProductSearch}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                  autoFocus
                />
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">
                    {productSearch ? 'No products found' : 'Start typing to search...'}
                  </p>
                ) : (
                  searchResults.map((product) => (
                    <div
                      key={product.sku}
                      className="flex items-center justify-between p-3 bg-slate-900 rounded-lg hover:bg-slate-700 cursor-pointer"
                      onClick={() => addProduct(product)}
                    >
                      <div>
                        <p className="text-white font-medium">{product.sku}</p>
                        <p className="text-slate-400 text-sm">{product.title}</p>
                        {product.fnsku && (
                          <p className="text-slate-500 text-xs">FNSKU: {product.fnsku}</p>
                        )}
                      </div>
                      <Button size="sm">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

