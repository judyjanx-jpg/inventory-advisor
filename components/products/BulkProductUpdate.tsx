'use client'

import { useState, useRef, useCallback } from 'react'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  ArrowRight,
  RefreshCw,
  ChevronDown
} from 'lucide-react'
import * as XLSX from 'xlsx'

interface Supplier {
  id: number
  name: string
}

interface Product {
  sku: string
  [key: string]: any
}

interface BulkProductUpdateProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  suppliers: Supplier[]
  products: Product[]
}

// System columns that can be mapped
const SYSTEM_COLUMNS = [
  { key: 'sku', label: 'SKU (Required)', required: true, type: 'text' },
  { key: 'supplierId', label: 'Supplier', required: false, type: 'supplier' },
  { key: 'supplierSku', label: 'Supplier SKU', required: false, type: 'text' },
  { key: 'cost', label: 'Unit Cost', required: false, type: 'number' },
  { key: 'price', label: 'Price', required: false, type: 'number' },
  { key: 'mapPrice', label: 'MAP Price', required: false, type: 'number' },
  { key: 'msrp', label: 'MSRP', required: false, type: 'number' },
  { key: 'labelType', label: 'Label Type', required: false, type: 'labelType' },
  { key: 'transparencyEnabled', label: 'Transparency Enabled', required: false, type: 'boolean' },
  { key: 'prepType', label: 'Prep Type', required: false, type: 'prepType' },
  { key: 'labelingRequired', label: 'Labeling Required', required: false, type: 'boolean' },
  { key: 'warehouseLocation', label: 'Warehouse Location', required: false, type: 'text' },
  { key: 'category', label: 'Category', required: false, type: 'text' },
  { key: 'status', label: 'Status', required: false, type: 'status' },
  { key: 'isHidden', label: 'Hidden', required: false, type: 'boolean' },
  { key: 'weightOz', label: 'Weight (oz)', required: false, type: 'number' },
  { key: 'lengthIn', label: 'Length (in)', required: false, type: 'number' },
  { key: 'widthIn', label: 'Width (in)', required: false, type: 'number' },
  { key: 'heightIn', label: 'Height (in)', required: false, type: 'number' },
  { key: 'unitsPerCase', label: 'Units Per Case', required: false, type: 'number' },
  { key: 'notes', label: 'Notes', required: false, type: 'text' },
]

const LABEL_TYPES = [
  { value: 'fnsku_only', label: 'FNSKU Only' },
  { value: 'fnsku_tp', label: 'FNSKU + Transparency' },
  { value: 'tp_only', label: 'Transparency Only' },
]

const PREP_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'poly_bag', label: 'Poly Bag' },
  { value: 'bubble_wrap', label: 'Bubble Wrap' },
  { value: 'sticker', label: 'Sticker' },
]

const STATUS_TYPES = [
  { value: 'active', label: 'Active' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'liquidate', label: 'Liquidate' },
]

type Step = 'select' | 'upload' | 'map' | 'preview' | 'result'

