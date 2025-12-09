'use client'

import { useState, useRef, useEffect } from 'react'
import Button from '@/components/ui/Button'
import { Download, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react'

interface ExportDropdownProps {
  po: {
    id: number
    poNumber: string
    supplier: { name: string }
    createdDate: string
    orderDate?: string | null
    expectedArrivalDate?: string | null
    status: string
    items: Array<{
      masterSku: string
      product?: { title: string }
      quantityOrdered: number
      quantityReceived: number
      quantityDamaged: number
      unitCost: number
      lineTotal: number
    }>
    subtotal: number
    shippingCost?: number | null
    tax?: number | null
    otherCosts?: number | null
    total: number
  }
}

export default function ExportDropdown({ po }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const exportItemsExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      
      const worksheetData = [
        ['SKU', 'Product Name', 'Ordered', 'Received', 'Damaged', 'Unit Cost', 'Line Total'],
        ...po.items.map(item => [
          item.masterSku,
          item.product?.title || '',
          item.quantityOrdered,
          item.quantityReceived,
          item.quantityDamaged,
          Number(item.unitCost),
          Number(item.lineTotal),
        ]),
      ]

      const ws = XLSX.utils.aoa_to_sheet(worksheetData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Items')
      
      const fileName = `${po.poNumber}-items.xlsx`
      XLSX.writeFile(wb, fileName)
      setIsOpen(false)
    } catch (error) {
      console.error('Error exporting items:', error)
      alert('Failed to export items')
    }
  }

  const exportFullPOExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      
      // Sheet 1: PO Information
      const infoData = [
        ['Field', 'Value'],
        ['PO Number', po.poNumber],
        ['Supplier', po.supplier.name],
        ['Created Date', new Date(po.createdDate).toLocaleDateString()],
        ['Order Date', po.orderDate ? new Date(po.orderDate).toLocaleDateString() : ''],
        ['Expected Date', po.expectedArrivalDate ? new Date(po.expectedArrivalDate).toLocaleDateString() : ''],
        ['Status', po.status],
      ]
      const infoWs = XLSX.utils.aoa_to_sheet(infoData)

      // Sheet 2: Items
      const itemsData = [
        ['SKU', 'Product Name', 'Ordered', 'Received', 'Damaged', 'Unit Cost', 'Line Total'],
        ...po.items.map(item => [
          item.masterSku,
          item.product?.title || '',
          item.quantityOrdered,
          item.quantityReceived,
          item.quantityDamaged,
          Number(item.unitCost),
          Number(item.lineTotal),
        ]),
      ]
      const itemsWs = XLSX.utils.aoa_to_sheet(itemsData)

      // Sheet 3: Additional Costs
      const costsData = [
        ['Description', 'Amount'],
        ['Shipping', Number(po.shippingCost || 0)],
        ['Tax', Number(po.tax || 0)],
        ['Other Costs', Number(po.otherCosts || 0)],
      ]
      const costsWs = XLSX.utils.aoa_to_sheet(costsData)

      // Sheet 4: Summary
      const summaryData = [
        ['', 'Amount'],
        ['Items Subtotal', Number(po.subtotal)],
        ['Additional Costs', Number(po.shippingCost || 0) + Number(po.tax || 0) + Number(po.otherCosts || 0)],
        ['Grand Total', Number(po.total)],
      ]
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, infoWs, 'PO Information')
      XLSX.utils.book_append_sheet(wb, itemsWs, 'Items')
      XLSX.utils.book_append_sheet(wb, costsWs, 'Additional Costs')
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')
      
      const fileName = `${po.poNumber}-full.xlsx`
      XLSX.writeFile(wb, fileName)
      setIsOpen(false)
    } catch (error) {
      console.error('Error exporting full PO:', error)
      alert('Failed to export PO')
    }
  }

  const exportPDF = async () => {
    try {
      // Using html2canvas and jspdf for PDF generation
      const html2canvas = (await import('html2canvas')).default
      const jsPDF = (await import('jspdf')).default

      // Create a temporary element with PO content
      const element = document.createElement('div')
      element.className = 'p-8 bg-white text-black'
      element.innerHTML = `
        <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 20px;">Purchase Order: ${po.poNumber}</h1>
        <div style="margin-bottom: 20px;">
          <p><strong>Supplier:</strong> ${po.supplier.name}</p>
          <p><strong>Date:</strong> ${new Date(po.orderDate || po.createdDate).toLocaleDateString()}</p>
          <p><strong>Status:</strong> ${po.status}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">SKU</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Product</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Qty</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Unit Cost</th>
              <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${po.items.map(item => `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${item.masterSku}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${item.product?.title || ''}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantityOrdered}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${Number(item.unitCost).toFixed(2)}</td>
                <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${Number(item.lineTotal).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="text-align: right; margin-top: 20px;">
          <p><strong>Subtotal:</strong> $${Number(po.subtotal).toFixed(2)}</p>
          <p><strong>Total:</strong> $${Number(po.total).toFixed(2)}</p>
        </div>
      `
      document.body.appendChild(element)

      const canvas = await html2canvas(element)
      const imgData = canvas.toDataURL('image/png')
      
      const pdf = new jsPDF()
      const imgWidth = 210
      const pageHeight = 297
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight

      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      pdf.save(`${po.poNumber}.pdf`)
      document.body.removeChild(element)
      setIsOpen(false)
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert('Failed to export PDF')
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Download className="w-4 h-4 mr-2" />
        Export
        <ChevronDown className="w-4 h-4 ml-2" />
      </Button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 min-w-[200px]">
          <button
            onClick={exportItemsExcel}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700 transition-colors rounded-t-lg"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            <span className="text-white">Export Items (Excel)</span>
          </button>
          <button
            onClick={exportFullPOExcel}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700 transition-colors border-t border-slate-700"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            <span className="text-white">Export Full PO (Excel)</span>
          </button>
          <button
            onClick={exportPDF}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700 transition-colors border-t border-slate-700 rounded-b-lg"
          >
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-white">Export as PDF</span>
          </button>
        </div>
      )}
    </div>
  )
}

