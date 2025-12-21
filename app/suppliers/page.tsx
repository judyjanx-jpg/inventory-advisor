'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import { 
  Users, 
  Plus, 
  Search,
  Edit,
  Trash2,
  Mail,
  Phone,
  Globe,
  Clock,
  Package,
  FileText,
  MoreVertical
} from 'lucide-react'

interface Supplier {
  id: number
  name: string
  contactName?: string
  email?: string
  phone?: string
  website?: string
  address?: string
  country?: string
  leadTimeDays?: number
  paymentTerms?: string
  minimumOrderValue?: number
  status: string
  _count?: {
    products: number
    purchaseOrders: number
  }
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal states
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [saving, setSaving] = useState(false)
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    country: '',
    leadTimeDays: 14,
    paymentTerms: '',
    minimumOrderValue: 0,
    notes: '',
  })

  useEffect(() => {
    fetchSuppliers()
  }, [])

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers')
      const data = await res.json()
      setSuppliers(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = () => {
    setForm({
      name: '',
      contactName: '',
      email: '',
      phone: '',
      website: '',
      address: '',
      country: '',
      leadTimeDays: 14,
      paymentTerms: '',
      minimumOrderValue: 0,
      notes: '',
    })
    setEditingSupplier(null)
    setShowAddSupplier(true)
  }

  const openEditModal = (supplier: Supplier) => {
    setForm({
      name: supplier.name,
      contactName: supplier.contactName || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      website: supplier.website || '',
      address: supplier.address || '',
      country: supplier.country || '',
      leadTimeDays: supplier.leadTimeDays || 14,
      paymentTerms: supplier.paymentTerms || '',
      minimumOrderValue: supplier.minimumOrderValue || 0,
      notes: '',
    })
    setEditingSupplier(supplier)
    setShowAddSupplier(true)
  }

  const saveSupplier = async () => {
    if (!form.name) return
    
    setSaving(true)
    try {
      const url = editingSupplier 
        ? `/api/suppliers/${editingSupplier.id}` 
        : '/api/suppliers'
      
      const res = await fetch(url, {
        method: editingSupplier ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      
      if (res.ok) {
        fetchSuppliers()
        setShowAddSupplier(false)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save supplier')
      }
    } catch (error) {
      console.error('Error saving supplier:', error)
    } finally {
      setSaving(false)
    }
  }

  const deleteSupplier = async (supplier: Supplier) => {
    if (!confirm(`Are you sure you want to delete ${supplier.name}?`)) return
    
    try {
      await fetch(`/api/suppliers/${supplier.id}`, { method: 'DELETE' })
      fetchSuppliers()
    } catch (error) {
      console.error('Error deleting supplier:', error)
    }
  }

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contactName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.country?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Suppliers</h1>
            <p className="text-[var(--muted-foreground)] mt-1">Manage your suppliers and vendor relationships</p>
          </div>
          <Button onClick={openAddModal}>
            <Plus className="w-4 h-4 mr-2" />
            Add Supplier
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
              <input
                type="text"
                placeholder="Search suppliers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Suppliers Grid */}
        {filteredSuppliers.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Users className="w-16 h-16 text-[var(--muted-foreground)] mx-auto mb-4" />
                <p className="text-lg text-[var(--muted-foreground)]">No suppliers found</p>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">Add your first supplier to get started</p>
                <Button className="mt-4" onClick={openAddModal}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Supplier
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSuppliers.map((supplier) => (
              <Card key={supplier.id} hover>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-xl flex items-center justify-center">
                        <span className="text-xl">🏭</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--foreground)]">{supplier.name}</h3>
                        {supplier.country && (
                          <p className="text-sm text-[var(--muted-foreground)]">{supplier.country}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(supplier)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteSupplier(supplier)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {supplier.contactName && (
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <Users className="w-4 h-4" />
                        <span>{supplier.contactName}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <Mail className="w-4 h-4" />
                        <span>{supplier.email}</span>
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <Phone className="w-4 h-4" />
                        <span>{supplier.phone}</span>
                      </div>
                    )}
                    {supplier.leadTimeDays && (
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <Clock className="w-4 h-4" />
                        <span>{supplier.leadTimeDays} day lead time</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--border)]/50">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm text-[var(--muted-foreground)]">
                        {supplier._count?.products || 0} products
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-[var(--muted-foreground)]">
                        {supplier._count?.purchaseOrders || 0} POs
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Supplier Modal */}
      <Modal
        isOpen={showAddSupplier}
        onClose={() => setShowAddSupplier(false)}
        title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Company Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Golden Chain Manufacturing"
              className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Contact Name</label>
            <input
              type="text"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              placeholder="e.g., John Smith"
              className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="supplier@example.com"
              className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 234 567 8900"
              className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Country</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="e.g., China"
              className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Lead Time (days)</label>
            <input
              type="number"
              value={form.leadTimeDays}
              onChange={(e) => setForm({ ...form, leadTimeDays: parseInt(e.target.value) || 0 })}
              placeholder="14"
              className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Payment Terms</label>
            <input
              type="text"
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
              placeholder="e.g., Net 30, 50% upfront"
              className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">Address</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Full address..."
              rows={2}
              className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowAddSupplier(false)}>
            Cancel
          </Button>
          <Button onClick={saveSupplier} loading={saving} disabled={!form.name}>
            {editingSupplier ? 'Update Supplier' : 'Add Supplier'}
          </Button>
        </ModalFooter>
      </Modal>
    </MainLayout>
  )
}
