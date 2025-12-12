'use client'

import { useState, useEffect } from 'react'
import { Printer, Tag, X, AlertCircle, Check, Loader2, Download } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import QRCode from 'qrcode'
import jsPDF from 'jspdf'

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

  const printLabels = async (item: ShipmentItem) => {
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
    
    // ALWAYS request fresh codes - don't use cached codes
    if (labelType === 'fnsku_tp' || labelType === 'tp_only') {
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

    const html = await generateLabelHTML(item, labelType, quantity, transparencyCodes, width, height)
    
    // Generate and auto-download PDF
    await generatePDF(html, item, labelType, quantity, width, height)
  }

  /**
   * Generate label HTML that matches the reference image:
   * - Blue/gray header on LEFT with Transparency icon
   * - QR code with vertical code text beside it
   * - Dashed divider line
   * - Brand logo on RIGHT (if available)
   * - CODE128 barcode
   * - FNSKU text
   * - Product name
   * - "NEW" condition
   */
  const generateLabelHTML = async (
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
    
    // Calculate dimensions in pixels (96 DPI for screen)
    const widthPx = widthIn * 96
    const heightPx = heightIn * 96
    
    // For 3x1 combo label: TP section ~38%, FNSKU section ~62%
    const tpSectionWidth = isCombo ? Math.floor(widthPx * 0.38) : widthPx
    const fnskuSectionWidth = isCombo ? widthPx - tpSectionWidth : widthPx
    
    // Generate QR codes as base64 data URLs
    const qrCodeImages: string[] = []
    if (isTpOnly || isCombo) {
      const qrOptions = {
        width: 300, // Higher resolution for sharp printing
        margin: 1,
        errorCorrectionLevel: 'M' as const,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        type: 'image/png' as const
      }
      
      for (let i = 0; i < quantity; i++) {
        const code = tpCodes[i]
        
        if (!code || String(code).trim() === '') {
          console.warn(`Missing Transparency code at index ${i} - skipping QR code generation`)
          qrCodeImages.push('')
          continue
        }
        
        const codeStr = String(code).trim()
        
        // Validate it's a real Transparency code
        const isOnlyDigits = /^\d+$/.test(codeStr)
        const isUPCLength = codeStr.length >= 8 && codeStr.length <= 14
        if (isOnlyDigits && isUPCLength) {
          console.error(`ERROR: Code at index ${i} is a UPC, not a Transparency code: "${codeStr}"`)
          qrCodeImages.push('')
          continue
        }
        
        if (codeStr.length < 15) {
          console.warn(`Suspicious code at index ${i}: "${codeStr}" - too short (length: ${codeStr.length})`)
          qrCodeImages.push('')
          continue
        }
        
        try {
          const dataUrl = await QRCode.toDataURL(codeStr, qrOptions)
          qrCodeImages.push(dataUrl)
        } catch (error) {
          console.error(`Error generating QR code ${i}:`, error)
          qrCodeImages.push('')
        }
      }
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Labels - ${item.masterSku}</title>
        <meta name="viewport" content="width=${widthPx}px, height=${heightPx}px">
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { 
            size: ${widthIn}in ${heightIn}in;
            margin: 0;
          }
          @media print {
            @page { size: ${widthIn}in ${heightIn}in; margin: 0; }
            html, body { margin: 0; padding: 0; }
            .label { page-break-after: always; page-break-inside: avoid; }
          }
          html, body { 
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .label {
            width: ${widthIn}in;
            height: ${heightIn}in;
            display: flex;
            flex-direction: row;
            overflow: hidden;
            background: #fff;
            page-break-after: always;
            page-break-inside: avoid;
            border: 1px solid #ddd;
          }
          .label:last-child { 
            page-break-after: auto; 
          }
          
          /* ========== TRANSPARENCY SECTION (LEFT) ========== */
          .tp-section {
            width: ${isCombo ? '38%' : '100%'};
            height: 100%;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            padding: 0.04in 0.03in;
            position: relative;
            border-right: 1px dashed #999;
            overflow: visible;
          }
          
          .tp-header {
            display: flex;
            align-items: center;
            gap: 3px;
            margin-bottom: 0.03in;
          }
          
          .tp-icon {
            width: 12px;
            height: 12px;
            flex-shrink: 0;
          }

          .tp-header-text {
            font-size: 5pt;
            font-weight: 500;
            color: #000;
            line-height: 1.1;
          }
          
          .qr-container {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 2px;
            flex: 1;
          }
          
          .qr-code {
            width: 0.65in;
            height: 0.65in;
            min-width: 0.65in;
            min-height: 0.65in;
            background: #fff;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-left: 0.02in;
            flex-shrink: 0;
          }

          .qr-code img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            image-rendering: crisp-edges;
            image-rendering: pixelated;
          }
          
          .tp-code-vertical {
            font-size: 7pt;
            font-weight: normal;
            color: #000;
            letter-spacing: 0.5px;
            white-space: nowrap;
            transform: rotate(90deg);
            margin-left: -0.15in;
            margin-right: -0.15in;
          }
          
          /* ========== FNSKU SECTION (RIGHT) ========== */
          .fnsku-section {
            width: ${isCombo ? '62%' : '100%'};
            height: 100%;
            background: #fff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 0.03in 0.04in 0.02in 0.04in;
            overflow: hidden;
          }
          
          .brand-logo {
            height: 0.16in;
            max-width: 90%;
            object-fit: contain;
            margin-bottom: 0.01in;
          }
          
          .barcode-container {
            width: 100%;
            display: flex;
            justify-content: center;
            margin: 0;
            overflow: visible;
          }

          .barcode-container svg {
            width: auto;
            max-width: 100%;
            height: 0.32in;
            display: block;
          }
          
          .fnsku-text {
            font-size: 7pt;
            font-weight: bold;
            color: #000;
            margin-top: 0.01in;
            letter-spacing: 0.2px;
            word-break: break-word;
          }
          
          .product-name {
            font-size: 5pt;
            color: #333;
            text-align: center;
            max-width: 100%;
            line-height: 1.1;
            margin-top: 0.005in;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
            white-space: normal;
          }
          
          .condition {
            font-size: 6pt;
            font-weight: bold;
            color: #000;
            margin-top: 0.005in;
          }
          
          /* ========== TP ONLY LABEL (1x1) ========== */
          .tp-only-label {
            width: ${widthIn}in;
            height: ${heightIn}in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #fff;
            padding: 0.05in;
          }
          
          .tp-only-label .tp-header {
            margin-bottom: 0.03in;
          }

          .tp-only-label .qr-code {
            width: 0.75in;
            height: 0.75in;
            min-width: 0.75in;
            min-height: 0.75in;
          }
        </style>
      </head>
      <body>
        ${Array.from({ length: quantity }, (_, i) => {
          const tpCode = tpCodes[i] || ''
          const qrImage = qrCodeImages[i] || ''
          
          if (isTpOnly) {
            return `
              <div class="label tp-only-label">
                <div class="tp-header">
                  <svg class="tp-icon" viewBox="0 0 24 24" fill="none">
                    <rect x="0" y="0" width="5" height="5" fill="#000"/>
                    <rect x="5" y="0" width="5" height="5" fill="#000"/>
                    <rect x="0" y="5" width="5" height="5" fill="#000"/>
                    <rect x="10" y="0" width="5" height="5" fill="#000"/>
                    <rect x="15" y="0" width="5" height="5" fill="#fff" stroke="#000" stroke-width="0.5"/>
                    <rect x="20" y="0" width="4" height="5" fill="#000"/>
                    <rect x="10" y="5" width="5" height="5" fill="#fff" stroke="#000" stroke-width="0.5"/>
                    <rect x="15" y="5" width="5" height="5" fill="#000"/>
                    <path d="M15 10 L20 10 L20 20 Q20 24 16 24 L15 24 L15 10 Z" fill="#000"/>
                  </svg>
                  <span class="tp-header-text">Scan with the<br/>Transparency app</span>
                </div>
                ${qrImage ? `<div class="qr-code"><img src="${qrImage}" alt="QR Code" /></div>` : '<div class="qr-code"></div>'}
              </div>
            `
          }
          
          if (isCombo) {
            return `
              <div class="label">
                <div class="tp-section">
                  <div class="tp-header">
                    <svg class="tp-icon" viewBox="0 0 24 24" fill="none">
                      <rect x="0" y="0" width="5" height="5" fill="#000"/>
                      <rect x="5" y="0" width="5" height="5" fill="#000"/>
                      <rect x="0" y="5" width="5" height="5" fill="#000"/>
                      <rect x="10" y="0" width="5" height="5" fill="#000"/>
                      <rect x="15" y="0" width="5" height="5" fill="#fff" stroke="#000" stroke-width="0.5"/>
                      <rect x="20" y="0" width="4" height="5" fill="#000"/>
                      <rect x="10" y="5" width="5" height="5" fill="#fff" stroke="#000" stroke-width="0.5"/>
                      <rect x="15" y="5" width="5" height="5" fill="#000"/>
                      <path d="M15 10 L20 10 L20 20 Q20 24 16 24 L15 24 L15 10 Z" fill="#000"/>
                    </svg>
                    <span class="tp-header-text">Scan with the<br/>Transparency app</span>
                  </div>
                  <div class="qr-container">
                    ${qrImage ? `<div class="qr-code"><img src="${qrImage}" alt="QR Code" /></div>` : '<div class="qr-code"></div>'}
                    <div class="tp-code-vertical">${item.masterSku}</div>
                  </div>
                </div>
                <div class="fnsku-section">
                  ${item.brandLogo ? `<img src="${item.brandLogo}" class="brand-logo" alt="Brand" />` : ''}
                  <div class="barcode-container"><svg id="barcode-${i}"></svg></div>
                  <div class="fnsku-text">${item.fnsku || item.masterSku}</div>
                  <div class="product-name">${item.productName}</div>
                  <div class="condition">New</div>
                </div>
              </div>
            `
          }

          // FNSKU only
          return `
            <div class="label">
              <div class="fnsku-section" style="width: 100%;">
                ${item.brandLogo ? `<img src="${item.brandLogo}" class="brand-logo" alt="Brand" />` : ''}
                <div class="barcode-container"><svg id="barcode-${i}"></svg></div>
                <div class="fnsku-text">${item.fnsku || item.masterSku}</div>
                <div class="product-name">${item.productName}</div>
                <div class="condition">New</div>
              </div>
            </div>
          `
        }).join('')}
        <script>
          ${(isFnskuOnly || isCombo) ? Array.from({ length: quantity }, (_, i) => {
            const barcodeValue = item.fnsku || item.masterSku
            return `
            JsBarcode("#barcode-${i}", "${barcodeValue}", {
              format: "CODE128",
              width: 1.0,
              height: 32,
              displayValue: false,
              margin: 0,
              background: "#ffffff",
              lineColor: "#000000",
              fontSize: 0,
              textMargin: 0,
              valid: function(valid) {
                if (!valid) {
                  console.error("Invalid barcode data for CODE128: ${barcodeValue}");
                }
              }
            });
          `
          }).join('') : ''}
          
          window.dispatchEvent(new Event('jsbarcode-rendered'));
        </script>
      </body>
      </html>
    `
  }

  const generatePDF = async (
    html: string,
    item: ShipmentItem,
    labelType: LabelType,
    quantity: number,
    widthIn: number,
    heightIn: number
  ) => {
    // Create a temporary iframe to render the HTML
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.left = '-9999px'
    iframe.style.width = `${widthIn * 96}px`
    iframe.style.height = `${heightIn * 96}px`
    document.body.appendChild(iframe)
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      alert('Failed to create PDF - browser security restrictions')
      document.body.removeChild(iframe)
      return
    }
    
    iframeDoc.open()
    iframeDoc.write(html)
    iframeDoc.close()
    
    // Wait for content to load
    await new Promise<void>(resolve => {
      let loadedCount = 0
      const totalToLoad = iframeDoc.images.length + (labelType === 'fnsku_only' || labelType === 'fnsku_tp' ? quantity : 0)
      
      const checkComplete = () => {
        loadedCount++
        if (loadedCount >= totalToLoad) {
          resolve()
        }
      }
      
      Array.from(iframeDoc.images).forEach(img => {
        if (img.complete) {
          checkComplete()
        } else {
          img.onload = checkComplete
          img.onerror = checkComplete
        }
      })
      
      if (labelType === 'fnsku_only' || labelType === 'fnsku_tp') {
        iframe.contentWindow?.addEventListener('jsbarcode-rendered', checkComplete)
      }
      
      setTimeout(() => resolve(), 3000)
    })
    
    // Create PDF with correct page size
    // IMPORTANT: For jsPDF, when width > height, use 'landscape' orientation
    const widthMm = widthIn * 25.4
    const heightMm = heightIn * 25.4
    const isLandscape = widthIn > heightIn
    
    // For jsPDF with custom format, always pass [smaller, larger] and use orientation
    const smallerDim = Math.min(widthMm, heightMm)
    const largerDim = Math.max(widthMm, heightMm)
    
    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [smallerDim, largerDim],
      compress: true,
    })
    
    // Generate each label as a separate page
    for (let i = 0; i < quantity; i++) {
      if (i > 0) {
        pdf.addPage([smallerDim, largerDim], isLandscape ? 'landscape' : 'portrait')
      }
      
      const labelElement = iframeDoc.querySelectorAll('.label')[i] as HTMLElement
      if (!labelElement) {
        console.warn(`Label ${i} not found`)
        continue
      }
      
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(labelElement, {
        width: widthIn * 96,
        height: heightIn * 96,
        scale: 3, // Higher scale for better quality
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })
      
      const imgData = canvas.toDataURL('image/png', 1.0)
      pdf.addImage(imgData, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST')
    }
    
    // Clean up
    document.body.removeChild(iframe)
    
    // Auto-download PDF
    const fileName = `Labels-${item.masterSku}-${new Date().getTime()}.pdf`
    pdf.save(fileName)
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

                <div className={`px-2 py-1 rounded text-xs font-medium ${display.bg} ${display.color}`}>
                  {display.label}
                </div>

                {(labelType === 'fnsku_tp' || labelType === 'tp_only') && hasTpCodes && (
                  <div className="text-xs text-emerald-400">
                    ✓ {tpCodes[item.masterSku].length} codes
                  </div>
                )}

                {labelType === 'none' ? (
                  <div className="text-sm text-slate-400 italic">
                    Pre-labeled
                  </div>
                ) : (
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
