'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Truck, Plus, Package, Clock, CheckCircle, ArrowRight, Trash2 } from 'lucide-react'

interface Shipment {
  id: number
  internalId: string | null
  status: string
  fromLocation?: { name: string; code: string } | null
  destinationFc: string | null
  createdAt: string
  shippedAt: string | null
  totalItems: number
  totalUnits: number
}

export default function FbaShipmentsPage() {
  const [loading, setLoading] = useState(true)
  const [shipments, setShipments] = useState<Shipment[]>([])

  useEffect(() => {
    fetchShipments()
  }, [])

  const fetchShipments = async () => {
    try {
      const res = await fetch('/api/shipments')
      const data = await res.json()
      if (res.ok) {
        setShipments(data.shipments || data || [])
      }
    } catch (error) {
      console.error('Error fetching shipments:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteShipment = async (id: number) => {
    if (!confirm('Are you sure you want to delete this draft shipment?')) return
    
    try {
      const res = await fetch(`/api/shipments/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setShipments(shipments.filter(s => s.id !== id))
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete shipment')
      }
    } catch (error) {
      console.error('Error deleting shipment:', error)
    }
  }

  // Calculate stats
  const stats = {
    working: shipments.filter(s => s.status === 'draft' || s.status === 'ready').length,
    inTransit: shipments.filter(s => s.status === 'shipped' || s.status === 'in_transit').length,
    receiving: shipments.filter(s => s.status === 'receiving').length,
    closed: shipments.filter(s => s.status === 'received' || s.status === 'closed').length,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-slate-700 text-slate-300'
      case 'ready': return 'bg-blue-900/50 text-blue-400'
      case 'shipped': return 'bg-purple-900/50 text-purple-400'
      case 'in_transit': return 'bg-purple-900/50 text-purple-400'
      case 'receiving': return 'bg-amber-900/50 text-amber-400'
      case 'received': return 'bg-emerald-900/50 text-emerald-400'
      case 'closed': return 'bg-emerald-900/50 text-emerald-400'
      default: return 'bg-slate-700 text-slate-300'
    }
  }

  const formatDate = (date: string | null) => {
    if (!date) return '—'
    return new Date(date).toLocaleDateString()
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
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
            <h1 className="text-3xl font-bold text-white">FBA Shipments</h1>
            <p className="text-slate-400 mt-1">Manage shipments to Amazon fulfillment centers</p>
          </div>
          <Button onClick={() => window.location.href = '/shipments/new'}>
            <Plus className="w-4 h-4 mr-2" />
            Create Shipment
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Package className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.working}</p>
                  <p className="text-sm text-slate-400">Working</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Truck className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.inTransit}</p>
                  <p className="text-sm text-slate-400">In Transit</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.receiving}</p>
                  <p className="text-sm text-slate-400">Receiving</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.closed}</p>
                  <p className="text-sm text-slate-400">Closed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Shipments List */}
        {shipments.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Truck className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-lg text-slate-400">No FBA shipments yet</p>
                <p className="text-sm text-slate-500 mt-1">Create a shipment to send inventory to Amazon FBA</p>
                <Button className="mt-4" onClick={() => window.location.href = '/shipments/new'}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Shipment
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Shipments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">ID</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Created</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">From</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Destination</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Items</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {shipments.map(shipment => (
                      <tr key={shipment.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4 text-white font-medium">
                          {shipment.internalId || `SHP-${shipment.id}`}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {formatDate(shipment.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {shipment.fromLocation?.name || 'Warehouse'}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          FBA {shipment.destinationFc || 'US'}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {shipment.totalItems || '—'} SKUs / {shipment.totalUnits || '—'} units
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(shipment.status)}`}>
                            {shipment.status.toUpperCase().replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.location.href = `/shipments/${shipment.id}`}
                            >
                              {shipment.status === 'draft' ? 'Continue' : 'View'}
                              <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                            {shipment.status === 'draft' && (
                              <button
                                onClick={() => deleteShipment(shipment.id)}
                                className="text-red-400 hover:text-red-300 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  )
}
