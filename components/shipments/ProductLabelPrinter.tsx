'use client'

import { useState, useEffect } from 'react'
import { Printer, Tag, X, AlertCircle, Check, Loader2, Download, RotateCcw, Plus, CheckCircle2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { generateLabelPDF, downloadPDF } from '@/lib/label-pdf-generator'

interface ShipmentItem {
  masterSku: string
  fnsku: string | null
  productName: string
  adjustedQty: number
  labelType?: string // fnsku_tp, fnsku_only, tp_only, none
  transparencyEnabled?: boolean
  brandLogo?: string // Optional URL or base64 of brand logo
}

interface ProductLabelPrinterProps {
  shipmentId: string
  shipmentInternalId: string
  items: ShipmentItem[]
}

type LabelType = 'fnsku_tp' | 'fnsku_only' | 'tp_only' | 'none'

interface LabelSettings {
  fnskuLabelSize: string
  tpOnlyLabelSize: string
}

interface PrintedLabelData {
  quantity: number
  tpCodes: string[]
  labelType: LabelType
  widthIn: number
  heightIn: number
  printedAt: Date
}

// Persisted print counts per shipment
interface PrintedCounts {
  [sku: string]: number // Total labels printed (not including reprints)
}

export default function ProductLabelPrinter({
  shipmentId,
  shipmentInternalId,
  items,
}: ProductLabelPrinterProps) {
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({})
  const [labelSettings, setLabelSettings] = useState<LabelSettings>({
    fnskuLabelSize: '3x1',
    tpOnlyLabelSize: '1x1',
  })
  const [loadingTp, setLoadingTp] = useState<string | null>(null)
  const [tpCodes, setTpCodes] = useState<Record<string, string[]>>({})

  // Track printed labels (for reprint functionality)
  const [printedLabels, setPrintedLabels] = useState<Record<string, PrintedLabelData>>({})
  // Persisted total printed counts
  const [printedCounts, setPrintedCounts] = useState<PrintedCounts>({})
  // Show "print more" input for specific SKU
  const [showPrintMore, setShowPrintMore] = useState<string | null>(null)
  const [printMoreQty, setPrintMoreQty] = useState<number>(1)
  // Track label type overrides (for immediate UI update before API confirms)
  const [labelTypeOverrides, setLabelTypeOverrides] = useState<Record<string, LabelType>>({})
  const [savingLabelType, setSavingLabelType] = useState<string | null>(null)
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null)
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null)

  // Load settings and printed counts from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('displaySettings')
    if (stored) {
      try {
        const settings = JSON.parse(stored)
        if (settings.fnskuLabelSize) {
          setLabelSettings({
            fnskuLabelSize: settings.fnskuLabelSize || '3x1',
            tpOnlyLabelSize: settings.tpOnlyLabelSize || '1x1',
          })
        }
      } catch (e) {
        console.error('Error loading settings:', e)
      }
    }

    // Load persisted printed counts for this shipment
    const printedKey = `printedLabels_${shipmentInternalId}`
    const storedPrinted = localStorage.getItem(printedKey)
    if (storedPrinted) {
      try {
        setPrintedCounts(JSON.parse(storedPrinted))
      } catch (e) {
        console.error('Error loading printed counts:', e)
      }
    }

    // Initialize label counts
    const counts: Record<string, number> = {}
    items.forEach(item => {
      counts[item.masterSku] = item.adjustedQty
    })
    setLabelCounts(counts)
  }, [items, shipmentInternalId])

  // Save printed counts to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(printedCounts).length > 0) {
      const printedKey = `printedLabels_${shipmentInternalId}`
      localStorage.setItem(printedKey, JSON.stringify(printedCounts))
    }
  }, [printedCounts, shipmentInternalId])

  const getLabelType = (item: ShipmentItem): LabelType => {
    // Check for local override first (for immediate UI update)
    if (labelTypeOverrides[item.masterSku]) return labelTypeOverrides[item.masterSku]
    if (item.labelType) return item.labelType as LabelType
    if (item.transparencyEnabled) return 'fnsku_tp'
    return 'fnsku_only'
  }

  // Handle label type change from dropdown
  const handleLabelTypeChange = async (sku: string, newLabelType: LabelType) => {
    // Update local state immediately for responsive UI
    setLabelTypeOverrides(prev => ({ ...prev, [sku]: newLabelType }))
    setSavingLabelType(sku)

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelType: newLabelType }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update label type')
      }
    } catch (error: any) {
      console.error('Error updating label type:', error)
      // Revert on error
      setLabelTypeOverrides(prev => {
        const updated = { ...prev }
        delete updated[sku]
        return updated
      })
      alert(`Failed to update label type: ${error.message}`)
    } finally {
      setSavingLabelType(null)
    }
  }

  const getLabelTypeDisplay = (type: LabelType) => {
    switch (type) {
      case 'fnsku_tp': return { label: 'FNSKU + TP', color: 'text-purple-400', bg: 'bg-purple-900/20' }
      case 'fnsku_only': return { label: 'FNSKU', color: 'text-cyan-400', bg: 'bg-cyan-900/20' }
      case 'tp_only': return { label: 'TP Only', color: 'text-amber-400', bg: 'bg-amber-900/20' }
      case 'none': return { label: 'Pre-labeled', color: 'text-slate-400', bg: 'bg-slate-900/20' }
    }
  }

  // Request Transparency codes from Amazon API
  const requestTransparencyCodes = async (sku: string, quantity: number): Promise<string[]> => {
    setLoadingTp(sku)
    
    try {
      const res = await fetch(`/api/transparency/codes?sku=${encodeURIComponent(sku)}&quantity=${quantity}&shipmentId=${shipmentId}`)
      const data = await res.json()
      
      if (!res.ok) {
        console.error('Error getting transparency codes:', data.error)
        alert(`Failed to get Transparency codes: ${data.error}\n\nMake sure:\n1. Product has a valid UPC\n2. Transparency API credentials are configured\n3. Product is enrolled in Transparency program`)
        setLoadingTp(null)
        return []
      }
      
      const codes = data.codes || []
      if (codes.length === 0) {
        alert(`No Transparency codes received. Make sure the product is enrolled in Amazon Transparency and has a valid UPC.`)
        setLoadingTp(null)
        return []
      }
      
      // Filter out any codes that look like UPCs (8-14 digits only, no other characters)
      const validCodes = codes.filter((code: string) => {
        const codeStr = String(code).trim()
        const isOnlyDigits = /^\d+$/.test(codeStr)
        const isUPCLength = codeStr.length >= 8 && codeStr.length <= 14
        const looksLikeUPC = isOnlyDigits && isUPCLength
        
        if (looksLikeUPC) {
          console.warn(`Filtered out potential UPC code: "${codeStr}" (length: ${codeStr.length})`)
          return false
        }
        
        if (codeStr.length < 15) {
          console.warn(`Filtered out suspiciously short code: "${codeStr}" (length: ${codeStr.length})`)
          return false
        }
        
        return true
      })
      
      if (validCodes.length === 0) {
        alert(`No valid Transparency codes received (all codes were filtered as UPCs). Please check the API response.`)
        setLoadingTp(null)
        return []
      }
      
      setTpCodes(prev => ({ ...prev, [sku]: validCodes }))
      setLoadingTp(null)
      return validCodes
    } catch (error: any) {
      console.error('Error fetching transparency codes:', error)
      alert(`Error requesting Transparency codes: ${error.message || 'Unknown error'}`)
      setLoadingTp(null)
      return []
    }
  }

  const printLabels = async (item: ShipmentItem, forceNewCodes = true) => {
    const labelType = getLabelType(item)
    const quantity = labelCounts[item.masterSku] || item.adjustedQty

    // Warn if no FNSKU for FNSKU-type labels
    if ((labelType === 'fnsku_only' || labelType === 'fnsku_tp') && !item.fnsku) {
      const proceed = confirm(
        `Warning: No FNSKU found for ${item.masterSku}.\n\n` +
        `The label will show the SKU instead. For accurate FBA labels, ` +
        `please sync FNSKUs from Amazon or enter them in product settings.\n\n` +
        `Continue anyway?`
      )
      if (!proceed) return
    }

    let transparencyCodes: string[] = []

    // Request fresh codes if needed (for TP labels)
    if ((labelType === 'fnsku_tp' || labelType === 'tp_only') && forceNewCodes) {
      console.log(`[Label Print] Requesting fresh Transparency codes for ${item.masterSku}, quantity: ${quantity}`)

      // Clear any existing codes for this SKU
      setTpCodes(prev => {
        const updated = { ...prev }
        delete updated[item.masterSku]
        return updated
      })

      // Request fresh codes
      transparencyCodes = await requestTransparencyCodes(item.masterSku, quantity)

      if (transparencyCodes.length < quantity) {
        alert(`Warning: Only received ${transparencyCodes.length} Transparency codes but need ${quantity}. Some labels may be missing QR codes.`)
      }

      // Pad with empty strings if needed
      while (transparencyCodes.length < quantity) {
        transparencyCodes.push('')
      }

      console.log(`[Label Print] Received ${transparencyCodes.length} codes for ${item.masterSku}. First code: "${transparencyCodes[0]?.substring(0, 20)}..."`)
    }

    const labelSize = labelType === 'tp_only'
      ? labelSettings.tpOnlyLabelSize
      : labelSettings.fnskuLabelSize

    const [width, height] = labelSize.split('x').map(s => parseFloat(s))

    // Generate PDF using fast direct drawing (no html2canvas!)
    setGeneratingPDF(item.masterSku)
    setPdfProgress({ current: 0, total: quantity * 2 })
    
    try {
      console.log(`[PDF Gen] Starting fast PDF generation for ${item.masterSku}, ${quantity} labels`)
      
      const blob = await generateLabelPDF({
        item: {
          masterSku: item.masterSku,
          fnsku: item.fnsku,
          productName: item.productName,
          brandLogo: item.brandLogo,
        },
        labelType,
        quantity,
        widthIn: width,
        heightIn: height,
        tpCodes: transparencyCodes,
        onProgress: (current, total) => setPdfProgress({ current, total }),
      })

      // Download the PDF
      const fileName = `Labels-${item.masterSku}-${Date.now()}.pdf`
      downloadPDF(blob, fileName)
      console.log(`[PDF Gen] Successfully generated ${fileName}`)

    } catch (error: any) {
      console.error('[PDF Gen] Error:', error)
      alert(`Failed to generate PDF: ${error.message}`)
    } finally {
      setGeneratingPDF(null)
      setPdfProgress(null)
    }

    // Store print data for reprint functionality
    setPrintedLabels(prev => ({
      ...prev,
      [item.masterSku]: {
        quantity,
        tpCodes: transparencyCodes,
        labelType,
        widthIn: width,
        heightIn: height,
        printedAt: new Date()
      }
    }))

    // Auto-mark as printed after successful PDF generation
    setPrintedCounts(prev => ({
      ...prev,
      [item.masterSku]: (prev[item.masterSku] || 0) + quantity
    }))

    // Reset print more state
    setShowPrintMore(null)
    setPrintMoreQty(1)
  }

  // Reprint using stored data (no new TP codes)
  const reprintLabels = async (item: ShipmentItem) => {
    const printData = printedLabels[item.masterSku]
    if (!printData) {
      alert('No previous print data found. Please print first.')
      return
    }

    // Regenerate PDF from stored data
    setGeneratingPDF(item.masterSku)
    setPdfProgress({ current: 0, total: printData.quantity * 2 })
    
    try {
      const blob = await generateLabelPDF({
        item: {
          masterSku: item.masterSku,
          fnsku: item.fnsku,
          productName: item.productName,
          brandLogo: item.brandLogo,
        },
        labelType: printData.labelType,
        quantity: printData.quantity,
        widthIn: printData.widthIn,
        heightIn: printData.heightIn,
        tpCodes: printData.tpCodes,
        onProgress: (current, total) => setPdfProgress({ current, total }),
      })

      const fileName = `Labels-${item.masterSku}-reprint-${Date.now()}.pdf`
      downloadPDF(blob, fileName)

    } catch (error: any) {
      console.error('Error reprinting:', error)
      alert(`Failed to reprint: ${error.message}`)
    } finally {
      setGeneratingPDF(null)
      setPdfProgress(null)
    }
  }

  // Request more labels with NEW transparency codes
  const requestMoreLabels = async (item: ShipmentItem, additionalQty: number) => {
    // Update the label count to the new quantity
    setLabelCounts(prev => ({
      ...prev,
      [item.masterSku]: additionalQty
    }))

    // Wait for state to update, then print with new codes
    setTimeout(() => {
      printLabels(item, true)
    }, 100)
  }

  // Manually mark as printed (without actually printing)
  const markAsPrinted = (item: ShipmentItem) => {
    const quantity = labelCounts[item.masterSku] || item.adjustedQty
    
    // Update cumulative printed count (persisted)
    setPrintedCounts(prev => ({
      ...prev,
      [item.masterSku]: (prev[item.masterSku] || 0) + quantity
    }))
  }

  // Group items by label type
  const itemsByType = {
    fnsku_tp: items.filter(i => getLabelType(i) === 'fnsku_tp'),
    fnsku_only: items.filter(i => getLabelType(i) === 'fnsku_only'),
    tp_only: items.filter(i => getLabelType(i) === 'tp_only'),
    none: items.filter(i => getLabelType(i) === 'none'),
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="w-5 h-5" />
          Product Labels
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-400 mb-4">
          Print FNSKU and/or Transparency labels for each product. Now supports large batches (500+ labels) without browser crashes.
        </p>

        {/* Labels Table */}
        <div className="space-y-2">
          {items.map(item => {
            const labelType = getLabelType(item)
            const display = getLabelTypeDisplay(labelType)
            
            return (
              <div key={item.masterSku} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white">{item.masterSku}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    FNSKU: {item.fnsku || <span className="text-amber-400">Not set</span>}
                  </div>
                  <div className="text-sm text-slate-400 truncate">{item.productName}</div>
                </div>

                <div className="text-center">
                  <div className="text-sm text-slate-400">Units</div>
                  <input
                    type="number"
                    min="1"
                    value={labelCounts[item.masterSku] || item.adjustedQty}
                    onChange={(e) => setLabelCounts({
                      ...labelCounts,
                      [item.masterSku]: parseInt(e.target.value) || 0
                    })}
                    className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm text-center"
                  />
                </div>

                <div className="relative">
                  <select
                    value={labelType}
                    onChange={(e) => handleLabelTypeChange(item.masterSku, e.target.value as LabelType)}
                    disabled={savingLabelType === item.masterSku}
                    className={`px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer appearance-none pr-6 ${display.bg} ${display.color} focus:outline-none focus:ring-1 focus:ring-slate-500`}
                    style={{ backgroundImage: 'none' }}
                  >
                    <option value="fnsku_tp" className="bg-slate-800 text-purple-400">FNSKU + TP</option>
                    <option value="fnsku_only" className="bg-slate-800 text-cyan-400">FNSKU</option>
                    <option value="tp_only" className="bg-slate-800 text-amber-400">TP Only</option>
                    <option value="none" className="bg-slate-800 text-slate-400">Pre-labeled</option>
                  </select>
                  <div className="absolute inset-y-0 right-1 flex items-center pointer-events-none">
                    {savingLabelType === item.masterSku ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </div>

                {labelType === 'none' ? (
                  <div className="text-sm text-slate-400 italic">
                    Pre-labeled
                  </div>
                ) : (
                  <>
                    {/* Show different UI based on whether labels have been printed */}
                    {printedCounts[item.masterSku] ? (
                      // Already printed - show count and actions
                      <div className="flex items-center gap-2">
                        <div className="text-sm text-emerald-400 font-medium flex items-center gap-1">
                          <Check className="w-4 h-4" />
                          {printedCounts[item.masterSku]} Printed
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reprintLabels(item)}
                          disabled={!printedLabels[item.masterSku] || loadingTp === item.masterSku || generatingPDF === item.masterSku}
                          title={!printedLabels[item.masterSku] ? 'Print data not available (page was refreshed)' : 'Reprint last batch'}
                        >
                          {generatingPDF === item.masterSku ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-4 h-4 mr-1" />
                              Reprint
                            </>
                          )}
                        </Button>

                        {showPrintMore === item.masterSku ? (
                          // Show qty input for print more
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              value={printMoreQty}
                              onChange={(e) => setPrintMoreQty(parseInt(e.target.value) || 1)}
                              className="w-14 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm text-center"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => requestMoreLabels(item, printMoreQty)}
                              disabled={loadingTp === item.masterSku || generatingPDF === item.masterSku}
                            >
                              {loadingTp === item.masterSku ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : generatingPDF === item.masterSku ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Printer className="w-4 h-4 mr-1" />
                                  Print
                                </>
                              )}
                            </Button>
                            <button
                              className="px-2 py-1 text-slate-400 hover:text-white"
                              onClick={() => {
                                setShowPrintMore(null)
                                setPrintMoreQty(1)
                              }}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setShowPrintMore(item.masterSku)
                              setPrintMoreQty(1)
                            }}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Print More
                          </Button>
                        )}
                      </div>
                    ) : (
                      // Not printed yet - show Print button and Mark as Printed option
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => printLabels(item)}
                            disabled={loadingTp === item.masterSku || generatingPDF === item.masterSku}
                          >
                            {loadingTp === item.masterSku ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                Getting TP...
                              </>
                            ) : generatingPDF === item.masterSku ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Printer className="w-4 h-4 mr-1" />
                                Print
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markAsPrinted(item)}
                            disabled={loadingTp === item.masterSku || generatingPDF === item.masterSku}
                            title="Mark as printed without generating PDF"
                            className="text-emerald-400 border-emerald-400/50 hover:bg-emerald-400/10"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Mark Printed
                          </Button>
                        </div>
                        {generatingPDF === item.masterSku && pdfProgress && (
                          <div className="text-xs text-slate-400">
                            {Math.round((pdfProgress.current / pdfProgress.total) * 100)}% complete
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Summary by Type */}
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="grid grid-cols-4 gap-4 text-center text-sm">
            <div>
              <div className="text-purple-400 font-medium">
                {itemsByType.fnsku_tp.length} SKUs
              </div>
              <div className="text-slate-500">FNSKU + TP</div>
            </div>
            <div>
              <div className="text-cyan-400 font-medium">
                {itemsByType.fnsku_only.length} SKUs
              </div>
              <div className="text-slate-500">FNSKU Only</div>
            </div>
            <div>
              <div className="text-amber-400 font-medium">
                {itemsByType.tp_only.length} SKUs
              </div>
              <div className="text-slate-500">TP Only</div>
            </div>
            <div>
              <div className="text-slate-400 font-medium">
                {itemsByType.none.length} SKUs
              </div>
              <div className="text-slate-500">Pre-labeled</div>
            </div>
          </div>
        </div>

        {/* Label Size Info */}
        <div className="mt-4 p-3 bg-slate-800/30 rounded-lg text-xs text-slate-400">
          <strong>Label sizes:</strong> FNSKU/FNSKU+TP: {labelSettings.fnskuLabelSize}" | TP Only: {labelSettings.tpOnlyLabelSize}"
          <span className="text-slate-500 ml-2">(Change in Settings → Display)</span>
        </div>
      </CardContent>
    </Card>
  )
}
