'use client'

import { useState, useEffect } from 'react'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react'

interface EmailTemplate {
  id: string
  name: string
  supplierId: string | null
  supplierName?: string
  subject: string
  body: string
  createdAt: string
  updatedAt: string
}

interface TemplateManagerModalProps {
  isOpen: boolean
  onClose: () => void
  suppliers: Array<{ id: number; name: string }>
}

export default function TemplateManagerModal({ isOpen, onClose, suppliers }: TemplateManagerModalProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchTemplates()
    }
  }, [isOpen])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/email-templates')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTemplate = async (template: Partial<EmailTemplate>) => {
    try {
      const method = template.id ? 'PUT' : 'POST'
      const url = template.id ? `/api/email-templates/${template.id}` : '/api/email-templates'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      })

      if (res.ok) {
        await fetchTemplates()
        setEditingTemplate(null)
      } else {
        alert('Failed to save template')
      }
    } catch (error) {
      console.error('Error saving template:', error)
      alert('Failed to save template')
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return

    try {
      const res = await fetch(`/api/email-templates/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        await fetchTemplates()
      } else {
        alert('Failed to delete template')
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Failed to delete template')
    }
  }

  if (editingTemplate) {
    return (
      <TemplateEditor
        template={editingTemplate}
        suppliers={suppliers}
        onSave={handleSaveTemplate}
        onCancel={() => setEditingTemplate(null)}
        previewMode={previewMode}
        onTogglePreview={() => setPreviewMode(!previewMode)}
      />
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Templates"
      size="xl"
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Manage email templates for purchase orders</p>
          <Button variant="primary" size="sm" onClick={() => setEditingTemplate({
            id: '',
            name: 'New Template',
            supplierId: null,
            subject: '',
            body: '',
            createdAt: '',
            updatedAt: '',
          })}>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            No templates found. Create your first template to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{template.name}</span>
                    {template.supplierId ? (
                      <span className="text-xs text-slate-400">
                        ({suppliers.find(s => s.id === parseInt(template.supplierId!))?.name || 'Unknown Supplier'})
                      </span>
                    ) : (
                      <span className="text-xs text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded">Default</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-1">{template.subject}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Updated: {new Date(template.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingTemplate(template)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  {template.supplierId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function TemplateEditor({
  template,
  suppliers,
  onSave,
  onCancel,
  previewMode,
  onTogglePreview,
}: {
  template: EmailTemplate
  suppliers: Array<{ id: number; name: string }>
  onSave: (template: Partial<EmailTemplate>) => void
  onCancel: () => void
  previewMode: boolean
  onTogglePreview: () => void
}) {
  const [name, setName] = useState(template.name)
  const [supplierId, setSupplierId] = useState(template.supplierId || '')
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)

  const resolveTemplate = (templateText: string): string => {
    // Sample data for preview
    return templateText
      .replace(/{{po_number}}/g, 'PO-2025-001')
      .replace(/{{supplier_name}}/g, 'Sample Supplier')
      .replace(/{{order_date}}/g, new Date().toLocaleDateString())
      .replace(/{{expected_date}}/g, new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString())
      .replace(/{{items_table}}/g, 'SKU-001 - Product Name: 10 × $5.00 = $50.00')
      .replace(/{{items_total}}/g, '$50.00')
      .replace(/{{total_amount}}/g, '$60.00')
      .replace(/{{custom_message}}/g, '')
  }

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={template.id ? 'Edit Template' : 'New Template'}
      size="xl"
    >
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Template Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Supplier (optional)</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">None (Default Template)</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id.toString()}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-300">Body</label>
            <Button variant="ghost" size="sm" onClick={onTogglePreview}>
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
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full min-h-[300px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm"
              placeholder="Email body with {{variables}}..."
            />
          )}
        </div>
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => onSave({
            id: template.id,
            name,
            supplierId: supplierId || null,
            subject,
            body,
          })}
        >
          Save Template
        </Button>
      </ModalFooter>
    </Modal>
  )
}

