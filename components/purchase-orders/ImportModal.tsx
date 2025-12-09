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
        const lines = text.split('\n').map(line => line.trim()).filter(line => line)
        jsonData = lines.map(line => {
          // Handle CSV parsing (simple version, can be enhanced)
          const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
          return values
        })
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

      setHeaders(jsonData[0] || [])
      setRawData(jsonData.slice(1).filter(row => row.some(cell => cell !== '' && cell !== undefined)))
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

    const items: ImportedItem[] = []
    const warningsList: string[] = []

    rawData.forEach((row, index) => {
      const sku = String(row[skuIndex] || '').trim()
      const qty = parseInt(String(row[qtyIndex] || '0')) || 0

      if (!sku) {
        warningsList.push(`Row ${index + 2}: Missing SKU, skipped`)
        return
      }

      if (qty <= 0) {
        warningsList.push(`Row ${index + 2}: Invalid quantity (${qty}), skipped`)
        return
      }

      items.push({
        sku,
        quantity: qty,
        unitCost: costIndex >= 0 ? parseFloat(String(row[costIndex] || '0')) || undefined : undefined,
        productName: nameIndex >= 0 ? String(row[nameIndex] || '').trim() : undefined,
      })
    })

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
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
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
                      <option key={index} value={header}>{header}</option>
                    ))}
                  </select>
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
                      <option key={index} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Unit Cost
                  </label>
                  <select
                    value={columnMapping.unitCost || ''}
                    onChange={(e) => handleMappingChange('unitCost', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">Select column...</option>
                    {headers.map((header, index) => (
                      <option key={index} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Product Name
                </label>
                <select
                  value={columnMapping.productName || ''}
                  onChange={(e) => handleMappingChange('productName', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select column...</option>
                  {headers.map((header, index) => (
                    <option key={index} value={header}>{header}</option>
                  ))}
                </select>
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

