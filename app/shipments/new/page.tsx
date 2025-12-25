'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Package, Plus, Trash2, Save, X, Upload, FileSpreadsheet, ArrowRight } from 'lucide-react'

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
  const [showBulkInput, setShowBulkInput] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkError, setBulkError] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        const defaultWarehouse = data.find((w: any) => w.isDefault)
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

  const clearAllItems = () => {
    if (items.length === 0) return
    if (confirm(`Are you sure you want to remove all ${items.length} items from this shipment?`)) {
      setItems([])
    }
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

  // Parse bulk text input like "MJBC116x10, MJBC118x20" or "MJBC116 x 10, MJBC118 x 20"
  const parseBulkText = async (text: string, overwrite: boolean = false) => {
    setBulkError('')
    // Split by newlines (and commas for backward compatibility)
    const lines = text.split(/[\n,]/).map(s => s.trim()).filter(s => s)
    const parsed: { sku: string; qty: number }[] = []
    const errors: string[] = []

    for (const line of lines) {
      // Remove any "x" or "X" characters (ignore them)
      const cleanedLine = line.replace(/[xX]/g, ' ')
      
      // Match patterns:
      // - SKU followed by whitespace (tab or spaces) and quantity
      // - SKU<TAB>QTY
      // - SKU QTY
      // - SKU  QTY (multiple spaces)
      // Examples: "MJ925BCG124	120", "MJ925BCG130 100", "MJ925BCS120 x 250"
      const match = cleanedLine.match(/^([A-Za-z0-9\-_]+)[\s\t]+(\d+)$/)
      if (match) {
        const sku = match[1].toUpperCase().trim()
        const qty = parseInt(match[2].trim())
        if (sku && !isNaN(qty) && qty > 0) {
          parsed.push({ sku, qty })
        } else {
          errors.push(`Invalid entry: "${line}" (could not parse SKU or quantity)`)
        }
      } else {
        errors.push(`Invalid format: "${line}" (expected: SKU followed by tab/space and quantity)`)
      }
    }

    if (errors.length > 0 && parsed.length === 0) {
      // Only show errors if we didn't parse anything at all
      setBulkError(errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n... and ${errors.length - 10} more errors` : ''))
      return
    }
    
    // If we parsed some items but had errors, just warn (don't block)
    if (errors.length > 0 && parsed.length > 0) {
      setBulkError(`Warning: ${errors.length} line(s) could not be parsed, but ${parsed.length} item(s) were added.`)
    }

    if (parsed.length === 0) {
      setBulkError('No valid entries found')
      return
    }

    // Fetch all products to match SKUs
    try {
      const res = await fetch('/api/products?flat=true&showHidden=false')
      const products = await res.json()
      
      const newItems: ShipmentItem[] = []
      const notFound: string[] = []

      for (const { sku, qty } of parsed) {
        const product = products.find((p: any) => p.sku.toUpperCase() === sku)
        if (product) {
          newItems.push({
            sku: product.sku,
            productName: product.title,
            fnsku: product.fnsku,
            requestedQty: qty,
            adjustedQty: optimalPlacementEnabled ? Math.ceil(qty / 5) * 5 : qty,
            availableQty: 0, // Will be fetched if needed
            product,
          })
        } else {
          notFound.push(sku)
        }
      }

      if (notFound.length > 0) {
        setBulkError(`SKUs not found: ${notFound.join(', ')}`)
      }

      if (newItems.length > 0) {
        // Overwrite existing items or append to them
        if (overwrite) {
          setItems(newItems)
        } else {
          setItems([...items, ...newItems])
        }
        setBulkText('')
        if (notFound.length === 0) {
          setShowBulkInput(false)
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error)
      setBulkError('Failed to fetch products')
    }
  }

  // Handle Excel/CSV file upload
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setBulkError('')
    
    try {
      const fileName = file.name.toLowerCase()
      let rows: string[][] = []

      // Handle Excel files (.xlsx, .xls) using xlsx library
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const XLSX = await import('xlsx')
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        // Get data as array of arrays, all values as strings
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false }) as any[][]
        rows = jsonData.map(row => row.map((cell: any) => String(cell || '').trim()))
      } else {
        // Handle CSV/TSV as text
        const text = await file.text()
        const lines = text.split('\n').filter(line => line.trim())
        const delimiter = text.includes('\t') ? '\t' : ','
        rows = lines.map(line => line.split(delimiter).map(cell => cell.trim().replace(/^["']|["']$/g, '')))
      }

      if (rows.length === 0) {
        setBulkError('File is empty')
        return
      }

      // Find SKU and QTY columns from header
      const header = rows[0].map(h => h.toUpperCase())
      let skuCol = header.findIndex(h => 
        h === 'SKU' || 
        h === 'SELLER SKU' || 
        h === 'SELLER-SKU' || 
        h === 'MERCHANT SKU' ||
        h === 'MSKU'
      )
      let qtyCol = header.findIndex(h => 
        h === 'QTY' || 
        h === 'QUANTITY' || 
        h === 'UNITS' || 
        h === 'COUNT' ||
        h === 'SHIP QTY' ||
        h === 'SHIPMENT QTY'
      )

      // If no header found, assume column 0 = SKU, column 1 = QTY
      if (skuCol === -1) skuCol = 0
      if (qtyCol === -1) qtyCol = 1

      const dataRows = rows.slice(1) // Skip header
      const entries: string[] = []
      const skipped: string[] = []

      for (const row of dataRows) {
        const sku = row[skuCol]?.trim()
        const qtyStr = row[qtyCol]?.trim()
        const qty = parseInt(qtyStr) || 0
        
        if (sku && qty > 0) {
          entries.push(`${sku}x${qty}`)
        } else if (sku && !qty) {
          skipped.push(sku)
        }
      }

      if (entries.length > 0) {
        // Overwrite: replace all existing items with uploaded ones
        await parseBulkText(entries.join(', '), true)
        
        if (skipped.length > 0) {
          setBulkError(`Imported ${entries.length} items. Skipped ${skipped.length} items with qty=0 or invalid qty.`)
        }
      } else {
        setBulkError(`No valid SKU/QTY data found in file.\n\nExpected columns: SKU (or SELLER SKU) and QTY (or QUANTITY)\nFound headers: ${header.slice(0, 5).join(', ')}${header.length > 5 ? '...' : ''}`)
      }
    } catch (error: any) {
      console.error('Error reading file:', error)
      setBulkError(`Failed to read file: ${error.message || 'Unknown error'}. Please use CSV or Excel format.`)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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

    // Validate quantities (only check that qty > 0)
    for (const item of items) {
      if (item.requestedQty <= 0) {
        alert(`Please enter a quantity for ${item.productName}`)
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
            <Button onClick={saveShipment} disabled={loading || items.length === 0}>
              <ArrowRight className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save & Continue'}
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
              <CardTitle>Items {items.length > 0 && <span className="text-slate-400 text-base">({items.length})</span>}</CardTitle>
              <div className="flex gap-2">
                {items.length > 0 && (
                  <Button variant="outline" onClick={clearAllItems}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShowBulkInput(!showBulkInput)}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Bulk Entry
                </Button>
                <Button onClick={() => setShowAddProduct(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Bulk Input Panel - Supports SKU tab/space quantity format */}
            {showBulkInput && (
              <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h3 className="text-sm font-medium text-slate-300 mb-3">Bulk Add Items</h3>
                
                {/* Text Input */}
                <div className="mb-4">
                  <label className="block text-xs text-slate-400 mb-1">
                    Paste SKUs with quantities (one per line): SKU followed by tab or space and quantity
                  </label>
                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="MJ925BCG124	120
MJ925BCG130	100
MJ925BCS120	250"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm h-32 font-mono"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Format: SKU [tab or space] quantity. "x" characters are ignored. Example: MJ925BCG124 120 or MJ925BCG124	120
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => parseBulkText(bulkText)} disabled={!bulkText.trim()}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Items
                    </Button>
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 border-t border-slate-700"></div>
                  <span className="text-xs text-slate-500">OR</span>
                  <div className="flex-1 border-t border-slate-700"></div>
                </div>

                {/* Excel Upload */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Upload Excel/CSV file with SKU and QTY columns
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.tsv"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload File
                  </Button>
                  <span className="text-xs text-slate-500 ml-2">CSV, Excel, or TSV</span>
                </div>

                {/* Error Display */}
                {bulkError && (
                  <div className="mt-3 p-2 bg-red-900/30 border border-red-500/30 rounded text-red-400 text-sm whitespace-pre-wrap">
                    {bulkError}
                  </div>
                )}
              </div>
            )}

            {items.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No items added yet</p>
                <p className="text-sm mt-1">Click "Add Product" or "Bulk Entry" to get started</p>
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

        {/* Spacer for sticky footer */}
        <div className="h-24"></div>

        {/* Sticky Footer Action Bar */}
        {items.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900 via-slate-900 to-slate-900/95 border-t border-slate-700 p-4 z-30">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="text-slate-300">
                <span className="font-bold text-white">{totalSkus}</span> SKUs · <span className="font-bold text-white">{totalUnits}</span> units
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button onClick={saveShipment} disabled={loading}>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  {loading ? 'Saving...' : 'Save & Continue'}
                </Button>
              </div>
            </div>
          </div>
        )}

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

