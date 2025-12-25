'use client'

import { useState, useEffect } from 'react'
import { Printer, Tag, X, AlertCircle, Check, Loader2, Download, RotateCcw, Plus, CheckCircle2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { generateLabelPDF, openAndPrintPDF } from '@/lib/label-pdf-generator'

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
  // Batch printing state
  const [batchPrinting, setBatchPrinting] = useState<{
    sku: string
    currentBatch: number
    totalBatches: number
    batches: Array<{ codes: string[]; quantity: number }>
    item: ShipmentItem
    labelType: LabelType
    labelSize: string
    width: number
    height: number
  } | null>(null)

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
      case 'none': return { label: 'Pre-labeled', color: 'text-[var(--muted-foreground)]', bg: 'bg-slate-800/50' }
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

  // Print a single batch
  const printBatch = async (
    item: ShipmentItem,
    batchCodes: string[],
    batchQuantity: number,
    labelType: LabelType,
    width: number,
    height: number,
    batchNumber: number
  ) => {
    setGeneratingPDF(item.masterSku)
    setPdfProgress({ current: 0, total: batchQuantity * 2 })
    
    try {
      const blob = await generateLabelPDF({
        item: {
          masterSku: item.masterSku,
          fnsku: item.fnsku,
          productName: item.productName,
          brandLogo: item.brandLogo,
        },
        labelType,
        quantity: batchQuantity,
        widthIn: width,
        heightIn: height,
        tpCodes: batchCodes,
        onProgress: (current, total) => setPdfProgress({ current, total }),
      })

      const fileName = `Labels-${item.masterSku}-Batch${batchNumber}-${Date.now()}.pdf`
      openAndPrintPDF(blob, fileName)
      console.log(`[PDF Gen] Successfully generated batch ${batchNumber}: ${fileName}`)
    } catch (error: any) {
      console.error(`[PDF Gen] Error generating batch ${batchNumber}:`, error)
      throw error
    } finally {
      setGeneratingPDF(null)
      setPdfProgress(null)
    }
  }

  // Continue to next batch in batch printing
  const continueBatchPrint = async () => {
    if (!batchPrinting) return

    const { sku, currentBatch, totalBatches, batches, item, labelType, width, height } = batchPrinting
    
    if (currentBatch >= totalBatches) {
      // All batches printed
      setBatchPrinting(null)
      return
    }

    const batch = batches[currentBatch]
    
    try {
      await printBatch(item, batch.codes, batch.quantity, labelType, width, height, currentBatch + 1)
      
      // Move to next batch
      if (currentBatch + 1 < totalBatches) {
        setBatchPrinting(prev => prev ? {
          ...prev,
          currentBatch: prev.currentBatch + 1
        } : null)
      } else {
        // All batches done
        setBatchPrinting(null)
        // Store print data
        const allCodes = batches.flatMap(b => b.codes)
        const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0)
        setPrintedLabels(prev => ({
          ...prev,
          [sku]: {
            quantity: totalQuantity,
            tpCodes: allCodes,
            labelType,
            widthIn: width,
            heightIn: height,
            printedAt: new Date()
          }
        }))
        setPrintedCounts(prev => ({
          ...prev,
          [sku]: (prev[sku] || 0) + totalQuantity
        }))
        // Reset print more state
        setShowPrintMore(null)
        setPrintMoreQty(1)
      }
    } catch (error: any) {
      alert(`Failed to print batch ${currentBatch + 1}: ${error.message}`)
      setBatchPrinting(null)
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

    // Check if we need batch printing (quantity > 200)
    // If so, always split into 5 equal batches
    const needsBatching = quantity > 200

    if (needsBatching) {
      // Always split into 5 batches
      const totalBatches = 5
      const batchSize = Math.ceil(quantity / totalBatches)
      const batches: Array<{ codes: string[]; quantity: number }> = []
      
      for (let i = 0; i < totalBatches; i++) {
        const start = i * batchSize
        const end = Math.min(start + batchSize, quantity)
        const batchQuantity = end - start
        
        // Only add batch if it has labels
        if (batchQuantity > 0) {
          const batchCodes = transparencyCodes.slice(start, end)
          batches.push({
            codes: batchCodes,
            quantity: batchQuantity
          })
        }
      }

      // Start batch printing
      setBatchPrinting({
        sku: item.masterSku,
        currentBatch: 0,
        totalBatches,
        batches,
        item,
        labelType,
        labelSize,
        width,
        height
      })

      // Print first batch immediately
      const firstBatch = batches[0]
      try {
        await printBatch(item, firstBatch.codes, firstBatch.quantity, labelType, width, height, 1)
        // After first batch, update state to show modal for next batch
        if (totalBatches > 1) {
          setBatchPrinting(prev => prev ? {
            ...prev,
            currentBatch: 1
          } : null)
        } else {
          // Only one batch, we're done
          setBatchPrinting(null)
          const allCodes = batches.flatMap(b => b.codes)
          const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0)
          setPrintedLabels(prev => ({
            ...prev,
            [item.masterSku]: {
              quantity: totalQuantity,
              tpCodes: allCodes,
              labelType,
              widthIn: width,
              heightIn: height,
              printedAt: new Date()
            }
          }))
          setPrintedCounts(prev => ({
            ...prev,
            [item.masterSku]: (prev[item.masterSku] || 0) + totalQuantity
          }))
        }
      } catch (error: any) {
        alert(`Failed to print first batch: ${error.message}`)
        setBatchPrinting(null)
      }
      return
    }

    // Regular single-batch printing for quantities <= 200
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

      // Open PDF in new window and trigger print
      const fileName = `Labels-${item.masterSku}-${Date.now()}.pdf`
      openAndPrintPDF(blob, fileName)
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
      openAndPrintPDF(blob, fileName)

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
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          Print FNSKU and/or Transparency labels for each product. Now supports large batches (500+ labels) without browser crashes.
        </p>

        {/* Labels Table */}
        <div className="space-y-2">
          {items.map(item => {
            const labelType = getLabelType(item)
            const display = getLabelTypeDisplay(labelType)
            
            return (
              <div key={item.masterSku} className="flex items-center gap-4 p-3 bg-[var(--card)]/50 rounded-lg border border-[var(--border)]">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--foreground)]">{item.masterSku}</div>
                  <div className="text-xs text-[var(--muted-foreground)] font-mono">
                    FNSKU: {item.fnsku || <span className="text-amber-400">Not set</span>}
                  </div>
                  <div className="text-sm text-[var(--muted-foreground)] truncate">{item.productName}</div>
                </div>

                <div className="text-center">
                  <div className="text-sm text-[var(--muted-foreground)]">Units</div>
                  <input
                    type="number"
                    min="1"
                    value={labelCounts[item.masterSku] || item.adjustedQty}
                    onChange={(e) => setLabelCounts({
                      ...labelCounts,
                      [item.masterSku]: parseInt(e.target.value) || 0
                    })}
                    className="w-16 px-2 py-1 bg-[var(--secondary)] border border-[var(--border)] rounded text-[var(--foreground)] text-sm text-center"
                  />
                </div>

                <div className="relative">
                  <select
                    value={labelType}
                    onChange={(e) => handleLabelTypeChange(item.masterSku, e.target.value as LabelType)}
                    disabled={savingLabelType === item.masterSku}
                    className={`px-2 py-1 rounded text-xs font-medium border border-[var(--border)] cursor-pointer appearance-none pr-6 bg-[var(--secondary)] ${display.color} focus:outline-none focus:ring-1 focus:ring-slate-500`}
                    style={{ backgroundImage: 'none' }}
                  >
                    <option value="fnsku_tp" className="bg-[var(--card)] text-purple-400">FNSKU + TP</option>
                    <option value="fnsku_only" className="bg-[var(--card)] text-cyan-400">FNSKU</option>
                    <option value="tp_only" className="bg-[var(--card)] text-amber-400">TP Only</option>
                    <option value="none" className="bg-[var(--card)] text-[var(--muted-foreground)]">Pre-labeled</option>
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
                  <div className="text-sm text-[var(--muted-foreground)] italic">
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
                              className="w-14 px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded text-[var(--foreground)] text-sm text-center"
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
                              className="px-2 py-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
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
                          <div className="text-xs text-[var(--muted-foreground)]">
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
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="grid grid-cols-4 gap-4 text-center text-sm">
            <div>
              <div className="text-purple-400 font-medium">
                {itemsByType.fnsku_tp.length} SKUs
              </div>
              <div className="text-[var(--muted-foreground)]">FNSKU + TP</div>
            </div>
            <div>
              <div className="text-cyan-400 font-medium">
                {itemsByType.fnsku_only.length} SKUs
              </div>
              <div className="text-[var(--muted-foreground)]">FNSKU Only</div>
            </div>
            <div>
              <div className="text-amber-400 font-medium">
                {itemsByType.tp_only.length} SKUs
              </div>
              <div className="text-[var(--muted-foreground)]">TP Only</div>
            </div>
            <div>
              <div className="text-[var(--muted-foreground)] font-medium">
                {itemsByType.none.length} SKUs
              </div>
              <div className="text-[var(--muted-foreground)]">Pre-labeled</div>
            </div>
          </div>
        </div>

        {/* Label Size Info */}
        <div className="mt-4 p-3 bg-[var(--card)]/30 rounded-lg text-xs text-[var(--muted-foreground)]">
          <strong>Label sizes:</strong> FNSKU/FNSKU+TP: {labelSettings.fnskuLabelSize}" | TP Only: {labelSettings.tpOnlyLabelSize}"
          <span className="text-[var(--muted-foreground)] ml-2">(Change in Settings → Display)</span>
        </div>
      </CardContent>

      {/* Batch Printing Modal */}
      {batchPrinting && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card)] rounded-lg p-6 w-full max-w-md border border-[var(--border)]">
            <h3 className="text-xl font-bold text-[var(--foreground)] mb-4">Batch Printing</h3>
            
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[var(--muted-foreground)]">Progress</span>
                <span className="text-[var(--foreground)] font-medium">
                  Batch {batchPrinting.currentBatch + 1} of {batchPrinting.totalBatches}
                </span>
              </div>
              <div className="w-full bg-[var(--muted)] rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${((batchPrinting.currentBatch + 1) / batchPrinting.totalBatches) * 100}%` }}
                />
              </div>
              <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                Printing {batchPrinting.batches[batchPrinting.currentBatch]?.quantity} labels in this batch
              </div>
            </div>

            <div className="bg-[var(--secondary)]/50 rounded-lg p-4 mb-6">
              <div className="text-sm text-[var(--muted-foreground)] mb-1">SKU: {batchPrinting.sku}</div>
              <div className="text-sm text-[var(--muted-foreground)]">
                Total: {batchPrinting.batches.reduce((sum, b) => sum + b.quantity, 0)} labels in {batchPrinting.totalBatches} batches
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm('Cancel batch printing? You can resume later by printing again.')) {
                    setBatchPrinting(null)
                    setGeneratingPDF(null)
                    setPdfProgress(null)
                  }
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={continueBatchPrint}
                disabled={generatingPDF === batchPrinting.sku}
                className="flex-1"
              >
                {generatingPDF === batchPrinting.sku ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : batchPrinting.currentBatch + 1 >= batchPrinting.totalBatches ? (
                  'Finish'
                ) : (
                  'Next Batch'
                )}
              </Button>
            </div>

            {pdfProgress && (
              <div className="mt-4">
                <div className="text-xs text-[var(--muted-foreground)] mb-1">
                  Generating PDF: {pdfProgress.current} / {pdfProgress.total}
                </div>
                <div className="w-full bg-[var(--muted)] rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-200"
                    style={{ width: `${(pdfProgress.current / pdfProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
