'use client'

import { useState, useEffect } from 'react'
import { Printer, Tag, X, AlertCircle, Check, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'

interface ShipmentItem {
  masterSku: string
  fnsku: string | null
  productName: string
  adjustedQty: number
  labelType?: string // fnsku_tp, fnsku_only, tp_only
  transparencyEnabled?: boolean
}

interface ProductLabelPrinterProps {
  shipmentId: string
  shipmentInternalId: string
  items: ShipmentItem[]
}

type LabelType = 'fnsku_tp' | 'fnsku_only' | 'tp_only'

interface LabelSettings {
  fnskuLabelSize: string
  tpOnlyLabelSize: string
}

export default function ProductLabelPrinter({
  shipmentId,
  shipmentInternalId,
  items,
}: ProductLabelPrinterProps) {
  const [showModal, setShowModal] = useState(false)
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({})
  const [labelSettings, setLabelSettings] = useState<LabelSettings>({
    fnskuLabelSize: '3x1',
    tpOnlyLabelSize: '1x1',
  })
  const [loadingTp, setLoadingTp] = useState<string | null>(null)
  const [tpCodes, setTpCodes] = useState<Record<string, string[]>>({})

  // Load settings from localStorage
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

    // Initialize label counts
    const counts: Record<string, number> = {}
    items.forEach(item => {
      counts[item.masterSku] = item.adjustedQty
    })
    setLabelCounts(counts)
  }, [items])

  const getLabelType = (item: ShipmentItem): LabelType => {
    if (item.labelType) return item.labelType as LabelType
    if (item.transparencyEnabled) return 'fnsku_tp'
    return 'fnsku_only'
  }

  const getLabelTypeDisplay = (type: LabelType) => {
    switch (type) {
      case 'fnsku_tp': return { label: 'FNSKU + TP', color: 'text-purple-400', bg: 'bg-purple-900/20' }
      case 'fnsku_only': return { label: 'FNSKU', color: 'text-cyan-400', bg: 'bg-cyan-900/20' }
      case 'tp_only': return { label: 'TP Only', color: 'text-amber-400', bg: 'bg-amber-900/20' }
    }
  }

  // Request Transparency codes from Amazon API
  const requestTransparencyCodes = async (sku: string, quantity: number): Promise<string[]> => {
    setLoadingTp(sku)
    
    try {
      const res = await fetch(`/api/transparency/codes?sku=${encodeURIComponent(sku)}&quantity=${quantity}`)
      const data = await res.json()
      
      if (!res.ok) {
        console.error('Error getting transparency codes:', data.error)
        // Fall back to placeholder codes if API fails
        const placeholderCodes: string[] = []
        for (let i = 0; i < quantity; i++) {
          placeholderCodes.push(`TP${Date.now()}${i.toString().padStart(4, '0')}`)
        }
        setTpCodes(prev => ({ ...prev, [sku]: placeholderCodes }))
        setLoadingTp(null)
        return placeholderCodes
      }
      
      const codes = data.codes || []
      setTpCodes(prev => ({ ...prev, [sku]: codes }))
      setLoadingTp(null)
      return codes
    } catch (error) {
      console.error('Error fetching transparency codes:', error)
      // Fall back to placeholder codes
      const placeholderCodes: string[] = []
      for (let i = 0; i < quantity; i++) {
        placeholderCodes.push(`TP${Date.now()}${i.toString().padStart(4, '0')}`)
      }
      setTpCodes(prev => ({ ...prev, [sku]: placeholderCodes }))
      setLoadingTp(null)
      return placeholderCodes
    }
  }

  const printLabels = async (item: ShipmentItem) => {
    const labelType = getLabelType(item)
    const quantity = labelCounts[item.masterSku] || item.adjustedQty
    
    let transparencyCodes: string[] = []
    
    // Get transparency codes if needed
    if (labelType === 'fnsku_tp' || labelType === 'tp_only') {
      if (tpCodes[item.masterSku] && tpCodes[item.masterSku].length >= quantity) {
        transparencyCodes = tpCodes[item.masterSku].slice(0, quantity)
      } else {
        transparencyCodes = await requestTransparencyCodes(item.masterSku, quantity)
      }
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Please allow popups to print labels')
      return
    }

    const labelSize = labelType === 'tp_only' 
      ? labelSettings.tpOnlyLabelSize 
      : labelSettings.fnskuLabelSize

    const [width, height] = labelSize.split('x').map(s => parseFloat(s))

    const html = generateLabelHTML(item, labelType, quantity, transparencyCodes, width, height)
    
    printWindow.document.write(html)
    printWindow.document.close()
  }

  const generateLabelHTML = (
    item: ShipmentItem, 
    labelType: LabelType, 
    quantity: number,
    tpCodes: string[],
    widthIn: number,
    heightIn: number
  ) => {
    const isCombo = labelType === 'fnsku_tp'
    const isFnskuOnly = labelType === 'fnsku_only'
    const isTpOnly = labelType === 'tp_only'

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Labels - ${item.masterSku}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { 
            size: ${widthIn}in ${heightIn}in; 
            margin: 0; 
          }
          body { font-family: Arial, sans-serif; }
          .label {
            width: ${widthIn}in;
            height: ${heightIn}in;
            padding: 0.05in;
            page-break-after: always;
            display: flex;
            ${isCombo ? 'flex-direction: row; justify-content: space-between;' : 'flex-direction: column; align-items: center; justify-content: center;'}
            overflow: hidden;
          }
          .label:last-child { page-break-after: auto; }
          .fnsku-section {
            ${isCombo ? 'flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;' : ''}
          }
          .tp-section {
            ${isCombo ? 'width: 0.9in; display: flex; flex-direction: column; align-items: center; justify-content: center; border-left: 1px dashed #ccc; padding-left: 0.05in;' : ''}
          }
          .barcode svg {
            max-width: 100%;
            height: ${isTpOnly ? '0.4in' : '0.5in'};
          }
          .qr-code {
            width: ${isTpOnly ? '0.7in' : '0.8in'};
            height: ${isTpOnly ? '0.7in' : '0.8in'};
          }
          .fnsku-text {
            font-size: ${isTpOnly ? '6pt' : '8pt'};
            margin-top: 2px;
          }
          .product-name {
            font-size: 6pt;
            text-align: center;
            max-width: 100%;
            overflow: hidden;
            margin-top: 2px;
          }
          .condition {
            font-size: 7pt;
            font-weight: bold;
          }
          .tp-label {
            font-size: 6pt;
            margin-bottom: 2px;
          }
        </style>
      </head>
      <body>
        ${Array.from({ length: quantity }, (_, i) => {
          const tpCode = tpCodes[i] || ''
          return `
            <div class="label">
              ${isFnskuOnly || isCombo ? `
                <div class="fnsku-section">
                  <div class="barcode"><svg id="barcode-${i}"></svg></div>
                  <div class="fnsku-text">${item.fnsku || item.masterSku}</div>
                  <div class="product-name">${item.productName.slice(0, 30)}${item.productName.length > 30 ? '...' : ''}</div>
                  <div class="condition">New</div>
                </div>
              ` : ''}
              ${isTpOnly || isCombo ? `
                <div class="tp-section">
                  <div class="tp-label">Transparency</div>
                  <canvas id="qr-${i}" class="qr-code"></canvas>
                  <div class="fnsku-text" style="font-size: 5pt;">${tpCode.slice(-8)}</div>
                </div>
              ` : ''}
            </div>
          `
        }).join('')}
        <script>
          ${(isFnskuOnly || isCombo) ? Array.from({ length: quantity }, (_, i) => `
            JsBarcode("#barcode-${i}", "${item.fnsku || item.masterSku}", {
              format: "CODE128",
              width: 1.5,
              height: 35,
              displayValue: false,
              margin: 0
            });
          `).join('') : ''}
          
          ${(isTpOnly || isCombo) ? `
            window.onload = async function() {
              ${Array.from({ length: quantity }, (_, i) => `
                await QRCode.toCanvas(document.getElementById('qr-${i}'), '${tpCodes[i] || ''}', {
                  width: ${isTpOnly ? 60 : 70},
                  margin: 0
                });
              `).join('')}
              window.print();
            };
          ` : `
            window.onload = function() { window.print(); };
          `}
        </script>
      </body>
      </html>
    `
  }

  // Group items by label type
  const itemsByType = {
    fnsku_tp: items.filter(i => getLabelType(i) === 'fnsku_tp'),
    fnsku_only: items.filter(i => getLabelType(i) === 'fnsku_only'),
    tp_only: items.filter(i => getLabelType(i) === 'tp_only'),
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
          Print FNSKU and/or Transparency labels for each product
        </p>

        {/* Labels Table */}
        <div className="space-y-2">
          {items.map(item => {
            const labelType = getLabelType(item)
            const display = getLabelTypeDisplay(labelType)
            const hasTpCodes = tpCodes[item.masterSku]?.length > 0
            
            return (
              <div 
                key={item.masterSku}
                className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white">{item.masterSku}</div>
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

                <div className={`px-2 py-1 rounded text-xs font-medium ${display.bg} ${display.color}`}>
                  {display.label}
                </div>

                {(labelType === 'fnsku_tp' || labelType === 'tp_only') && hasTpCodes && (
                  <div className="text-xs text-emerald-400">
                    ✓ {tpCodes[item.masterSku].length} codes
                  </div>
                )}

                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => printLabels(item)}
                  disabled={loadingTp === item.masterSku}
                >
                  {loadingTp === item.masterSku ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Getting TP...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4 mr-1" />
                      Print
                    </>
                  )}
                </Button>
              </div>
            )
          })}
        </div>

        {/* Summary by Type */}
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
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

