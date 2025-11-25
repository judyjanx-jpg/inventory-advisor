'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, StatCard } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { 
  ShoppingCart, 
  RefreshCw, 
  Search,
  Filter,
  Package,
  Truck,
  Clock,
  CheckCircle,
  DollarSign
} from 'lucide-react'

interface Order {
  id: string
  purchaseDate: string
  status: string
  shipCity?: string
  shipState?: string
  shipCountry?: string
  fulfillmentChannel?: string
  orderItems: {
    masterSku: string
    product?: { title: string }
    quantity: number
    itemPrice: number
    amazonFees?: number
  }[]
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders')
      const data = await res.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const syncOrders = async () => {
    setSyncing(true)
    try {
      await fetch('/api/amazon/sync/orders', { method: 'POST' })
      await fetchOrders()
    } catch (error) {
      console.error('Error syncing:', error)
    } finally {
      setSyncing(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const configs: Record<string, string> = {
      pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      shipped: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      delivered: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full border ${configs[status] || configs.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const filteredOrders = orders.filter(o => 
    o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.orderItems?.some(item => item.masterSku.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    revenue: orders.reduce((sum, o) => sum + o.orderItems.reduce((s, i) => s + i.itemPrice * i.quantity, 0), 0),
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
            <h1 className="text-3xl font-bold text-white">Orders</h1>
            <p className="text-slate-400 mt-1">Track Amazon orders and fulfillment</p>
          </div>
          <Button onClick={syncOrders} loading={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync Orders
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Total Orders"
            value={stats.total}
            icon={<ShoppingCart className="w-6 h-6 text-cyan-400" />}
            iconBg="bg-cyan-500/20"
          />
          <StatCard
            title="Pending"
            value={stats.pending}
            icon={<Clock className="w-6 h-6 text-amber-400" />}
            iconBg="bg-amber-500/20"
          />
          <StatCard
            title="Total Revenue"
            value={formatCurrency(stats.revenue)}
            icon={<DollarSign className="w-6 h-6 text-emerald-400" />}
            iconBg="bg-emerald-500/20"
          />
        </div>

        {/* Search */}
        <Card>
          <CardContent className="py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by order ID or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Orders List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>{filteredOrders.length} orders</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingCart className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-lg text-slate-400">No orders found</p>
                <p className="text-sm text-slate-500 mt-1">Sync from Amazon to import orders</p>
                <Button className="mt-4" onClick={syncOrders}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Orders
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {filteredOrders.slice(0, 50).map((order) => (
                  <div key={order.id} className="flex items-center px-6 py-4 hover:bg-slate-800/30">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <p className="font-mono text-white">{order.id}</p>
                        {getStatusBadge(order.status)}
                        {order.fulfillmentChannel && (
                          <span className="text-xs text-slate-500">{order.fulfillmentChannel}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 mt-1">
                        {formatDate(new Date(order.purchaseDate))}
                        {order.shipCity && ` • ${order.shipCity}, ${order.shipState || ''} ${order.shipCountry || ''}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-white">
                        {formatCurrency(order.orderItems.reduce((sum, i) => sum + i.itemPrice * i.quantity, 0))}
                      </p>
                      <p className="text-sm text-slate-400">
                        {order.orderItems.reduce((sum, i) => sum + i.quantity, 0)} items
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
