'use client'

import React, { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { 
  Warehouse, 
  Plus, 
  Edit, 
  Trash2,
  Upload,
  Download,
  MapPin,
  Phone,
  Mail,
  Building2,
  CheckCircle,
  XCircle
} from 'lucide-react'

interface WarehouseType {
  id: number
  name: string
  code: string
  address?: string
  city?: string
  state?: string
  country?: string
  zipCode?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  isActive: boolean
  isDefault: boolean
  _count?: {
    inventory: number
  }
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseType | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null)
  const [uploadData, setUploadData] = useState('')
  const [uploading, setUploading] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    state: '',
    country: 'US',
    zipCode: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    isDefault: false,
  })

  useEffect(() => {
    fetchWarehouses()
  }, [])

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouses')
      const data = await res.json()
      setWarehouses(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching warehouses:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (warehouse?: WarehouseType) => {
    if (warehouse) {
      setEditingWarehouse(warehouse)
      setFormData({
        name: warehouse.name,
        code: warehouse.code,
        address: warehouse.address || '',
        city: warehouse.city || '',
        state: warehouse.state || '',
        country: warehouse.country || 'US',
        zipCode: warehouse.zipCode || '',
        contactName: warehouse.contactName || '',
        contactEmail: warehouse.contactEmail || '',
        contactPhone: warehouse.contactPhone || '',
        isDefault: warehouse.isDefault,
      })
    } else {
      setEditingWarehouse(null)
      setFormData({
        name: '',
        code: '',
        address: '',
        city: '',
        state: '',
        country: 'US',
        zipCode: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        isDefault: false,
      })
    }
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = editingWarehouse
        ? `/api/warehouses/${editingWarehouse.id}`
        : '/api/warehouses'
      const method = editingWarehouse ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setShowModal(false)
        fetchWarehouses()
      }
    } catch (error) {
      console.error('Error saving warehouse:', error)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this warehouse? This will also delete all inventory records.')) {
      return
    }

    try {
      await fetch(`/api/warehouses/${id}`, { method: 'DELETE' })
      fetchWarehouses()
    } catch (error) {
      console.error('Error deleting warehouse:', error)
    }
  }

  const handleUpload = async () => {
    if (!selectedWarehouse || !uploadData.trim()) {
      alert('Please select a warehouse and paste inventory data')
      return
    }

    setUploading(true)
    try {
      // Parse CSV or JSON data
      let inventory: Array<{ masterSku: string; available: number; reserved?: number }> = []

      // Try JSON first
      try {
        inventory = JSON.parse(uploadData)
      } catch {
        // If not JSON, try CSV
        const lines = uploadData.trim().split('\n')
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
        const skuIndex = headers.findIndex(h => h.includes('sku'))
        const availableIndex = headers.findIndex(h => h.includes('available') || h.includes('qty') || h.includes('quantity'))
        const reservedIndex = headers.findIndex(h => h.includes('reserved'))

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim())
          if (values[skuIndex]) {
            inventory.push({
              masterSku: values[skuIndex],
              available: parseInt(values[availableIndex] || '0') || 0,
              reserved: reservedIndex >= 0 ? parseInt(values[reservedIndex] || '0') || 0 : 0,
            })
          }
        }
      }

      const res = await fetch(`/api/warehouses/${selectedWarehouse}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory }),
      })

      if (res.ok) {
        setShowUploadModal(false)
        setUploadData('')
        setSelectedWarehouse(null)
        alert('Inventory uploaded successfully!')
      } else {
        const error = await res.json()
        alert(`Error: ${error.error}`)
      }
    } catch (error) {
      console.error('Error uploading inventory:', error)
      alert('Error uploading inventory')
    } finally {
      setUploading(false)
    }
  }

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
            <h1 className="text-3xl font-bold text-white">Warehouses</h1>
            <p className="text-slate-400 mt-1">Manage local warehouses and inventory</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowUploadModal(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Inventory
            </Button>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Warehouse
            </Button>
          </div>
        </div>

        {/* Warehouses List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {warehouses.map((warehouse) => (
            <Card key={warehouse.id} hover>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-cyan-400" />
                      {warehouse.name}
                    </CardTitle>
                    <CardDescription className="mt-1 font-mono">
                      {warehouse.code}
                      {warehouse.isDefault && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-cyan-500/20 text-cyan-400 rounded-full">
                          Default
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenModal(warehouse)}
                      className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4 text-slate-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(warehouse.id)}
                      className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(warehouse.address || warehouse.city) && (
                    <div className="flex items-start gap-2 text-sm text-slate-400">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        {warehouse.address && <p>{warehouse.address}</p>}
                        {(warehouse.city || warehouse.state) && (
                          <p>
                            {warehouse.city}
                            {warehouse.city && warehouse.state && ', '}
                            {warehouse.state} {warehouse.zipCode}
                          </p>
                        )}
                        {warehouse.country && <p>{warehouse.country}</p>}
                      </div>
                    </div>
                  )}

                  {warehouse.contactName && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Phone className="w-4 h-4" />
                      <span>{warehouse.contactName}</span>
                      {warehouse.contactPhone && <span>• {warehouse.contactPhone}</span>}
                    </div>
                  )}

                  {warehouse.contactEmail && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Mail className="w-4 h-4" />
                      <span>{warehouse.contactEmail}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                    <div className="flex items-center gap-2">
                      {warehouse.isActive ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-500" />
                      )}
                      <span className="text-sm text-slate-400">
                        {warehouse.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <span className="text-sm text-slate-400">
                      {warehouse._count?.inventory || 0} SKUs
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {warehouses.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Warehouse className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-lg text-slate-400">No warehouses yet</p>
              <p className="text-sm text-slate-500 mt-1">Add your first warehouse to start tracking inventory</p>
              <Button className="mt-4" onClick={() => handleOpenModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Warehouse
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Add/Edit Modal */}
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingWarehouse ? 'Edit Warehouse' : 'Add Warehouse'}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Code *
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="WH1"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  ZIP Code
                </label>
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Contact Name
              </label>
              <input
                type="text"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
              />
              <label htmlFor="isDefault" className="text-sm text-slate-300">
                Set as default warehouse
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingWarehouse ? 'Update' : 'Create'} Warehouse
              </Button>
            </div>
          </form>
        </Modal>

        {/* Upload Inventory Modal */}
        <Modal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          title="Upload Warehouse Inventory"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Select Warehouse *
              </label>
              <select
                value={selectedWarehouse || ''}
                onChange={(e) => setSelectedWarehouse(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">Choose a warehouse...</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Inventory Data (CSV or JSON) *
              </label>
              <p className="text-xs text-slate-400 mb-2">
                CSV format: SKU,Available,Reserved (header row optional)<br />
                JSON format: [&#123;"masterSku": "SKU1", "available": 100, "reserved": 0&#125;, ...]
              </p>
              <textarea
                value={uploadData}
                onChange={(e) => setUploadData(e.target.value)}
                rows={10}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
                placeholder="SKU,Available,Reserved&#10;SKU1,100,0&#10;SKU2,50,5"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowUploadModal(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleUpload} loading={uploading}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Inventory
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </MainLayout>
  )
}

