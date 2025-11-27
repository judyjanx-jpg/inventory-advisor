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
  DollarSign,
  TrendingUp,
  Calendar
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

interface SalesHistoryItem {
  id: number
  date: string
  masterSku: string
  channel: string
  channelSku: string
  unitsSold: number
  revenue: number
  fees: number
  skuMapping: {
    product: {
      title: string
      sku: string
    }
  }
}

interface SalesHistorySummary {
  totalRecords: number
  totalUnitsSold: number
  totalRevenue: number
  totalFees: number
}

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<'orders' | 'sales'>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [salesHistory, setSalesHistory] = useState<SalesHistoryItem[]>([])
  const [salesSummary, setSalesSummary] = useState<SalesHistorySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [salesLoading, setSalesLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [salesSearchTerm, setSalesSearchTerm] = useState('')

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchOrders()
    } else {
      fetchSalesHistory()
    }
  }, [activeTab])

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

  const fetchSalesHistory = async (offset = 0) => {
    setSalesLoading(true)
    try {
      // Get last 90 days by default, but fetch more records
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 90)
      
      const res = await fetch(
        `/api/sales-history?startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}&limit=5000&offset=${offset}`
      )
      const data = await res.json()
      
      if (offset === 0) {
        setSalesHistory(data.data || [])
      } else {
        // Append to existing data for pagination
        setSalesHistory(prev => [...prev, ...(data.data || [])])
      }
      setSalesSummary(data.summary || null)
    } catch (error) {
      console.error('Error fetching sales history:', error)
    } finally {
      setSalesLoading(false)
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

  const filteredSalesHistory = salesHistory.filter(sh =>
    sh.masterSku.toLowerCase().includes(salesSearchTerm.toLowerCase()) ||
    sh.skuMapping?.product?.title.toLowerCase().includes(salesSearchTerm.toLowerCase()) ||
    sh.channelSku.toLowerCase().includes(salesSearchTerm.toLowerCase())
  )

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    revenue: orders.reduce((sum, o) => sum + o.orderItems.reduce((s, i) => s + i.itemPrice * i.quantity, 0), 0),
  }

  if (loading && activeTab === 'orders') {
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
            <h1 className="text-3xl font-bold text-white">Orders & Sales</h1>
            <p className="text-slate-400 mt-1">Track orders and view sales history</p>
          </div>
          {activeTab === 'orders' && (
            <Button onClick={syncOrders} loading={syncing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Orders
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'orders'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Orders
            </div>
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'sales'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Sales History
            </div>
          </button>
        </div>

        {activeTab === 'orders' ? (
          <>
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
          </>
        ) : (
          <>
            {/* Sales History Stats */}
            {salesSummary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                  title="Total Records"
                  value={salesSummary.totalRecords.toLocaleString()}
                  icon={<Calendar className="w-6 h-6 text-cyan-400" />}
                  iconBg="bg-cyan-500/20"
                />
                <StatCard
                  title="Units Sold"
                  value={salesSummary.totalUnitsSold.toLocaleString()}
                  icon={<Package className="w-6 h-6 text-blue-400" />}
                  iconBg="bg-blue-500/20"
                />
                <StatCard
                  title="Total Revenue"
                  value={formatCurrency(salesSummary.totalRevenue)}
                  icon={<DollarSign className="w-6 h-6 text-emerald-400" />}
                  iconBg="bg-emerald-500/20"
                />
                <StatCard
                  title="Total Fees"
                  value={formatCurrency(salesSummary.totalFees)}
                  icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
                  iconBg="bg-purple-500/20"
                />
              </div>
            )}

            {/* Search */}
            <Card>
              <CardContent className="py-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by SKU, product name, or channel SKU..."
                    value={salesSearchTerm}
                    onChange={(e) => setSalesSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Sales History List */}
            <Card>
              <CardHeader>
                <CardTitle>Sales History</CardTitle>
                <CardDescription>
                  {salesLoading ? 'Loading...' : `${filteredSalesHistory.length} records (Last 90 days)`}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {salesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
                  </div>
                ) : filteredSalesHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <TrendingUp className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-lg text-slate-400">No sales history found</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {salesHistory.length === 0 
                        ? 'Sync sales history from Amazon Settings to import data'
                        : 'No results match your search'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700/50">
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-800/30 text-xs font-medium text-slate-400 uppercase tracking-wider">
                      <div className="col-span-2">Date</div>
                      <div className="col-span-3">Product</div>
                      <div className="col-span-2">Channel</div>
                      <div className="col-span-1 text-right">Units</div>
                      <div className="col-span-2 text-right">Revenue</div>
                      <div className="col-span-2 text-right">Fees</div>
                    </div>
                    {filteredSalesHistory.slice(0, 100).map((item) => (
                      <div key={item.id} className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-slate-800/30">
                        <div className="col-span-2">
                          <p className="text-white">{formatDate(new Date(item.date))}</p>
                        </div>
                        <div className="col-span-3">
                          <p className="text-white font-medium">{item.skuMapping?.product?.title || item.masterSku}</p>
                          <p className="text-xs text-slate-400 font-mono">{item.masterSku}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300">
                            {item.channel}
                          </span>
                        </div>
                        <div className="col-span-1 text-right">
                          <p className="text-white">{item.unitsSold}</p>
                        </div>
                        <div className="col-span-2 text-right">
                          <p className="text-white font-medium">{formatCurrency(Number(item.revenue))}</p>
                        </div>
                        <div className="col-span-2 text-right">
                          <p className="text-slate-400">{formatCurrency(Number(item.fees))}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  )
}
