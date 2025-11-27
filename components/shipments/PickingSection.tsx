'use client'

import { useState } from 'react'
import { Printer, Smartphone, Check, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Edit3, Package, RotateCcw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'

interface ShipmentItem {
  id: number
  masterSku: string
  fnsku: string | null
  productName: string
  adjustedQty: number
  pickStatus: string
  warehouseLocation?: string | null
}

interface PickingSectionProps {
  shipmentId: string
  shipmentInternalId: string
  items: ShipmentItem[]
  onItemsChange: (items: ShipmentItem[]) => void
  onPickComplete: () => void
  onInventoryAdjust?: (sku: string, newQty: number, reason: string) => Promise<void>
}

export default function PickingSection({
  shipmentId,
  shipmentInternalId,
  items,
  onItemsChange,
  onPickComplete,
  onInventoryAdjust,
}: PickingSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const [showInteractivePick, setShowInteractivePick] = useState(false)
  const [currentPickIndex, setCurrentPickIndex] = useState(0)
  const [scanInput, setScanInput] = useState('')
  const [scanResult, setScanResult] = useState<'correct' | 'wrong' | null>(null)
  const [editingQty, setEditingQty] = useState<number | null>(null)
  const [newQty, setNewQty] = useState<number>(0)
  
  // Interactive pick adjustments
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustType, setAdjustType] = useState<'shipment' | 'inventory'>('shipment')
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')

  const allPicked = items.every(i => i.pickStatus === 'picked' || i.pickStatus === 'skipped')
  const pickedCount = items.filter(i => i.pickStatus === 'picked').length
  const skippedCount = items.filter(i => i.pickStatus === 'skipped').length
  const pendingItems = items.filter(i => i.pickStatus === 'pending' || !i.pickStatus)
  const skippedItems = items.filter(i => i.pickStatus === 'skipped')

  // Print Pick Labels - one per SKU
  const printPickLabels = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Please allow popups to print labels')
      return
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pick Labels - ${shipmentInternalId}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: 4in 6in; margin: 0; }
          body { font-family: Arial, sans-serif; }
          .label {
            width: 4in;
            height: 6in;
            padding: 0.25in;
            page-break-after: always;
            border: 1px dashed #ccc;
            display: flex;
            flex-direction: column;
          }
          .label:last-child { page-break-after: auto; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 0.2in;
          }
          .sku {
            font-size: 28pt;
            font-weight: bold;
          }
          .qty-box {
            border: 3px solid #000;
            padding: 0.15in 0.3in;
            font-size: 48pt;
            font-weight: bold;
          }
          .barcode-container {
            text-align: center;
            margin: 0.3in 0;
          }
          .barcode-container svg {
            max-width: 100%;
            height: 80px;
          }
          .product-name {
            font-size: 16pt;
            line-height: 1.3;
            flex: 1;
            overflow: hidden;
            text-align: center;
            margin: 0.2in 0;
          }
          .location-section {
            text-align: center;
            margin: 0.3in 0;
            padding: 0.2in;
            border: 2px dashed #666;
            background: #f5f5f5;
          }
          .location-label {
            font-size: 12pt;
            color: #666;
          }
          .location {
            font-weight: bold;
            font-size: 32pt;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            font-size: 12pt;
            border-top: 2px solid #000;
            padding-top: 0.15in;
            margin-top: 0.15in;
          }
          @media print {
            .label { border: none; }
            .location-section { background: #f5f5f5; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${items.map((item, i) => `
          <div class="label">
            <div class="header">
              <div class="sku">${item.masterSku}</div>
              <div class="qty-box">${item.adjustedQty}</div>
            </div>
            <div class="barcode-container">
              <svg id="barcode-${i}"></svg>
            </div>
            <div class="product-name">${item.productName}</div>
            <div class="location-section">
              <div class="location-label">PICK FROM</div>
              <div class="location">${item.warehouseLocation || '—'}</div>
            </div>
            <div class="footer">
              <div>${shipmentInternalId}</div>
              <div>Pick Label</div>
            </div>
          </div>
        `).join('')}
        <script>
          ${items.map((item, i) => `
            JsBarcode("#barcode-${i}", "${item.masterSku}", {
              format: "CODE128",
              width: 2,
              height: 40,
              displayValue: false,
              margin: 0
            });
          `).join('')}
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
  }

  // Handle barcode scan in interactive mode
  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    
    const scannedValue = scanInput.trim().toUpperCase()
    const currentItem = pendingItems[currentPickIndex]
    
    if (!currentItem) return

    if (scannedValue === currentItem.masterSku.toUpperCase()) {
      // Correct scan
      setScanResult('correct')
      playSound('success')
      
      // Mark as picked
      const updatedItems = items.map(item => 
        item.id === currentItem.id 
          ? { ...item, pickStatus: 'picked' }
          : item
      )
      onItemsChange(updatedItems)
      
      // Move to next after delay
      setTimeout(() => {
        setScanResult(null)
        setScanInput('')
        if (currentPickIndex < pendingItems.length - 1) {
          setCurrentPickIndex(prev => prev + 1)
        } else {
          // All done
          setShowInteractivePick(false)
        }
      }, 1000)
    } else {
      // Wrong scan
      setScanResult('wrong')
      playSound('error')
      setTimeout(() => {
        setScanResult(null)
        setScanInput('')
      }, 2000)
    }
  }

  const playSound = (type: 'success' | 'error') => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      if (type === 'success') {
        oscillator.frequency.value = 800
        oscillator.type = 'sine'
      } else {
        oscillator.frequency.value = 200
        oscillator.type = 'square'
      }
      
      gainNode.gain.value = 0.3
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.2)
    } catch (e) {
      // Audio not supported
    }
  }

  const skipItem = () => {
    const currentItem = pendingItems[currentPickIndex]
    if (!currentItem) return
    
    const updatedItems = items.map(item => 
      item.id === currentItem.id 
        ? { ...item, pickStatus: 'skipped' }
        : item
    )
    onItemsChange(updatedItems)
    
    if (currentPickIndex < pendingItems.length - 1) {
      setCurrentPickIndex(prev => prev + 1)
    } else {
      setShowInteractivePick(false)
    }
  }

  const manualConfirm = () => {
    const currentItem = pendingItems[currentPickIndex]
    if (!currentItem) return
    
    const updatedItems = items.map(item => 
      item.id === currentItem.id 
        ? { ...item, pickStatus: 'picked' }
        : item
    )
    onItemsChange(updatedItems)
    
    if (currentPickIndex < pendingItems.length - 1) {
      setCurrentPickIndex(prev => prev + 1)
    } else {
      setShowInteractivePick(false)
    }
  }

  // Open adjust modal for current item
  const openAdjustModal = () => {
    const currentItem = pendingItems[currentPickIndex]
    if (!currentItem) return
    setAdjustQty(currentItem.adjustedQty)
    setAdjustReason('')
    setAdjustType('shipment')
    setShowAdjustModal(true)
  }

  // Apply adjustment
  const applyAdjustment = async () => {
    const currentItem = pendingItems[currentPickIndex]
    if (!currentItem) return

    if (adjustType === 'shipment') {
      // Just adjust the shipment qty
      const updatedItems = items.map(item => 
        item.id === currentItem.id 
          ? { ...item, adjustedQty: adjustQty }
          : item
      )
      onItemsChange(updatedItems)
    } else {
      // Adjust warehouse inventory
      if (onInventoryAdjust) {
        await onInventoryAdjust(currentItem.masterSku, adjustQty, adjustReason)
      }
      // Also update shipment qty to match
      const updatedItems = items.map(item => 
        item.id === currentItem.id 
          ? { ...item, adjustedQty: adjustQty }
          : item
      )
      onItemsChange(updatedItems)
    }

    setShowAdjustModal(false)
  }

  const adjustItemQty = (itemId: number) => {
    const updatedItems = items.map(item => 
      item.id === itemId 
        ? { ...item, adjustedQty: newQty }
        : item
    )
    onItemsChange(updatedItems)
    setEditingQty(null)
  }

  const markAllPicked = () => {
    const updatedItems = items.map(item => ({ ...item, pickStatus: 'picked' }))
    onItemsChange(updatedItems)
    onPickComplete()
  }

  // Mark a skipped item as picked
  const markSkippedAsPicked = (itemId: number) => {
    const updatedItems = items.map(item => 
      item.id === itemId 
        ? { ...item, pickStatus: 'picked' }
        : item
    )
    onItemsChange(updatedItems)
  }

  // Reset item to pending
  const resetToPending = (itemId: number) => {
    const updatedItems = items.map(item => 
      item.id === itemId 
        ? { ...item, pickStatus: 'pending' }
        : item
    )
    onItemsChange(updatedItems)
  }

  // Interactive Pick Mode (fullscreen)
  if (showInteractivePick) {
    const currentItem = pendingItems[currentPickIndex]
    
    if (!currentItem) {
      return (
        <div className="fixed inset-0 bg-slate-900 z-50 flex items-center justify-center">
          <div className="text-center p-6">
            <CheckCircle className="w-24 h-24 text-emerald-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-white mb-2">Picking Complete!</h1>
            <p className="text-slate-400 mb-6">
              {pickedCount} items picked, {skippedCount} skipped
            </p>
            {skippedCount > 0 && (
              <div className="mb-6 p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                <p className="text-amber-400 mb-2">⚠ {skippedCount} items were skipped</p>
                <p className="text-slate-400 text-sm">You can mark them as picked from the picking section</p>
              </div>
            )}
            <Button onClick={() => setShowInteractivePick(false)}>
              Continue to Labels
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className={`fixed inset-0 z-50 flex flex-col ${
        scanResult === 'correct' ? 'bg-emerald-900' : 
        scanResult === 'wrong' ? 'bg-red-900' : 
        'bg-slate-900'
      } transition-colors duration-300`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h1 className="text-xl font-bold text-white">Interactive Pick Mode</h1>
          <button 
            onClick={() => setShowInteractivePick(false)}
            className="text-slate-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Progress */}
        <div className="px-4 py-2 bg-slate-800">
          <div className="flex items-center justify-between text-sm text-slate-400 mb-1">
            <span>Item {currentPickIndex + 1} of {pendingItems.length}</span>
            <span>{pickedCount} picked, {skippedCount} skipped</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-cyan-500 transition-all"
              style={{ width: `${((currentPickIndex) / pendingItems.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Current Item */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          {scanResult === 'correct' ? (
            <div className="animate-pulse">
              <CheckCircle className="w-32 h-32 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-4xl font-bold text-white">CORRECT</h2>
            </div>
          ) : scanResult === 'wrong' ? (
            <div className="animate-pulse">
              <AlertCircle className="w-32 h-32 text-red-400 mx-auto mb-4" />
              <h2 className="text-4xl font-bold text-white">WRONG ITEM</h2>
              <p className="text-xl text-red-300 mt-2">Expected: {currentItem.masterSku}</p>
            </div>
          ) : (
            <>
              <div className="text-6xl font-bold text-white mb-4">
                {currentItem.masterSku}
              </div>
              <div className="text-2xl text-slate-300 mb-6 max-w-md">
                {currentItem.productName}
              </div>
              <div className="text-8xl font-bold text-cyan-400 mb-6">
                {currentItem.adjustedQty}
              </div>
              <div className="text-xl text-slate-400 mb-4">
                📍 {currentItem.warehouseLocation || 'No location set'}
              </div>
              
              {/* Adjust Button */}
              <button
                onClick={openAdjustModal}
                className="text-amber-400 hover:text-amber-300 flex items-center gap-2 mb-4"
              >
                <Edit3 className="w-5 h-5" />
                Adjust Quantity
              </button>
            </>
          )}
        </div>

        {/* Scan Input */}
        {!scanResult && (
          <div className="p-6 bg-slate-800 border-t border-slate-700">
            <div className="max-w-md mx-auto">
              <label className="block text-center text-slate-400 mb-2">
                Scan SKU barcode or type manually
              </label>
              <input
                type="text"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={handleScan}
                autoFocus
                className="w-full px-4 py-4 text-2xl text-center bg-slate-900 border-2 border-slate-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                placeholder="Scan or type SKU..."
              />
              <div className="flex gap-4 mt-4">
                <Button variant="outline" onClick={skipItem} className="flex-1">
                  Skip Item
                </Button>
                <Button onClick={manualConfirm} className="flex-1">
                  Manual Confirm
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Adjust Modal */}
        {showAdjustModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-60">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
              <h2 className="text-xl font-bold text-white mb-4">Adjust Quantity</h2>
              
              <div className="space-y-4">
                {/* Adjust Type */}
                <div>
                  <label className="block text-sm text-slate-400 mb-2">What to adjust?</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAdjustType('shipment')}
                      className={`flex-1 p-3 rounded-lg border text-left ${
                        adjustType === 'shipment'
                          ? 'border-cyan-500 bg-cyan-500/10'
                          : 'border-slate-600'
                      }`}
                    >
                      <div className="font-medium text-white">Shipment Only</div>
                      <div className="text-xs text-slate-400">Change qty for this shipment</div>
                    </button>
                    <button
                      onClick={() => setAdjustType('inventory')}
                      className={`flex-1 p-3 rounded-lg border text-left ${
                        adjustType === 'inventory'
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-slate-600'
                      }`}
                    >
                      <div className="font-medium text-white">Warehouse Inventory</div>
                      <div className="text-xs text-slate-400">Actual stock is different</div>
                    </button>
                  </div>
                </div>

                {/* Qty Input */}
                <div>
                  <label className="block text-sm text-slate-400 mb-2">New Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-3 text-xl bg-slate-900 border border-slate-600 rounded-lg text-white text-center"
                  />
                </div>

                {/* Reason (for inventory adjustments) */}
                {adjustType === 'inventory' && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Reason for discrepancy</label>
                    <select
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white"
                    >
                      <option value="">Select reason...</option>
                      <option value="damaged">Damaged/Defective</option>
                      <option value="missing">Missing/Lost</option>
                      <option value="count_error">Count Error</option>
                      <option value="theft">Theft/Shrinkage</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setShowAdjustModal(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={applyAdjustment} className="flex-1">
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className={`w-5 h-5 ${allPicked ? 'text-emerald-400' : 'text-cyan-400'}`} />
            <CardTitle>
              Picking
              {allPicked && <span className="ml-2 text-sm text-emerald-400">✓ Complete</span>}
            </CardTitle>
          </div>
          {expanded ? <ChevronUp /> : <ChevronDown />}
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="space-y-4">
          {allPicked ? (
            <div className="space-y-4">
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-4 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-emerald-400 font-medium">All items picked!</p>
                <p className="text-sm text-slate-400 mt-1">
                  {pickedCount} picked, {skippedCount} skipped
                </p>
              </div>

              {/* Skipped Items - Allow marking as picked */}
              {skippedItems.length > 0 && (
                <div className="border border-amber-500/30 rounded-lg p-4">
                  <h3 className="text-amber-400 font-medium mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Skipped Items ({skippedItems.length})
                  </h3>
                  <div className="space-y-2">
                    {skippedItems.map(item => (
                      <div 
                        key={item.id}
                        className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                      >
                        <div>
                          <div className="font-medium text-white">{item.masterSku}</div>
                          <div className="text-sm text-slate-400">{item.adjustedQty} units</div>
                        </div>
                        <Button size="sm" onClick={() => markSkippedAsPicked(item.id)}>
                          <Check className="w-4 h-4 mr-1" />
                          Mark Picked
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Pick Methods */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <h3 className="font-medium text-white mb-2 flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    Print Pick Labels
                  </h3>
                  <p className="text-sm text-slate-400 mb-3">
                    Print a label for each SKU to place in picking bins
                  </p>
                  <Button variant="outline" size="sm" onClick={printPickLabels}>
                    Print Labels (4x6")
                  </Button>
                </div>

                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <h3 className="font-medium text-white mb-2 flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Interactive Pick
                  </h3>
                  <p className="text-sm text-slate-400 mb-3">
                    Mobile-friendly with scanning & qty adjustment
                  </p>
                  <Button 
                    size="sm" 
                    onClick={() => {
                      setCurrentPickIndex(0)
                      setShowInteractivePick(true)
                    }}
                  >
                    Start Picking
                  </Button>
                </div>
              </div>

              {/* Items List with Qty Adjustment */}
              <div className="border-t border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">
                  Items to Pick ({pendingItems.length} remaining)
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {items.map(item => (
                    <div 
                      key={item.id}
                      className={`flex items-center gap-4 p-3 rounded-lg ${
                        item.pickStatus === 'picked' ? 'bg-emerald-900/20 border border-emerald-500/30' :
                        item.pickStatus === 'skipped' ? 'bg-amber-900/20 border border-amber-500/30' :
                        'bg-slate-800/50 border border-slate-700'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white">{item.masterSku}</div>
                        <div className="text-sm text-slate-400 truncate">{item.productName}</div>
                      </div>
                      <div className="text-sm text-slate-400">
                        📍 {item.warehouseLocation || '—'}
                      </div>
                      <div className="flex items-center gap-2">
                        {editingQty === item.id ? (
                          <>
                            <input
                              type="number"
                              min="0"
                              value={newQty}
                              onChange={(e) => setNewQty(parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                              autoFocus
                            />
                            <Button size="sm" onClick={() => adjustItemQty(item.id)}>
                              <Check className="w-3 h-3" />
                            </Button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingQty(item.id)
                              setNewQty(item.adjustedQty)
                            }}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white font-bold"
                            title="Click to adjust qty"
                          >
                            {item.adjustedQty}
                          </button>
                        )}
                      </div>
                      <div className="w-24 text-right flex items-center justify-end gap-2">
                        {item.pickStatus === 'picked' && (
                          <>
                            <span className="text-emerald-400 text-sm">✓ Picked</span>
                            <button
                              onClick={() => resetToPending(item.id)}
                              className="text-slate-400 hover:text-white"
                              title="Reset to pending"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        {item.pickStatus === 'skipped' && (
                          <>
                            <button
                              onClick={() => markSkippedAsPicked(item.id)}
                              className="text-amber-400 hover:text-amber-300 text-sm"
                            >
                              Mark Picked
                            </button>
                          </>
                        )}
                        {(!item.pickStatus || item.pickStatus === 'pending') && (
                          <span className="text-slate-500 text-sm">Pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Manual Complete */}
              <div className="border-t border-slate-700 pt-4">
                <p className="text-sm text-slate-400 mb-2">
                  Already picked using a printed list?
                </p>
                <Button variant="outline" onClick={markAllPicked}>
                  <Check className="w-4 h-4 mr-2" />
                  Mark All Picked
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
