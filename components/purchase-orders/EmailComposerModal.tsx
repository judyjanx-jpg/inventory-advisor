'use client'

import { useState, useEffect } from 'react'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Send, Save, X, Eye, EyeOff, Plus } from 'lucide-react'

interface EmailComposerModalProps {
  isOpen: boolean
  onClose: () => void
  po: {
    poNumber: string
    supplier: { name: string; email?: string }
    orderDate: string
    expectedArrivalDate?: string | null
    items: Array<{
      masterSku: string
      product?: { title: string }
      quantityOrdered: number
      unitCost: number
      lineTotal: number
    }>
    subtotal: number
    shippingCost?: number | null
    tax?: number | null
    otherCosts?: number | null
    total: number
  }
  onSend?: (emailData: EmailData) => void
}

interface EmailData {
  to: string
  cc?: string
  subject: string
  body: string
  attachPDF: boolean
  attachExcel: boolean
}

const DEFAULT_TEMPLATE = `Dear {{supplier_name}},

Please find below our purchase order {{po_number}}.

Order Date: {{order_date}}
Expected Delivery: {{expected_date}}

{{items_table}}

Total: {{total_amount}}

{{custom_message}}

Please confirm receipt of this order and expected delivery date.

Best regards,
[Company Name]`

export default function EmailComposerModal({ isOpen, onClose, po, onSend }: EmailComposerModalProps) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(`Purchase Order ${po.poNumber} - ${po.supplier.name}`)
  const [body, setBody] = useState(DEFAULT_TEMPLATE)
  const [attachPDF, setAttachPDF] = useState(true)
  const [attachExcel, setAttachExcel] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('default')

  useEffect(() => {
    if (isOpen && po.supplier.email) {
      setTo(po.supplier.email)
    }
  }, [isOpen, po.supplier.email])

  const variables = [
    { key: 'po_number', label: 'PO Number' },
    { key: 'supplier_name', label: 'Supplier Name' },
    { key: 'order_date', label: 'Order Date' },
    { key: 'expected_date', label: 'Expected Date' },
    { key: 'items_table', label: 'Items Table' },
    { key: 'items_total', label: 'Items Total' },
    { key: 'total_amount', label: 'Total Amount' },
    { key: 'custom_message', label: 'Custom Message' },
  ]

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById('email-body') as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const text = textarea.value
      const before = text.substring(0, start)
      const after = text.substring(end)
      const newText = before + `{{${variable}}}` + after
      setBody(newText)
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length + 4, start + variable.length + 4)
      }, 0)
    }
  }

  const resolveTemplate = (template: string): string => {
    const itemsTable = po.items.map(item => 
      `  ${item.masterSku} - ${item.product?.title || 'Unknown'}: ${item.quantityOrdered} × $${Number(item.unitCost).toFixed(2)} = $${Number(item.lineTotal).toFixed(2)}`
    ).join('\n')

    return template
      .replace(/{{po_number}}/g, po.poNumber)
      .replace(/{{supplier_name}}/g, po.supplier.name)
      .replace(/{{order_date}}/g, new Date(po.orderDate).toLocaleDateString())
      .replace(/{{expected_date}}/g, po.expectedArrivalDate ? new Date(po.expectedArrivalDate).toLocaleDateString() : 'Not set')
      .replace(/{{items_table}}/g, itemsTable)
      .replace(/{{items_total}}/g, `$${Number(po.subtotal).toFixed(2)}`)
      .replace(/{{total_amount}}/g, `$${Number(po.total).toFixed(2)}`)
      .replace(/{{custom_message}}/g, '')
  }

  const handleSend = () => {
    if (!to) {
      alert('Please enter a recipient email address')
      return
    }

    const emailData: EmailData = {
      to,
      cc: cc || undefined,
      subject,
      body: previewMode ? resolveTemplate(body) : body,
      attachPDF,
      attachExcel,
    }

    if (onSend) {
      onSend(emailData)
    } else {
      // Fallback: open email client
      const mailtoLink = `mailto:${to}${cc ? `?cc=${cc}` : ''}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(resolveTemplate(body))}`
      window.location.href = mailtoLink
    }

    onClose()
  }

  const handleSaveTemplate = (type: 'default' | 'supplier') => {
    // TODO: Save template via API
    console.log('Save template:', type, { subject, body })
    alert(`Template saved as ${type === 'default' ? 'Default Template' : `${po.supplier.name} Template`}`)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Purchase Order"
      size="xl"
    >
      <div className="p-6 space-y-6">
        {/* Recipients */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              To <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="supplier@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Cc</label>
            <input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="cc@example.com (optional)"
            />
          </div>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        {/* Template Selector */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Template</label>
          <select
            value={selectedTemplate}
            onChange={(e) => {
              setSelectedTemplate(e.target.value)
              if (e.target.value === 'default') {
                setBody(DEFAULT_TEMPLATE)
              } else if (e.target.value === 'blank') {
                setBody('')
              }
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="default">Default Template</option>
            <option value="supplier">{po.supplier.name} Template</option>
            <option value="blank">Blank</option>
          </select>
        </div>

        {/* Variable Insertion */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Insert Variable</label>
          <div className="flex flex-wrap gap-2">
            {variables.map((variable) => (
              <Button
                key={variable.key}
                variant="outline"
                size="sm"
                onClick={() => insertVariable(variable.key)}
              >
                {variable.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Body Editor */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-300">Body</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewMode(!previewMode)}
            >
              {previewMode ? (
                <>
                  <EyeOff className="w-4 h-4 mr-2" />
                  Edit
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </>
              )}
            </Button>
          </div>
          {previewMode ? (
            <div className="min-h-[300px] p-4 bg-slate-900 border border-slate-700 rounded-lg text-white whitespace-pre-wrap">
              {resolveTemplate(body)}
            </div>
          ) : (
            <textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full min-h-[300px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm"
              placeholder="Email body with {{variables}}..."
            />
          )}
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Attachments</label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={attachPDF}
              onChange={(e) => setAttachPDF(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-slate-300">Attach PO as PDF</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={attachExcel}
              onChange={(e) => setAttachExcel(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-slate-300">Attach PO as Excel</span>
          </label>
        </div>
      </div>

      <ModalFooter>
        <div className="flex items-center justify-between w-full">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => handleSaveTemplate('default')}>
              <Save className="w-4 h-4 mr-2" />
              Save as Default
            </Button>
            <Button variant="ghost" onClick={() => handleSaveTemplate('supplier')}>
              <Save className="w-4 h-4 mr-2" />
              Save as {po.supplier.name}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSend}>
              <Send className="w-4 h-4 mr-2" />
              Send Email
            </Button>
          </div>
        </div>
      </ModalFooter>
    </Modal>
  )
}

