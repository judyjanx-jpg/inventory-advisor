'use client'

import { useState, useRef } from 'react'
import { Upload, X, FileText, CheckCircle2, AlertCircle, Download, Search } from 'lucide-react'
import Button from '@/components/ui/Button'
import * as XLSX from 'xlsx'

interface WarehouseInventoryUploadProps {
  onUploadComplete?: () => void
}

interface ColumnMapping {
  sku: string | null
  available: string | null
  reserved: string | null
  warehouse: string | null
}

interface ParsedRow {
  [key: string]: string | number
}

interface MissingSkuItem {
  sku: string
  available: number
  reserved: number
  warehouseId: number | null
  action: 'ignore' | 'create' | 'map'
  mappedToSku: string | null
}

export default function WarehouseInventoryUpload({ onUploadComplete }: WarehouseInventoryUploadProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'upload' | 'missing-skus' | 'complete'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({
    sku: null,
    available: null,
    reserved: null,
    warehouse: null,
  })
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null)
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string; code: string }>>([])
  const [uploading, setUploading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)
  const [progressMessage, setProgressMessage] = useState<string>('')
  const [missingSkus, setMissingSkus] = useState<MissingSkuItem[]>([])
  const [existingSkus, setExistingSkus] = useState<Set<string>>(new Set())
  const [allInventoryItems, setAllInventoryItems] = useState<Array<{
    sku: string
    available: number
    reserved: number
    warehouseId: number | null
  }>>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [skuSearchTerm, setSkuSearchTerm] = useState<Record<number, string>>({}) // Search term per row
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null) // Which dropdown is open
  const [availableProducts, setAvailableProducts] = useState<Array<{ sku: string; title: string }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const exportFileInputRef = useRef<HTMLInputElement>(null)

  // Fetch warehouses and products on open
  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouses')
      if (res.ok) {
        const data = await res.json()
        setWarehouses(data)
        if (data.length > 0 && !selectedWarehouse) {
          setSelectedWarehouse(data[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error)
    }
  }

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products?flat=true')
      if (res.ok) {
        const data = await res.json()
        const products = Array.isArray(data) ? data : []
        setAvailableProducts(products.map((p: any) => ({ sku: p.sku, title: p.title || p.sku })))
        setExistingSkus(new Set(products.map((p: any) => p.sku)))
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    }
  }

  const handleOpen = () => {
    setIsOpen(true)
    setStep('upload')
    fetchWarehouses()
    fetchProducts()
  }

  const handleClose = () => {
    setIsOpen(false)
    setStep('upload')
    setFile(null)
    setHeaders([])
    setPreviewRows([])
    setMapping({ sku: null, available: null, reserved: null, warehouse: null })
    setUploadResult(null)
    setMissingSkus([])
    setAllInventoryItems([])
    setSearchTerm('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (exportFileInputRef.current) {
      exportFileInputRef.current.value = ''
    }
  }

  const parseFile = async (file: File) => {
    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase()
      let rows: ParsedRow[] = []
      let headers: string[] = []

      if (fileExtension === 'csv') {
        const text = await file.text()
        const lines = text.split('\n').filter(line => line.trim())
        if (lines.length < 2) {
          throw new Error('File must have at least a header row and one data row')
        }

        const delimiter = text.includes('\t') ? '\t' : ','
        headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''))
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''))
          const row: ParsedRow = {}
          headers.forEach((header, idx) => {
            row[header] = values[idx] || ''
          })
          rows.push(row)
        }
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][]

        if (jsonData.length < 2) {
          throw new Error('File must have at least a header row and one data row')
        }

        headers = jsonData[0].map(h => String(h || '').trim())
        
        for (let i = 1; i < jsonData.length; i++) {
          const values = jsonData[i]
          const row: ParsedRow = {}
          headers.forEach((header, idx) => {
            row[header] = values[idx] !== undefined ? String(values[idx]) : ''
          })
          rows.push(row)
        }
      } else {
        throw new Error('Unsupported file format. Please use CSV or Excel (.xlsx, .xls)')
      }

      setHeaders(headers)
      setPreviewRows(rows.slice(0, 10))

      // Auto-detect column mappings
      const autoMapping: ColumnMapping = {
        sku: null,
        available: null,
        reserved: null,
        warehouse: null,
      }

      headers.forEach((header) => {
        const lower = header.toLowerCase()
        if (!autoMapping.sku && (lower.includes('sku') || lower.includes('product') || lower.includes('item'))) {
          autoMapping.sku = header
        }
        if (!autoMapping.available && (lower.includes('available') || lower.includes('qty') || lower.includes('quantity') || lower.includes('stock'))) {
          autoMapping.available = header
        }
        if (!autoMapping.reserved && lower.includes('reserved')) {
          autoMapping.reserved = header
        }
        if (!autoMapping.warehouse && (lower.includes('warehouse') || lower.includes('location'))) {
          autoMapping.warehouse = header
        }
      })

      setMapping(autoMapping)
    } catch (error: any) {
      alert(`Error parsing file: ${error.message}`)
      console.error('Parse error:', error)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setUploadResult(null)
    await parseFile(selectedFile)
  }

  const validateSkus = async () => {
    if (!file || !mapping.sku || !mapping.available) {
      alert('Please select a file and map at least SKU and Available columns')
      return
    }

    if (!selectedWarehouse && !mapping.warehouse) {
      alert('Please select a warehouse or map a warehouse column')
      return
    }

    setValidating(true)
    setUploading(false)
    setUploadResult(null)
    setProgressMessage('Parsing file...')

    try {
      console.log('Step 1: Parsing file...')
      setProgressMessage('Parsing file...')
      // Re-parse the file to get all rows
      const fileExtension = file.name.split('.').pop()?.toLowerCase()
      let allRows: ParsedRow[] = []

      if (fileExtension === 'csv') {
        const text = await file.text()
        const lines = text.split('\n').filter(line => line.trim())
        const delimiter = text.includes('\t') ? '\t' : ','
        const fileHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''))
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''))
          const row: ParsedRow = {}
          fileHeaders.forEach((header, idx) => {
            row[header] = values[idx] || ''
          })
          allRows.push(row)
        }
      } else {
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][]
        const fileHeaders = jsonData[0].map(h => String(h || '').trim())
        
        for (let i = 1; i < jsonData.length; i++) {
          const values = jsonData[i]
          const row: ParsedRow = {}
          fileHeaders.forEach((header, idx) => {
            row[header] = values[idx] !== undefined ? String(values[idx]) : ''
          })
          allRows.push(row)
        }
      }

      console.log(`Step 2: Parsed ${allRows.length} rows, mapping to inventory format...`)
      setProgressMessage(`Processing ${allRows.length} rows...`)

      // Map rows to inventory format
      const inventory = allRows
        .map(row => {
          const sku = String(row[mapping.sku!] || '').trim()
          const available = parseFloat(String(row[mapping.available!] || '0').replace(/[,$"]/g, '')) || 0
          const reserved = mapping.reserved ? parseFloat(String(row[mapping.reserved] || '0').replace(/[,$"]/g, '')) || 0 : 0
          
          let warehouseId = selectedWarehouse
          if (mapping.warehouse && row[mapping.warehouse]) {
            const warehouseName = String(row[mapping.warehouse]).trim()
            const warehouse = warehouses.find(w => 
              w.name.toLowerCase() === warehouseName.toLowerCase() || 
              w.code.toLowerCase() === warehouseName.toLowerCase()
            )
            if (warehouse) {
              warehouseId = warehouse.id
            }
          }

          if (!sku || available <= 0) return null

          return {
            sku,
            available: Math.round(available),
            reserved: Math.round(reserved),
            warehouseId,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      if (inventory.length === 0) {
        throw new Error('No valid inventory items found. Check your column mappings.')
      }

      console.log(`Step 3: Found ${inventory.length} valid inventory items`)
      setAllInventoryItems(inventory)
      setProgressMessage(`Validating ${inventory.length} SKUs...`)

      // Check which SKUs exist - use a direct API call for better performance
      console.log('Step 4: Fetching products from database...')
      setProgressMessage('Checking products in database...')
      const res = await fetch('/api/products?flat=true')
      if (!res.ok) {
        throw new Error('Failed to fetch products for validation')
      }
      const products = await res.json()
      const productArray = Array.isArray(products) ? products : []
      const existingSkuSet = new Set(productArray.map((p: any) => p.sku))
      
      console.log(`  Found ${existingSkuSet.size} products in database`)

      // Check which SKUs exist
      const missing: MissingSkuItem[] = []
      const existing: typeof inventory = []

      for (const item of inventory) {
        if (existingSkuSet.has(item.sku)) {
          existing.push(item)
        } else {
          missing.push({
            sku: item.sku,
            available: item.available,
            reserved: item.reserved,
            warehouseId: item.warehouseId,
            action: 'ignore',
            mappedToSku: null,
          })
        }
      }

      console.log(`Step 5: Validation complete - ${existing.length} existing, ${missing.length} missing`)
      setMissingSkus(missing)
      setExistingSkus(existingSkuSet) // Update state for future use
      setProgressMessage('')

      // If no missing SKUs, proceed directly to upload
      if (missing.length === 0) {
        console.log('  No missing SKUs, proceeding to upload...')
        setValidating(false)
        await processUpload(existing)
      } else {
        console.log(`  ${missing.length} missing SKUs, showing action screen...`)
        setStep('missing-skus')
      }
    } catch (error: any) {
      console.error('Validation error:', error)
      setProgressMessage('')
      alert(`Error: ${error.message || 'Validation failed. Check console for details.'}`)
      setUploadResult({
        success: false,
        message: error.message || 'Validation failed',
      })
    } finally {
      setValidating(false)
    }
  }

  const handleExportMissingSkus = () => {
    const data = missingSkus.map(item => ({
      SKU: item.sku,
      Available: item.available,
      Reserved: item.reserved,
      Warehouse: warehouses.find(w => w.id === item.warehouseId)?.name || '',
      Action: item.action,
      'Map To SKU': item.mappedToSku || '',
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Missing SKUs')
    XLSX.writeFile(wb, `missing-skus-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleImportActions = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    try {
      const arrayBuffer = await selectedFile.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]

      const skuMap = new Map<string, { action: string; mappedToSku: string | null }>()
      jsonData.forEach((row: any) => {
        const sku = String(row.SKU || row.sku || '').trim()
        const action = String(row.Action || row.action || 'ignore').toLowerCase()
        const mappedTo = String(row['Map To SKU'] || row['map to sku'] || row.mappedToSku || '').trim() || null
        if (sku) {
          skuMap.set(sku, {
            action: action === 'create' ? 'create' : action === 'map' ? 'map' : 'ignore',
            mappedToSku: mappedTo,
          })
        }
      })

      // Update missing SKUs with imported actions
      setMissingSkus(prev => prev.map(item => {
        const imported = skuMap.get(item.sku)
        if (imported) {
          return {
            ...item,
            action: imported.action as 'ignore' | 'create' | 'map',
            mappedToSku: imported.mappedToSku,
          }
        }
        return item
      }))

      alert(`Imported actions for ${skuMap.size} SKUs`)
    } catch (error: any) {
      alert(`Error importing file: ${error.message}`)
    }
  }

  const processUpload = async (itemsToUpload: typeof allInventoryItems) => {
    setUploading(true)
    setUploadResult(null)
    setProgressMessage('Starting upload...')

    try {
      // Process missing SKUs based on actions
      const itemsToCreate: Array<{ sku: string; title: string }> = []
      const skuMappings: Array<{ warehouseSku: string; masterSku: string }> = []
      const finalItemsToUpload = [...itemsToUpload] // Start with existing items

      for (const missing of missingSkus) {
        if (missing.action === 'create') {
          itemsToCreate.push({
            sku: missing.sku,
            title: missing.sku, // Default title to SKU
          })
          // Add to items to upload
          finalItemsToUpload.push({
            sku: missing.sku,
            available: missing.available,
            reserved: missing.reserved,
            warehouseId: missing.warehouseId,
          })
        } else if (missing.action === 'map' && missing.mappedToSku) {
          skuMappings.push({
            warehouseSku: missing.sku,
            masterSku: missing.mappedToSku,
          })
          // Map to existing SKU - find or add item
          const existingItem = finalItemsToUpload.find(i => i.sku === missing.mappedToSku && i.warehouseId === missing.warehouseId)
          if (existingItem) {
            existingItem.available += missing.available
            existingItem.reserved += missing.reserved
          } else {
            finalItemsToUpload.push({
              sku: missing.mappedToSku,
              available: missing.available,
              reserved: missing.reserved,
              warehouseId: missing.warehouseId,
            })
          }
        }
        // 'ignore' action - skip this SKU
      }

      // Create new products if needed
      if (itemsToCreate.length > 0) {
        setProgressMessage(`Creating ${itemsToCreate.length} new products...`)
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products: itemsToCreate }),
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(`Failed to create new products: ${errorData.error || 'Unknown error'}`)
        }
        const result = await res.json()
        console.log(`Created ${result.createdCount || itemsToCreate.length} products`)
      }

      // Create SKU mappings if needed (warehouse SKU -> master SKU)
      // OPTIMIZATION: Create mappings in parallel
      if (skuMappings.length > 0) {
        setProgressMessage(`Creating ${skuMappings.length} SKU mappings...`)
        await Promise.all(
          skuMappings.map(async (mapping) => {
            try {
              const res = await fetch(`/api/products/${mapping.masterSku}/mappings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  channel: 'warehouse',
                  channelSku: mapping.warehouseSku,
                }),
              })
              if (!res.ok) {
                const errorData = await res.json()
                // Mapping might already exist, that's okay
                if (!errorData.error?.includes('already exists')) {
                  console.warn(`Mapping for ${mapping.warehouseSku} -> ${mapping.masterSku} failed:`, errorData.error)
                }
              }
            } catch (error: any) {
              // Mapping might already exist, that's okay
              console.log(`Mapping for ${mapping.warehouseSku} -> ${mapping.masterSku} may already exist:`, error.message)
            }
          })
        )
      }

      // Group by warehouse and upload
      const byWarehouse = new Map<number, Array<{ masterSku: string; available: number; reserved: number }>>()
      finalItemsToUpload.forEach(item => {
        if (!item.warehouseId) {
          console.warn(`Skipping item ${item.sku} - no warehouse ID`)
          return
        }
        const whId = item.warehouseId
        if (!byWarehouse.has(whId)) {
          byWarehouse.set(whId, [])
        }
        byWarehouse.get(whId)!.push({
          masterSku: item.sku,
          available: item.available,
          reserved: item.reserved,
        })
      })

      if (byWarehouse.size === 0) {
        throw new Error('No valid inventory items to upload (all items missing warehouse ID)')
      }

      let totalCreated = 0
      let totalUpdated = 0
      let totalSkipped = 0

      for (const [whId, items] of byWarehouse.entries()) {
        const warehouseName = warehouses.find(w => w.id === whId)?.name || `Warehouse ${whId}`
        setProgressMessage(`Uploading ${items.length} items to ${warehouseName}...`)
        
        const res = await fetch(`/api/warehouses/${whId}/inventory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inventory: items }),
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(`Failed to upload to ${warehouseName}: ${errorData.error || 'Unknown error'}`)
        }

        const data = await res.json()
        totalCreated += data.created || 0
        totalUpdated += data.updated || 0
        totalSkipped += data.skipped || 0
        console.log(`Warehouse ${whId}: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped`)
      }

      setProgressMessage('Upload complete!')
      
      // Close modal immediately
      handleClose()
      
      // Show toast notification (non-blocking)
      try {
        const toast = document.createElement('div')
        toast.className = 'fixed top-4 right-4 z-[100] px-6 py-4 rounded-lg shadow-lg bg-emerald-500 text-white flex items-center gap-3'
        toast.innerHTML = `
          <span class="text-xl">✓</span>
          <span class="font-medium">Warehouse inventory updated</span>
        `
        document.body.appendChild(toast)
        
        // Remove toast after 1 second with fade out
        setTimeout(() => {
          try {
            toast.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out'
            toast.style.opacity = '0'
            toast.style.transform = 'translateY(-10px)'
            setTimeout(() => {
              try {
                if (document.body.contains(toast)) {
                  document.body.removeChild(toast)
                }
              } catch (e) {
                // Ignore cleanup errors
              }
            }, 300)
          } catch (e) {
            // Ignore fade out errors
          }
        }, 1000)
      } catch (e) {
        // Ignore toast errors - not critical
        console.warn('Failed to show toast:', e)
      }
      
      // Trigger refresh callback asynchronously to avoid blocking
      if (onUploadComplete) {
        // Use requestIdleCallback if available, otherwise setTimeout
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          requestIdleCallback(() => {
            onUploadComplete()
          }, { timeout: 1000 })
        } else {
          setTimeout(() => {
            onUploadComplete()
          }, 200)
        }
      }
    } catch (error: any) {
      console.error('Upload error:', error)
      setUploadResult({
        success: false,
        message: error.message || 'Upload failed',
      })
      setProgressMessage(null)
    } finally {
      setUploading(false)
    }
  }

  const handleProcessMissingSkus = async () => {
    // Include all existing SKUs plus any missing SKUs that will be processed
    const itemsToProcess = allInventoryItems.filter(item => {
      // Include existing SKUs
      if (existingSkus.has(item.sku)) {
        return true
      }
      // Include missing SKUs that have actions set (not 'ignore')
      const missingItem = missingSkus.find(m => m.sku === item.sku)
      return missingItem && missingItem.action !== 'ignore'
    })
    
    await processUpload(itemsToProcess)
  }

  const filteredMissingSkus = missingSkus.filter(item =>
    item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!isOpen) {
    return (
      <Button onClick={handleOpen} variant="outline">
        <Upload className="w-4 h-4 mr-2" />
        Bulk Upload Warehouse Inventory
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-white">Bulk Upload Warehouse Inventory</h2>
            <p className="text-sm text-slate-400 mt-1">
              {step === 'upload' && 'Upload Excel or CSV file and map columns'}
              {step === 'missing-skus' && `${missingSkus.length} SKUs not found - choose action for each`}
              {step === 'complete' && 'Upload complete!'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {step === 'upload' && (
            <>
              {/* File Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Select File (CSV or Excel)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-500/20 file:text-cyan-400 hover:file:bg-cyan-500/30"
                />
                {file && (
                  <p className="mt-2 text-sm text-slate-400 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {/* Warehouse Selection */}
              {warehouses.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Warehouse {mapping.warehouse ? '(or map from file)' : '(required)'}
                  </label>
                  <select
                    value={selectedWarehouse || ''}
                    onChange={(e) => setSelectedWarehouse(parseInt(e.target.value))}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    disabled={!!mapping.warehouse}
                  >
                    <option value="">Select warehouse...</option>
                    {warehouses.map(wh => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name} ({wh.code})
                      </option>
                    ))}
                  </select>
                  {mapping.warehouse && (
                    <p className="mt-1 text-xs text-slate-500">
                      Warehouse will be determined from the "{mapping.warehouse}" column
                    </p>
                  )}
                </div>
              )}

              {/* Column Mapping */}
              {headers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">
                    Map Columns
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">SKU *</label>
                      <select
                        value={mapping.sku || ''}
                        onChange={(e) => setMapping({ ...mapping, sku: e.target.value || null })}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Select column...</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Available *</label>
                      <select
                        value={mapping.available || ''}
                        onChange={(e) => setMapping({ ...mapping, available: e.target.value || null })}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Select column...</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Reserved (optional)</label>
                      <select
                        value={mapping.reserved || ''}
                        onChange={(e) => setMapping({ ...mapping, reserved: e.target.value || null })}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Select column...</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Warehouse (optional)</label>
                      <select
                        value={mapping.warehouse || ''}
                        onChange={(e) => {
                          setMapping({ ...mapping, warehouse: e.target.value || null })
                          if (e.target.value) {
                            setSelectedWarehouse(null)
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Select column...</option>
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              {previewRows.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Preview (first 10 rows)
                  </label>
                  <div className="overflow-x-auto border border-slate-700 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-800">
                        <tr>
                          {headers.map(h => (
                            <th key={h} className="px-3 py-2 text-left text-slate-300 font-medium border-b border-slate-700">
                              {h}
                              {mapping.sku === h && <span className="ml-1 text-cyan-400">(SKU)</span>}
                              {mapping.available === h && <span className="ml-1 text-cyan-400">(Available)</span>}
                              {mapping.reserved === h && <span className="ml-1 text-cyan-400">(Reserved)</span>}
                              {mapping.warehouse === h && <span className="ml-1 text-cyan-400">(Warehouse)</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className="border-b border-slate-700/50">
                            {headers.map(h => (
                              <td key={h} className="px-3 py-2 text-slate-400">
                                {String(row[h] || '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={validateSkus}
                  disabled={!file || !mapping.sku || !mapping.available || (!selectedWarehouse && !mapping.warehouse) || validating}
                  loading={validating}
                >
                  {validating ? (
                    <>
                      <svg className="w-4 h-4 mr-2 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {progressMessage || 'Validating...'}
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 mr-2" />
                      Validate & Continue
                    </>
                  )}
                </Button>
                {progressMessage && (
                  <p className="text-xs text-slate-400 mt-2">{progressMessage}</p>
                )}
              </div>
            </>
          )}

          {step === 'missing-skus' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search SKUs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleExportMissingSkus} size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  <div>
                    <input
                      ref={exportFileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleImportActions}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportFileInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Import Actions
                    </Button>
                  </div>
                </div>
              </div>

              <div className="border border-slate-700 rounded-lg overflow-hidden">
                <div className="bg-slate-800 px-4 py-3 border-b border-slate-700">
                  <div className="grid grid-cols-12 gap-4 text-xs font-medium text-slate-300">
                    <div className="col-span-3">SKU</div>
                    <div className="col-span-2">Available</div>
                    <div className="col-span-2">Reserved</div>
                    <div className="col-span-2">Action</div>
                    <div className="col-span-3">Map To SKU</div>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {filteredMissingSkus.map((item, idx) => (
                    <div key={idx} className="px-4 py-3 border-b border-slate-700/50 hover:bg-slate-800/30">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-3 font-mono text-sm text-white">{item.sku}</div>
                        <div className="col-span-2 text-slate-400">{item.available}</div>
                        <div className="col-span-2 text-slate-400">{item.reserved}</div>
                        <div className="col-span-2">
                          <select
                            value={item.action}
                            onChange={(e) => {
                              const newSkus = [...missingSkus]
                              newSkus[idx].action = e.target.value as 'ignore' | 'create' | 'map'
                              if (e.target.value !== 'map') {
                                newSkus[idx].mappedToSku = null
                              }
                              setMissingSkus(newSkus)
                            }}
                            className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                          >
                            <option value="ignore">Ignore</option>
                            <option value="create">Create New</option>
                            <option value="map">Map To Existing</option>
                          </select>
                        </div>
                        <div className="col-span-3">
                          {item.action === 'map' ? (
                            <div className="relative">
                              <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                                <input
                                  type="text"
                                  placeholder="Type to search SKU..."
                                  value={openDropdownIndex === idx ? (skuSearchTerm[idx] || '') : (item.mappedToSku || '')}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    setSkuSearchTerm({ ...skuSearchTerm, [idx]: value })
                                    // Clear selection when typing
                                    if (value && item.mappedToSku) {
                                      const newSkus = [...missingSkus]
                                      newSkus[idx].mappedToSku = null
                                      setMissingSkus(newSkus)
                                    }
                                  }}
                                  onFocus={() => {
                                    setOpenDropdownIndex(idx)
                                    // When focusing, show search term if exists, otherwise show selected SKU
                                    if (!skuSearchTerm[idx] && item.mappedToSku) {
                                      setSkuSearchTerm({ ...skuSearchTerm, [idx]: item.mappedToSku })
                                    }
                                  }}
                                  onBlur={() => {
                                    // Delay to allow click on dropdown item
                                    setTimeout(() => {
                                      setOpenDropdownIndex(null)
                                      // Clear search term if we have a selected SKU
                                      if (item.mappedToSku) {
                                        setSkuSearchTerm({ ...skuSearchTerm, [idx]: '' })
                                      }
                                    }, 200)
                                  }}
                                  className="w-full pl-8 pr-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                                />
                              </div>
                              {openDropdownIndex === idx && (
                                <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                  {availableProducts
                                    .filter(p => {
                                      const search = (skuSearchTerm[idx] || '').toLowerCase()
                                      return !search || p.sku.toLowerCase().includes(search)
                                    })
                                    .slice(0, 100)
                                    .map(p => (
                                      <button
                                        key={p.sku}
                                        type="button"
                                        onMouseDown={(e) => {
                                          // Use onMouseDown to prevent blur from firing first
                                          e.preventDefault()
                                          const newSkus = [...missingSkus]
                                          newSkus[idx].mappedToSku = p.sku
                                          setMissingSkus(newSkus)
                                          setSkuSearchTerm({ ...skuSearchTerm, [idx]: '' })
                                          setOpenDropdownIndex(null)
                                        }}
                                        className={`w-full text-left px-3 py-2 text-sm font-mono hover:bg-slate-700 transition-colors ${
                                          item.mappedToSku === p.sku ? 'bg-cyan-500/20 text-cyan-400' : 'text-white'
                                        }`}
                                      >
                                        {p.sku}
                                      </button>
                                    ))}
                                  {availableProducts.filter(p => {
                                    const search = (skuSearchTerm[idx] || '').toLowerCase()
                                    return !search || p.sku.toLowerCase().includes(search)
                                  }).length === 0 && (
                                    <div className="px-3 py-2 text-sm text-slate-400">No SKUs found</div>
                                  )}
                                  {availableProducts.filter(p => {
                                    const search = (skuSearchTerm[idx] || '').toLowerCase()
                                    return !search || p.sku.toLowerCase().includes(search)
                                  }).length > 100 && (
                                    <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-700">
                                      Showing first 100 results. Refine search for more.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 text-sm">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setStep('upload')}>
                  Back
                </Button>
                <Button
                  onClick={handleProcessMissingSkus}
                  disabled={uploading}
                  loading={uploading}
                >
                  {uploading ? (
                    <>
                      <svg className="w-4 h-4 mr-2 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Process & Upload
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {step === 'complete' && uploadResult && (
            <div className={`p-6 rounded-lg flex items-center gap-3 ${
              uploadResult.success ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-red-500/20 border border-red-500/30'
            }`}>
              {uploadResult.success ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-400" />
              )}
              <p className={uploadResult.success ? 'text-emerald-400 text-lg' : 'text-red-400 text-lg'}>
                {uploadResult.message}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
