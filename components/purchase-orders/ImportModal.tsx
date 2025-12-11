'use client'

import { useState, useRef } from 'react'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (items: ImportedItem[]) => void
}

interface ImportedItem {
  sku: string
  quantity: number
  unitCost?: number
  productName?: string
}

interface ColumnMapping {
  sku: string | null
  quantity: string | null
  unitCost: string | null
  productName: string | null
}

export default function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [file, setFile] = useState<File | null>(null)
  const [rawData, setRawData] = useState<any[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    sku: null,
    quantity: null,
    unitCost: null,
    productName: null,
  })
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Enhanced CSV parser that handles quoted fields, commas in values, etc.
  const parseCSV = (text: string): string[][] => {
    const lines: string[] = []
    let currentLine = ''
    let inQuotes = false
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const nextChar = text[i + 1]
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentLine += '"'
          i++ // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes
        }
      } else if (char === '\n' && !inQuotes) {
        // End of line
        lines.push(currentLine)
        currentLine = ''
      } else if (char === '\r' && nextChar === '\n' && !inQuotes) {
        // Windows line ending
        lines.push(currentLine)
        currentLine = ''
        i++ // Skip \n
      } else {
        currentLine += char
      }
    }
    
    // Add last line if not empty
    if (currentLine.trim()) {
      lines.push(currentLine)
    }
    
    // Parse each line into columns
    return lines.map(line => {
      const columns: string[] = []
      let currentCol = ''
      let inQuotes = false
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const nextChar = line[i + 1]
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            currentCol += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === ',' && !inQuotes) {
          columns.push(currentCol.trim())
          currentCol = ''
        } else {
          currentCol += char
        }
      }
      
      // Add last column
      columns.push(currentCol.trim())
      return columns
    })
  }

  // Auto-detect column mappings based on common column name patterns
  const autoDetectMappings = (headers: string[]): ColumnMapping => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim())
    
    const mapping: ColumnMapping = {
      sku: null,
      quantity: null,
      unitCost: null,
      productName: null,
    }
    
    // SKU patterns
    const skuPatterns = ['sku', 'master_sku', 'master sku', 'product_sku', 'product sku', 'item_sku', 'item sku', 'code', 'product_code', 'product code']
    for (const pattern of skuPatterns) {
      const index = normalizedHeaders.findIndex(h => h.includes(pattern))
      if (index >= 0) {
        mapping.sku = headers[index]
        break
      }
    }
    
    // Quantity patterns
    const qtyPatterns = ['quantity', 'qty', 'qty_ordered', 'qty ordered', 'quantity_ordered', 'quantity ordered', 'ordered', 'amount', 'units']
    for (const pattern of qtyPatterns) {
      const index = normalizedHeaders.findIndex(h => h.includes(pattern))
      if (index >= 0) {
        mapping.quantity = headers[index]
        break
      }
    }
    
    // Unit Cost patterns
    const costPatterns = ['cost', 'unit_cost', 'unit cost', 'price', 'unit_price', 'unit price', 'unitcost', 'unitprice', 'each', 'per_unit', 'per unit']
    for (const pattern of costPatterns) {
      const index = normalizedHeaders.findIndex(h => h.includes(pattern))
      if (index >= 0) {
        mapping.unitCost = headers[index]
        break
      }
    }
    
    // Product Name patterns
    const namePatterns = ['product', 'name', 'title', 'description', 'product_name', 'product name', 'product_title', 'product title', 'item_name', 'item name']
    for (const pattern of namePatterns) {
      const index = normalizedHeaders.findIndex(h => h.includes(pattern))
      if (index >= 0) {
        mapping.productName = headers[index]
        break
      }
    }
    
    return mapping
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)

    try {
      const XLSX = await import('xlsx')
      const arrayBuffer = await selectedFile.arrayBuffer()

      let jsonData: any[][]

      if (selectedFile.name.endsWith('.csv')) {
        const text = await selectedFile.text()
        jsonData = parseCSV(text)
      } else {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][]
      }

      if (jsonData.length === 0) {
        alert('File is empty')
        return
      }

      const fileHeaders = jsonData[0] || []
      const fileData = jsonData.slice(1).filter(row => row.some(cell => cell !== '' && cell !== undefined && cell !== null))
      
      setHeaders(fileHeaders)
      setRawData(fileData)
      
      // Auto-detect column mappings
      const autoMapped = autoDetectMappings(fileHeaders)
      setColumnMapping(autoMapped)
      
      setStep(2)
    } catch (error) {
      console.error('Error parsing file:', error)
      alert('Failed to parse file. Please ensure it is a valid CSV or Excel file.')
    }
  }

  const handleMappingChange = (field: keyof ColumnMapping, column: string) => {
    setColumnMapping(prev => ({ ...prev, [field]: column }))
  }

  const previewMappedData = () => {
    if (!columnMapping.sku || !columnMapping.quantity) return []

    const skuIndex = headers.indexOf(columnMapping.sku)
    const qtyIndex = headers.indexOf(columnMapping.quantity)
    const costIndex = columnMapping.unitCost ? headers.indexOf(columnMapping.unitCost) : -1
    const nameIndex = columnMapping.productName ? headers.indexOf(columnMapping.productName) : -1

    return rawData.slice(0, 5).map(row => ({
      sku: String(row[skuIndex] || '').trim(),
      quantity: parseInt(String(row[qtyIndex] || '0')) || 0,
      unitCost: costIndex >= 0 ? parseFloat(String(row[costIndex] || '0')) || undefined : undefined,
      productName: nameIndex >= 0 ? String(row[nameIndex] || '').trim() : undefined,
    }))
  }

  const processImport = () => {
    if (!columnMapping.sku || !columnMapping.quantity) {
      alert('Please map SKU and Quantity columns')
      return
    }

    const skuIndex = headers.indexOf(columnMapping.sku)
    const qtyIndex = headers.indexOf(columnMapping.quantity)
    const costIndex = columnMapping.unitCost ? headers.indexOf(columnMapping.unitCost) : -1
    const nameIndex = columnMapping.productName ? headers.indexOf(columnMapping.productName) : -1

    if (skuIndex < 0 || qtyIndex < 0) {
      alert('Invalid column mapping. Please reselect columns.')
      return
    }

    const items: ImportedItem[] = []
    const warningsList: string[] = []

    rawData.forEach((row, index) => {
      // Handle rows that might be shorter than expected
      if (row.length <= Math.max(skuIndex, qtyIndex)) {
        warningsList.push(`Row ${index + 2}: Insufficient columns, skipped`)
        return
      }

      const sku = String(row[skuIndex] || '').trim()
      const qtyStr = String(row[qtyIndex] || '0').trim().replace(/[,$]/g, '') // Remove commas and dollar signs
      const qty = parseFloat(qtyStr) || parseInt(qtyStr) || 0

      if (!sku) {
        warningsList.push(`Row ${index + 2}: Missing SKU, skipped`)
        return
      }

      if (qty <= 0 || isNaN(qty)) {
        warningsList.push(`Row ${index + 2}: Invalid quantity (${row[qtyIndex]}), skipped`)
        return
      }

      // Parse cost - handle currency symbols, commas, etc.
      let unitCost: number | undefined = undefined
      if (costIndex >= 0 && row[costIndex] !== undefined && row[costIndex] !== null && row[costIndex] !== '') {
        const costStr = String(row[costIndex]).trim().replace(/[$,\s]/g, '')
        const parsed = parseFloat(costStr)
        if (!isNaN(parsed) && parsed >= 0) {
          unitCost = parsed
        }
      }

      const productName = nameIndex >= 0 && row[nameIndex] !== undefined && row[nameIndex] !== null
        ? String(row[nameIndex]).trim()
        : undefined

      items.push({
        sku,
        quantity: qty,
        unitCost,
        productName,
      })
    })

    if (items.length === 0) {
      alert('No valid items found. Please check your file and column mappings.')
      return
    }

    setImportedItems(items)
    setWarnings(warningsList)
    setStep(3)
  }

  const handleConfirmImport = () => {
    onImport(importedItems)
    handleReset()
  }

  const handleReset = () => {
    setStep(1)
    setFile(null)
    setRawData([])
    setHeaders([])
    setColumnMapping({
      sku: null,
      quantity: null,
      unitCost: null,
      productName: null,
    })
    setImportedItems([])
    setWarnings([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const canProceedToStep2 = file !== null
  const canProceedToStep3 = columnMapping.sku !== null && columnMapping.quantity !== null
  const previewData = previewMappedData()

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        handleReset()
        onClose()
      }}
      title={`Import Items - Step ${step} of 3`}
      size="xl"
    >
      <div className="p-6 space-y-6">
        {/* Step 1: Upload */}
        {step === 1 && (
          <>
            <div className="border-2 border-dashed border-slate-700 rounded-lg p-12 text-center hover:border-cyan-500/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <FileSpreadsheet className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">Drag and drop your file here</p>
              <p className="text-sm text-slate-400 mb-4">or</p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Click to browse
              </Button>
              <p className="text-xs text-slate-500 mt-4">Supports .csv, .xlsx, .xls files</p>
            </div>

            {file && (
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-sm text-slate-400">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => {
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}>
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 2: Map Columns */}
        {step === 2 && (
          <>
            <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
              <p className="text-sm text-slate-400">
                <strong className="text-slate-300">File:</strong> {file?.name} ({rawData.length} rows found)
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Columns detected: {headers.length}. Auto-mapping applied where possible.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    SKU <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={columnMapping.sku || ''}
                    onChange={(e) => handleMappingChange('sku', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Select column...</option>
                    {headers.map((header, index) => (
                      <option key={index} value={header}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  {columnMapping.sku && (
                    <p className="text-xs text-slate-500 mt-1">Mapped to: {columnMapping.sku}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Quantity <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={columnMapping.quantity || ''}
                    onChange={(e) => handleMappingChange('quantity', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Select column...</option>
                    {headers.map((header, index) => (
                      <option key={index} value={header}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  {columnMapping.quantity && (
                    <p className="text-xs text-slate-500 mt-1">Mapped to: {columnMapping.quantity}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Unit Cost (optional)
                  </label>
                  <select
                    value={columnMapping.unitCost || ''}
                    onChange={(e) => handleMappingChange('unitCost', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Select column...</option>
                    {headers.map((header, index) => (
                      <option key={index} value={header}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  {columnMapping.unitCost && (
                    <p className="text-xs text-slate-500 mt-1">Mapped to: {columnMapping.unitCost}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Product Name (optional)
                  </label>
                  <select
                    value={columnMapping.productName || ''}
                    onChange={(e) => handleMappingChange('productName', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Select column...</option>
                    {headers.map((header, index) => (
                      <option key={index} value={header}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  {columnMapping.productName && (
                    <p className="text-xs text-slate-500 mt-1">Mapped to: {columnMapping.productName}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Show all available columns */}
            <div className="mt-4">
              <p className="text-sm font-medium text-slate-300 mb-2">Available columns in file:</p>
              <div className="flex flex-wrap gap-2">
                {headers.map((header, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded"
                  >
                    {header || `Column ${index + 1}`}
                  </span>
                ))}
              </div>
            </div>

            {/* Preview Table */}
            {canProceedToStep3 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-slate-300 mb-3">Preview (first 5 rows)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-2 text-slate-400">SKU</th>
                        <th className="text-right py-2 text-slate-400">Quantity</th>
                        {columnMapping.unitCost && <th className="text-right py-2 text-slate-400">Unit Cost</th>}
                        {columnMapping.productName && <th className="text-left py-2 text-slate-400">Product Name</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((item, index) => (
                        <tr key={index} className="border-b border-slate-700/50">
                          <td className="py-2 text-white">{item.sku}</td>
                          <td className="py-2 text-right text-white">{item.quantity}</td>
                          {columnMapping.unitCost && (
                            <td className="py-2 text-right text-white">
                              {item.unitCost ? `$${item.unitCost.toFixed(2)}` : '-'}
                            </td>
                          )}
                          {columnMapping.productName && (
                            <td className="py-2 text-slate-300">{item.productName || '-'}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <>
            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">
                    Ready to import {importedItems.length} items
                  </span>
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    <span className="text-amber-400 font-medium">
                      {warnings.length} row(s) skipped (invalid data)
                    </span>
                  </div>
                  <details className="mt-2">
                    <summary className="text-sm text-slate-400 cursor-pointer hover:text-slate-300">
                      View details
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-400">
                      {warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ModalFooter>
        <div className="flex items-center justify-between w-full">
          <Button
            variant="ghost"
            onClick={() => {
              if (step > 1) {
                setStep((step - 1) as 1 | 2 | 3)
              } else {
                handleReset()
                onClose()
              }
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <div className="flex gap-2">
            {step < 3 ? (
              <Button
                variant="primary"
                onClick={() => {
                  if (step === 1 && canProceedToStep2) {
                    // Already moved to step 2 in file handler
                  } else if (step === 2 && canProceedToStep3) {
                    processImport()
                  }
                }}
                disabled={!canProceedToStep2 && step === 1 || !canProceedToStep3 && step === 2}
              >
                {step === 1 ? 'Next' : 'Import'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button variant="primary" onClick={handleConfirmImport}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm Import
              </Button>
            )}
          </div>
        </div>
      </ModalFooter>
    </Modal>
  )
}