export default function BulkProductUpdate({ isOpen, onClose, onComplete, suppliers, products }: BulkProductUpdateProps) {
  const [step, setStep] = useState<Step>('select')
  const [selectedFields, setSelectedFields] = useState<string[]>(['sku'])
  const [uploadedData, setUploadedData] = useState<any[]>([])
  const [fileColumns, setFileColumns] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = () => {
    setStep('select')
    setSelectedFields(['sku'])
    setUploadedData([])
    setFileColumns([])
    setColumnMapping({})
    setResult({ success: 0, failed: 0, errors: [] })
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  // Export template with selected fields
  const exportTemplate = (prefilled: boolean) => {
    const headers = selectedFields.map(key => {
      const col = SYSTEM_COLUMNS.find(c => c.key === key)
      return col?.label || key
    })
    
    let rows: any[][] = []
    
    if (prefilled && products.length > 0) {
      // Export with current product data
      rows = products.map(product => {
        return selectedFields.map(key => {
          const value = product[key]
          
          // Special handling for supplier - convert ID to name
          if (key === 'supplierId' && value) {
            const supplier = suppliers.find(s => s.id === value)
            return supplier?.name || ''
          }
          
          // Boolean values
          if (typeof value === 'boolean') {
            return value ? 'true' : 'false'
          }
          
          // Numbers (cost, price, etc)
          if (value !== null && value !== undefined) {
            return String(value)
          }
          
          return ''
        })
      })
    } else {
      // Just a sample row for blank template
      const sampleRow = selectedFields.map(key => {
        switch (key) {
          case 'sku': return 'YOUR-SKU-001'
          case 'supplierId': return suppliers[0]?.name || 'Supplier Name'
          case 'cost': return '10.00'
          case 'price': return '29.99'
          case 'labelType': return 'fnsku_only'
          case 'transparencyEnabled': return 'false'
          case 'prepType': return 'none'
          case 'status': return 'active'
          case 'isHidden': return 'false'
          default: return ''
        }
      })
      rows = [sampleRow]
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    
    // Auto-size columns
    const colWidths = headers.map(h => ({ wch: Math.max(h.length + 2, 15) }))
    ws['!cols'] = colWidths
    
    const filename = prefilled ? 'product_bulk_update_data.xlsx' : 'product_bulk_update_template.xlsx'
    XLSX.writeFile(wb, filename)
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
      
      if (json.length < 2) {
        alert('File must have headers and at least one data row')
        return
      }

      const headers = json[0] as string[]
      const rows = json.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''))
      
      setFileColumns(headers)
      setUploadedData(rows.map(row => {
        const obj: Record<string, any> = {}
        headers.forEach((h, i) => {
          obj[h] = row[i]
        })
        return obj
      }))

      // Auto-map columns with exact or similar names
      const autoMapping: Record<string, string> = {}
      headers.forEach(header => {
        const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '')
        const match = SYSTEM_COLUMNS.find(col => {
          const normalizedCol = col.label.toLowerCase().replace(/[^a-z0-9]/g, '')
          const normalizedKey = col.key.toLowerCase()
          return normalizedHeader === normalizedCol || normalizedHeader === normalizedKey || 
                 normalizedHeader.includes(normalizedKey) || normalizedKey.includes(normalizedHeader)
        })
        if (match) {
          autoMapping[match.key] = header
        }
      })
      setColumnMapping(autoMapping)
      setStep('map')
    }
    reader.readAsBinaryString(file)
  }

  // Process the bulk update
  const processBulkUpdate = async () => {
    if (!columnMapping.sku) {
      alert('SKU column mapping is required')
      return
    }

    setProcessing(true)
    const errors: string[] = []
    let success = 0
    let failed = 0

    for (const row of uploadedData) {
      const sku = row[columnMapping.sku]
      if (!sku) {
        errors.push(`Row missing SKU`)
        failed++
        continue
      }

      // Build update data
      const updateData: Record<string, any> = {}
      
      for (const [systemKey, fileCol] of Object.entries(columnMapping)) {
        if (systemKey === 'sku') continue
        
        const value = row[fileCol]
        if (value === undefined || value === '') continue

        const colDef = SYSTEM_COLUMNS.find(c => c.key === systemKey)
        if (!colDef) continue

        // Convert value based on type
        switch (colDef.type) {
          case 'number':
            const num = parseFloat(value)
            if (!isNaN(num)) updateData[systemKey] = num
            break
          case 'boolean':
            updateData[systemKey] = value === true || value === 'true' || value === 'yes' || value === '1' || value === 'TRUE' || value === 'Yes'
            break
          case 'supplier':
            // Find supplier by name
            const supplier = suppliers.find(s => s.name.toLowerCase() === String(value).toLowerCase())
            if (supplier) updateData.supplierId = supplier.id
            break
          case 'labelType':
            if (LABEL_TYPES.some(lt => lt.value === value)) updateData[systemKey] = value
            break
          case 'prepType':
            if (PREP_TYPES.some(pt => pt.value === value)) updateData[systemKey] = value
            break
          case 'status':
            if (STATUS_TYPES.some(st => st.value === value)) updateData[systemKey] = value
            break
          default:
            updateData[systemKey] = String(value)
        }
      }

      if (Object.keys(updateData).length === 0) {
        errors.push(`${sku}: No valid fields to update`)
        failed++
        continue
      }

      try {
        const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        })

        if (res.ok) {
          success++
        } else {
          const data = await res.json()
          errors.push(`${sku}: ${data.error || 'Update failed'}`)
          failed++
        }
      } catch (err) {
        errors.push(`${sku}: Network error`)
        failed++
      }
    }

    setResult({ success, failed, errors })
    setProcessing(false)
    setStep('result')
    
    if (success > 0) {
      onComplete()
    }
  }

  const toggleField = (key: string) => {
    if (key === 'sku') return // SKU is always required
    setSelectedFields(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Bulk Update Products"
      size="xl"
    >
      {/* Step 1: Select Fields to Update */}
      {step === 'select' && (
        <div className="space-y-6">
          <p className="text-slate-400">
            Select which fields you want to update, then export a template or upload your own file.
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Supplier & Sourcing */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-cyan-400">Supplier & Sourcing</h4>
              {SYSTEM_COLUMNS.filter(c => ['supplierId', 'supplierSku', 'cost'].includes(c.key)).map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(col.key)}
                    onChange={() => toggleField(col.key)}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>

            {/* Pricing */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-cyan-400">Pricing</h4>
              {SYSTEM_COLUMNS.filter(c => ['price', 'mapPrice', 'msrp'].includes(c.key)).map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(col.key)}
                    onChange={() => toggleField(col.key)}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>

            {/* Labeling & Prep */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-cyan-400">Labeling & Prep</h4>
              {SYSTEM_COLUMNS.filter(c => ['labelType', 'transparencyEnabled', 'prepType', 'labelingRequired'].includes(c.key)).map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(col.key)}
                    onChange={() => toggleField(col.key)}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>

            {/* Organization */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-cyan-400">Organization</h4>
              {SYSTEM_COLUMNS.filter(c => ['warehouseLocation', 'category', 'status', 'isHidden'].includes(c.key)).map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(col.key)}
                    onChange={() => toggleField(col.key)}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>

            {/* Physical */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-cyan-400">Physical</h4>
              {SYSTEM_COLUMNS.filter(c => ['weightOz', 'lengthIn', 'widthIn', 'heightIn', 'unitsPerCase'].includes(c.key)).map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(col.key)}
                    onChange={() => toggleField(col.key)}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>

            {/* Other */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-cyan-400">Other</h4>
              {SYSTEM_COLUMNS.filter(c => ['notes'].includes(c.key)).map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(col.key)}
                    onChange={() => toggleField(col.key)}
                    className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-700">
            <p className="text-sm text-slate-400">Export Options:</p>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => exportTemplate(false)} variant="outline" className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Blank Template
              </Button>
              <Button onClick={() => exportTemplate(true)} variant="secondary" className="flex-1">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export with Data ({products.length})
              </Button>
            </div>
            <p className="text-sm text-slate-400 mt-4">Or upload your own file:</p>
            <Button onClick={() => setStep('upload')} className="w-full">
              <Upload className="w-4 h-4 mr-2" />
              Upload File
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Upload File */}
      {step === 'upload' && (
        <div className="space-y-6">
          <div 
            className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-cyan-500/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileSpreadsheet className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-white font-medium mb-2">Click to upload or drag & drop</p>
            <p className="text-sm text-slate-400">Excel (.xlsx, .xls) or CSV files</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          
          <div className="p-4 bg-slate-800/50 rounded-lg">
            <h4 className="text-sm font-medium text-white mb-2">File Requirements:</h4>
            <ul className="text-sm text-slate-400 space-y-1">
              <li>• First row must contain column headers</li>
              <li>• Must include a SKU column to identify products</li>
              <li>• You'll map your columns to system fields in the next step</li>
            </ul>
          </div>

          <ModalFooter>
            <Button variant="ghost" onClick={() => setStep('select')}>
              Back
            </Button>
          </ModalFooter>
        </div>
      )}

      {/* Step 3: Map Columns */}
      {step === 'map' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-slate-400">
              Map your file columns to system fields. Found {uploadedData.length} rows.
            </p>
            {!columnMapping.sku && (
              <span className="text-sm text-red-400">⚠ SKU mapping required</span>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto space-y-3">
            {SYSTEM_COLUMNS.map(col => (
              <div key={col.key} className="flex items-center gap-4">
                <div className="w-1/3">
                  <span className={`text-sm ${col.required ? 'text-white font-medium' : 'text-slate-300'}`}>
                    {col.label}
                    {col.required && <span className="text-red-400 ml-1">*</span>}
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500" />
                <select
                  value={columnMapping[col.key] || ''}
                  onChange={(e) => setColumnMapping({ ...columnMapping, [col.key]: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Not mapped --</option>
                  {fileColumns.map(fc => (
                    <option key={fc} value={fc}>{fc}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview */}
          {uploadedData.length > 0 && columnMapping.sku && (
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <h4 className="text-sm font-medium text-white mb-2">Preview (first 3 rows):</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      {Object.entries(columnMapping).filter(([_, v]) => v).map(([key, _]) => (
                        <th key={key} className="text-left py-2 px-2">{SYSTEM_COLUMNS.find(c => c.key === key)?.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadedData.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/50">
                        {Object.entries(columnMapping).filter(([_, v]) => v).map(([key, fileCol]) => (
                          <td key={key} className="py-2 px-2 text-slate-300">{String(row[fileCol] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <ModalFooter>
            <Button variant="ghost" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button onClick={processBulkUpdate} disabled={!columnMapping.sku || processing} loading={processing}>
              {processing ? 'Processing...' : `Update ${uploadedData.length} Products`}
            </Button>
          </ModalFooter>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 'result' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{result.success}</p>
              <p className="text-sm text-green-400">Updated Successfully</p>
            </div>
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
              <X className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{result.failed}</p>
              <p className="text-sm text-red-400">Failed</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="p-4 bg-slate-800/50 rounded-lg max-h-[200px] overflow-y-auto">
              <h4 className="text-sm font-medium text-white mb-2">Errors:</h4>
              <ul className="text-sm text-red-400 space-y-1">
                {result.errors.slice(0, 20).map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
                {result.errors.length > 20 && (
                  <li className="text-slate-400">...and {result.errors.length - 20} more</li>
                )}
              </ul>
            </div>
          )}

          <ModalFooter>
            <Button variant="ghost" onClick={handleClose}>
              Close
            </Button>
            <Button onClick={resetState}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Upload Another
            </Button>
          </ModalFooter>
        </div>
      )}
    </Modal>
  )
}

