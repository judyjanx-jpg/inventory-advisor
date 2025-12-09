'use client'

import { useEffect, useRef, useState } from 'react'
import { Printer, Tag, Package, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'

interface ShipmentItem {
  masterSku: string
  fnsku: string | null
  productName: string
  adjustedQty: number
}

interface Box {
  boxNumber: number
  items: { sku: string; quantity: number }[]
  weightLbs?: number
  lengthInches?: number
  widthInches?: number
  heightInches?: number
}

interface LabelPrinterProps {
  shipmentId: string
  shipmentInternalId: string
  destinationFc: string
  items: ShipmentItem[]
  boxes: Box[]
}

type LabelType = 'fnsku' | 'box'
type LabelSize = '30up' | '10up' | '1up'

export default function LabelPrinter({
  shipmentId,
  shipmentInternalId,
  destinationFc,
  items,
  boxes,
}: LabelPrinterProps) {
  const [showModal, setShowModal] = useState(false)
  const [labelType, setLabelType] = useState<LabelType>('fnsku')
  const [labelSize, setLabelSize] = useState<LabelSize>('30up')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [labelsPerItem, setLabelsPerItem] = useState<Record<string, number>>({})

  // Initialize labels per item based on adjusted qty
  useEffect(() => {
    const initial: Record<string, number> = {}
    items.forEach(item => {
      initial[item.masterSku] = item.adjustedQty
    })
    setLabelsPerItem(initial)
    setSelectedItems(items.map(i => i.masterSku))
  }, [items])

  const toggleItem = (sku: string) => {
    setSelectedItems(prev => 
      prev.includes(sku) 
        ? prev.filter(s => s !== sku)
        : [...prev, sku]
    )
  }

  const selectAll = () => {
    setSelectedItems(items.map(i => i.masterSku))
  }

  const selectNone = () => {
    setSelectedItems([])
  }

  const printFnskuLabels = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Please allow popups to print labels')
      return
    }

    // Generate labels HTML
    const labelsToprint: { fnsku: string; sku: string; title: string }[] = []
    
    for (const item of items) {
      if (!selectedItems.includes(item.masterSku)) continue
      const count = labelsPerItem[item.masterSku] || 0
      for (let i = 0; i < count; i++) {
        labelsToprint.push({
          fnsku: item.fnsku || item.masterSku,
          sku: item.masterSku,
          title: item.productName,
        })
      }
    }

    const labelStyles = getLabelStyles(labelSize)
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>FNSKU Labels - ${shipmentInternalId}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { 
            size: letter; 
            margin: ${labelStyles.pageMargin}; 
          }
          body { 
            font-family: Arial, sans-serif; 
          }
          .label-grid {
            display: grid;
            grid-template-columns: repeat(${labelStyles.cols}, 1fr);
            gap: ${labelStyles.gap};
          }
          .label {
            width: ${labelStyles.width};
            height: ${labelStyles.height};
            padding: ${labelStyles.padding};
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            page-break-inside: avoid;
            border: 1px dashed #ccc;
          }
          .label svg {
            max-width: 100%;
            height: auto;
          }
          .label-title {
            font-size: ${labelStyles.titleSize};
            text-align: center;
            margin-top: 2px;
            line-height: 1.1;
            max-height: 2.2em;
            overflow: hidden;
          }
          .label-sku {
            font-size: ${labelStyles.skuSize};
            color: #666;
            margin-top: 1px;
          }
          .label-condition {
            font-size: ${labelStyles.conditionSize};
            font-weight: bold;
            margin-top: 2px;
          }
          @media print {
            .label { border: none; }
          }
        </style>
      </head>
      <body>
        <div class="label-grid">
          ${labelsToprint.map((label, i) => `
            <div class="label">
              <svg id="barcode-${i}"></svg>
              <div class="label-title">${label.title.slice(0, 50)}${label.title.length > 50 ? '...' : ''}</div>
              <div class="label-sku">${label.sku}</div>
              <div class="label-condition">New</div>
            </div>
          `).join('')}
        </div>
        <script>
          ${labelsToprint.map((label, i) => `
            JsBarcode("#barcode-${i}", "${label.fnsku}", {
              format: "CODE128",
              width: 1.5,
              height: 30,
              displayValue: true,
              fontSize: 10,
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

  const printBoxLabels = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('Please allow popups to print labels')
      return
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Box Labels - ${shipmentInternalId}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: letter; margin: 0.5in; }
          body { font-family: Arial, sans-serif; }
          .box-label {
            width: 4in;
            height: 6in;
            border: 2px solid #000;
            padding: 0.25in;
            margin-bottom: 0.5in;
            page-break-after: always;
            display: flex;
            flex-direction: column;
          }
          .box-label:last-child { page-break-after: auto; }
          .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 0.15in;
            margin-bottom: 0.15in;
          }
          .header h1 {
            font-size: 24pt;
            margin: 0;
          }
          .header h2 {
            font-size: 14pt;
            font-weight: normal;
            color: #666;
          }
          .destination {
            background: #000;
            color: #fff;
            text-align: center;
            padding: 0.1in;
            font-size: 18pt;
            font-weight: bold;
            margin-bottom: 0.15in;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.1in;
            font-size: 11pt;
          }
          .info-label { font-weight: bold; }
          .contents {
            flex: 1;
            border-top: 1px solid #ccc;
            padding-top: 0.1in;
            margin-top: 0.1in;
          }
          .contents h3 {
            font-size: 10pt;
            margin-bottom: 0.05in;
          }
          .contents-list {
            font-size: 9pt;
            line-height: 1.3;
          }
          .footer {
            border-top: 1px solid #000;
            padding-top: 0.1in;
            margin-top: 0.1in;
            font-size: 9pt;
            text-align: center;
          }
        </style>
      </head>
      <body>
        ${boxes.map(box => {
          const boxItems = box.items.map(bi => {
            const item = items.find(i => i.masterSku === bi.sku)
            return { ...bi, title: item?.productName || bi.sku }
          })
          const totalUnits = box.items.reduce((sum, i) => sum + i.quantity, 0)
          
          return `
            <div class="box-label">
              <div class="header">
                <h1>Box ${box.boxNumber} of ${boxes.length}</h1>
                <h2>${shipmentInternalId}</h2>
              </div>
              <div class="destination">FBA ${destinationFc || 'US'}</div>
              <div class="info-row">
                <span class="info-label">Total Units:</span>
                <span>${totalUnits}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Total SKUs:</span>
                <span>${box.items.length}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Weight:</span>
                <span>${box.weightLbs ? box.weightLbs + ' lb' : '—'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Dimensions:</span>
                <span>${box.lengthInches || '—'}" × ${box.widthInches || '—'}" × ${box.heightInches || '—'}"</span>
              </div>
              <div class="contents">
                <h3>Contents:</h3>
                <div class="contents-list">
                  ${boxItems.map(item => `
                    <div>${item.sku} × ${item.quantity} — ${item.title.slice(0, 40)}${item.title.length > 40 ? '...' : ''}</div>
                  `).join('')}
                </div>
              </div>
              <div class="footer">
                Handle with care • Keep dry
              </div>
            </div>
          `
        }).join('')}
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
  }

  const getLabelStyles = (size: LabelSize) => {
    switch (size) {
      case '30up': // Avery 5160
        return {
          cols: 3,
          width: '2.625in',
          height: '1in',
          gap: '0.125in',
          pageMargin: '0.5in 0.19in',
          padding: '0.05in',
          titleSize: '7pt',
          skuSize: '6pt',
          conditionSize: '6pt',
        }
      case '10up': // Avery 5163
        return {
          cols: 2,
          width: '4in',
          height: '2in',
          gap: '0in',
          pageMargin: '0.5in',
          padding: '0.1in',
          titleSize: '9pt',
          skuSize: '8pt',
          conditionSize: '8pt',
        }
      case '1up': // Full page
        return {
          cols: 1,
          width: '3in',
          height: '2in',
          gap: '0.25in',
          pageMargin: '0.5in',
          padding: '0.15in',
          titleSize: '10pt',
          skuSize: '9pt',
          conditionSize: '9pt',
        }
    }
  }

  const totalLabels = selectedItems.reduce((sum, sku) => sum + (labelsPerItem[sku] || 0), 0)

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Labels
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setLabelType('fnsku'); setShowModal(true); }}>
                <Tag className="w-4 h-4 mr-2" />
                Print FNSKU Labels
              </Button>
              <Button variant="outline" onClick={() => printBoxLabels()}>
                <Package className="w-4 h-4 mr-2" />
                Print Box Labels
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            Print FNSKU barcode labels for products and box labels for shipping.
          </p>
        </CardContent>
      </Card>

      {/* FNSKU Label Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Print FNSKU Labels</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Label Size */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Label Size</label>
              <div className="flex gap-2">
                {[
                  { value: '30up', label: '30-up (Avery 5160)', desc: '1" × 2.625"' },
                  { value: '10up', label: '10-up (Avery 5163)', desc: '2" × 4"' },
                  { value: '1up', label: 'Single Labels', desc: '2" × 3"' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLabelSize(opt.value as LabelSize)}
                    className={`flex-1 p-3 rounded-lg border text-left ${
                      labelSize === opt.value
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-600 hover:border-slate-500'
                    }`}
                  >
                    <div className="font-medium text-white text-sm">{opt.label}</div>
                    <div className="text-xs text-slate-400">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Items Selection */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">Select Items & Quantities</label>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-cyan-400 hover:text-cyan-300">Select All</button>
                  <span className="text-slate-600">|</span>
                  <button onClick={selectNone} className="text-xs text-cyan-400 hover:text-cyan-300">Select None</button>
                </div>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {items.map(item => (
                  <div 
                    key={item.masterSku}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      selectedItems.includes(item.masterSku)
                        ? 'border-cyan-500/50 bg-slate-700/50'
                        : 'border-slate-700 bg-slate-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.masterSku)}
                      onChange={() => toggleItem(item.masterSku)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium text-sm">{item.masterSku}</div>
                      <div className="text-slate-400 text-xs truncate">{item.fnsku || 'No FNSKU'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Labels:</span>
                      <input
                        type="number"
                        min="0"
                        value={labelsPerItem[item.masterSku] || 0}
                        onChange={(e) => setLabelsPerItem({
                          ...labelsPerItem,
                          [item.masterSku]: parseInt(e.target.value) || 0
                        })}
                        className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm text-center"
                        disabled={!selectedItems.includes(item.masterSku)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary & Print */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-700">
              <div className="text-slate-300">
                <span className="font-bold text-white">{totalLabels}</span> labels to print
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button onClick={printFnskuLabels} disabled={totalLabels === 0}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print Labels
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}





