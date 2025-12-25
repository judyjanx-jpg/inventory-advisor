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
  Calendar,
  ArrowUpDown,
  ChevronDown
} from 'lucide-react'

interface OrderItem {
  id: string
  masterSku: string
  product?: { title: string; sku: string }
  quantity: number
  itemPrice: number
  itemTax?: number
  shippingPrice?: number
  amazonFees?: number
}

interface Order {
  id: string
  amazonOrderId?: string
  purchaseDate: string
  status: string
  orderTotal?: number
  shipCity?: string
  shipState?: string
  shipCountry?: string
  fulfillmentChannel?: string
  salesChannel?: string
  orderItems: OrderItem[]
}

interface OrdersSummary {
  totalOrders: number
  totalRevenue: number
  totalItems: number
  totalFees: number
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

interface OrdersPagination {
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

type DateFilterType = 'today' | 'yesterday' | '3d' | '7d' | '30d' | 'ytd' | '365d' | 'custom' | 'all'

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<'orders' | 'sales'>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersSummary, setOrdersSummary] = useState<OrdersSummary | null>(null)
  const [salesHistory, setSalesHistory] = useState<SalesHistoryItem[]>([])
  const [salesSummary, setSalesSummary] = useState<SalesHistorySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [salesLoading, setSalesLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [salesSearchTerm, setSalesSearchTerm] = useState('')
  const [ordersOffset, setOrdersOffset] = useState(0)
  const [ordersPagination, setOrdersPagination] = useState<OrdersPagination | null>(null)
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false)
  const [salesOffset, setSalesOffset] = useState(0)
  const [salesHasMore, setSalesHasMore] = useState(false)
  const [loadingMoreSales, setLoadingMoreSales] = useState(false)
  
  // Orders date filter and sort
  const [ordersDateFilter, setOrdersDateFilter] = useState<DateFilterType>('7d')
  const [ordersSortOrder, setOrdersSortOrder] = useState<'desc' | 'asc'>('desc')
  const [ordersCustomStartDate, setOrdersCustomStartDate] = useState('')
  const [ordersCustomEndDate, setOrdersCustomEndDate] = useState('')
  const [showOrdersDateDropdown, setShowOrdersDateDropdown] = useState(false)
  
  // Date range for sales history
  const [salesDateRange, setSalesDateRange] = useState<'7d' | '30d' | '90d' | '1y' | '2y' | 'custom'>('90d')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchOrders()
    } else {
      fetchSalesHistory()
    }
  }, [activeTab])
  
  // Re-fetch orders when date filter or sort changes
  useEffect(() => {
    if (activeTab === 'orders' && ordersDateFilter !== 'custom') {
      setOrders([])
      setOrdersOffset(0)
      fetchOrders()
    }
  }, [ordersDateFilter, ordersSortOrder])
  
  // Re-fetch when date range changes
  useEffect(() => {
    if (activeTab === 'sales' && salesDateRange !== 'custom') {
      setSalesHistory([])
      setSalesOffset(0)
      fetchSalesHistory()
    }
  }, [salesDateRange])

  const fetchOrders = async (offset = 0, append = false) => {
    if (append) {
      setLoadingMoreOrders(true)
    } else {
      setLoading(true)
    }
    try {
      const limit = 100
      let url = `/api/orders?limit=${limit}&offset=${offset}&sort=${ordersSortOrder}&dateFilter=${ordersDateFilter}`
      
      if (ordersDateFilter === 'custom' && ordersCustomStartDate && ordersCustomEndDate) {
        url += `&startDate=${ordersCustomStartDate}&endDate=${ordersCustomEndDate}`
      }
      
      const res = await fetch(url)
      const data = await res.json()
      const ordersData = data.orders || (Array.isArray(data) ? data : [])
      
      if (append) {
        setOrders(prev => [...prev, ...ordersData])
      } else {
        setOrders(ordersData)
      }
      
      if (data.summary) {
        setOrdersSummary(data.summary)
      }
      
      if (data.pagination) {
        setOrdersPagination(data.pagination)
      } else {
        setOrdersPagination({
          total: ordersData.length + offset,
          limit,
          offset,
          hasMore: ordersData.length === limit
        })
      }
      setOrdersOffset(offset)
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
      setLoadingMoreOrders(false)
    }
  }

  const getDateRange = () => {
    const endDate = new Date()
    const startDate = new Date()
    
    switch (salesDateRange) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7)
        break
      case '30d':
        startDate.setDate(startDate.getDate() - 30)
        break
      case '90d':
        startDate.setDate(startDate.getDate() - 90)
        break
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1)
        break
      case '2y':
        startDate.setFullYear(startDate.getFullYear() - 2)
        break
      case 'custom':
        return {
          start: customStartDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end: customEndDate || new Date().toISOString().split('T')[0],
        }
    }
    
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    }
  }

  const fetchSalesHistory = async (offset = 0, append = false) => {
    if (append) {
      setLoadingMoreSales(true)
    } else {
      setSalesLoading(true)
    }
    try {
      const { start, end } = getDateRange()
      const limit = 200
      
      const res = await fetch(
        `/api/sales-history?startDate=${start}&endDate=${end}&limit=${limit}&offset=${offset}`
      )
      const data = await res.json()
      
      if (append) {
        setSalesHistory(prev => [...prev, ...(data.data || [])])
      } else {
        setSalesHistory(data.data || [])
      }
      setSalesSummary(data.summary || null)
      setSalesOffset(offset)
      setSalesHasMore(data.pagination?.hasMore || false)
    } catch (error) {
      console.error('Error fetching sales history:', error)
    } finally {
      setSalesLoading(false)
      setLoadingMoreSales(false)
    }
  }
  
  const handleOrdersCustomDateApply = () => {
    if (ordersCustomStartDate && ordersCustomEndDate) {
      setOrders([])
      setOrdersOffset(0)
      fetchOrders()
      setShowOrdersDateDropdown(false)
    }
  }
  
  const handleCustomDateApply = () => {
    if (customStartDate && customEndDate) {
      setSalesHistory([])
      setSalesOffset(0)
      fetchSalesHistory()
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
    const statusLower = status?.toLowerCase() || 'pending'
    const configs: Record<string, string> = {
      pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      unshipped: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      shipped: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      delivered: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      canceled: 'bg-red-500/20 text-red-400 border-red-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full border ${configs[statusLower] || configs.pending}`}>
        {status || 'Pending'}
      </span>
    )
  }

  const getDateFilterLabel = (filter: DateFilterType) => {
    switch (filter) {
      case 'today': return 'Today'
      case 'yesterday': return 'Yesterday'
      case '3d': return 'Last 3 Days'
      case '7d': return 'Last 7 Days'
      case '30d': return 'Last 30 Days'
      case 'ytd': return 'Year to Date'
      case '365d': return 'Last 365 Days'
      case 'custom': return 'Custom Range'
      case 'all': return 'All Time'
      default: return 'Last 7 Days'
    }
  }

  const filteredOrders = orders.filter(o => {
    const orderId = o.id || ''
    const matchesSearch = orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.orderItems?.some(item => 
        item.masterSku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product?.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product?.title?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    return matchesSearch
  })

  const filteredSalesHistory = salesHistory.filter(sh =>
    sh.masterSku.toLowerCase().includes(salesSearchTerm.toLowerCase()) ||
    sh.skuMapping?.product?.title.toLowerCase().includes(salesSearchTerm.toLowerCase()) ||
    sh.channelSku.toLowerCase().includes(salesSearchTerm.toLowerCase())
  )

  // Calculate order total safely - use orderTotal from Order model, or calculate from items
  const getOrderTotal = (order: Order) => {
    // First try to use the orderTotal from the order itself (if it's > 0)
    const orderTotal = Number(order.orderTotal) || 0
    if (orderTotal > 0) {
      return orderTotal
    }
    // Fallback to calculating from items
    if (!order.orderItems || order.orderItems.length === 0) return 0
    return order.orderItems.reduce((sum, item) => {
      const price = Number(item.itemPrice) || 0
      const qty = Number(item.quantity) || 0
      return sum + (price * qty)
    }, 0)
  }

  const getOrderItemCount = (order: Order) => {
    if (!order.orderItems || order.orderItems.length === 0) return 0
    return order.orderItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
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
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Orders & Sales</h1>
            <p className="text-[var(--muted-foreground)] mt-1">Track orders and view sales history</p>
          </div>
          {activeTab === 'orders' && (
            <Button onClick={syncOrders} loading={syncing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync Orders
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[var(--border)]">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'orders'
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
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
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
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
            {/* Date Filter & Sort Controls */}
            <Card className="overflow-visible">
              <CardContent className="py-4 overflow-visible">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Date Filter Dropdown */}
                  <div className="relative z-50">
                    <button
                      onClick={() => setShowOrdersDateDropdown(!showOrdersDateDropdown)}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] border border-[var(--border)] rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                    >
                      <Calendar className="w-4 h-4 text-[var(--muted-foreground)]" />
                      <span>{getDateFilterLabel(ordersDateFilter)}</span>
                      <ChevronDown className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform ${showOrdersDateDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showOrdersDateDropdown && (
                      <>
                        {/* Backdrop to close dropdown */}
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setShowOrdersDateDropdown(false)}
                        />
                        <div className="absolute top-full left-0 mt-2 w-64 bg-[var(--secondary)] border border-[var(--border)] rounded-lg shadow-xl z-50">
                          <div className="p-2 space-y-1">
                            {(['today', 'yesterday', '3d', '7d', '30d', 'ytd', '365d', 'all'] as DateFilterType[]).map((filter) => (
                              <button
                                key={filter}
                                onClick={() => {
                                  setOrdersDateFilter(filter)
                                  setShowOrdersDateDropdown(false)
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                  ordersDateFilter === filter
                                    ? 'bg-cyan-600 text-[var(--foreground)]'
                                    : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                                }`}
                              >
                                {getDateFilterLabel(filter)}
                              </button>
                            ))}
                            <div className="border-t border-[var(--border)] pt-2 mt-2">
                              <button
                                onClick={() => setOrdersDateFilter('custom')}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                  ordersDateFilter === 'custom'
                                    ? 'bg-cyan-600 text-[var(--foreground)]'
                                    : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                                }`}
                              >
                                Custom Range
                              </button>
                              {ordersDateFilter === 'custom' && (
                                <div className="p-3 space-y-2">
                                  <input
                                    type="date"
                                    value={ordersCustomStartDate}
                                    onChange={(e) => setOrdersCustomStartDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--card)] border border-slate-600 rounded-lg text-[var(--foreground)] text-sm"
                                  />
                                  <input
                                    type="date"
                                    value={ordersCustomEndDate}
                                    onChange={(e) => setOrdersCustomEndDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--card)] border border-slate-600 rounded-lg text-[var(--foreground)] text-sm"
                                  />
                                  <button
                                    onClick={handleOrdersCustomDateApply}
                                    disabled={!ordersCustomStartDate || !ordersCustomEndDate}
                                    className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 text-[var(--foreground)] text-sm rounded-lg"
                                  >
                                    Apply
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Sort Order Toggle */}
                  <button
                    onClick={() => setOrdersSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--secondary)] border border-[var(--border)] rounded-lg text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                  >
                    <ArrowUpDown className="w-4 h-4 text-[var(--muted-foreground)]" />
                    <span>{ordersSortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
                  </button>

                  {/* Search */}
                  <div className="flex-1 min-w-64 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                    <input
                      type="text"
                      placeholder="Search by order ID, SKU, or product..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                title="Total Orders"
                value={(ordersSummary?.totalOrders || ordersPagination?.total || orders.length).toLocaleString()}
                icon={<ShoppingCart className="w-6 h-6 text-cyan-400" />}
                iconBg="bg-cyan-500/20"
              />
              <StatCard
                title="Total Items"
                value={(ordersSummary?.totalItems || orders.reduce((sum, o) => sum + getOrderItemCount(o), 0)).toLocaleString()}
                icon={<Package className="w-6 h-6 text-blue-400" />}
                iconBg="bg-blue-500/20"
              />
              <StatCard
                title="Total Revenue"
                value={formatCurrency(ordersSummary?.totalRevenue || orders.reduce((sum, o) => sum + getOrderTotal(o), 0))}
                icon={<DollarSign className="w-6 h-6 text-emerald-400" />}
                iconBg="bg-emerald-500/20"
              />
              <StatCard
                title="Amazon Fees"
                value={formatCurrency(ordersSummary?.totalFees || 0)}
                icon={<TrendingUp className="w-6 h-6 text-purple-400" />}
                iconBg="bg-purple-500/20"
              />
            </div>

            {/* Orders List */}
            <Card>
              <CardHeader>
                <CardTitle>Orders</CardTitle>
                <CardDescription>
                  {filteredOrders.length} orders • {getDateFilterLabel(ordersDateFilter)}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredOrders.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <p className="text-lg text-[var(--muted-foreground)]">No orders found</p>
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                      {orders.length === 0 ? 'Sync from Amazon to import orders' : 'Try adjusting your filters'}
                    </p>
                    {orders.length === 0 && (
                      <Button className="mt-4" onClick={syncOrders}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync Orders
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[var(--secondary)]/30 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider border-b border-[var(--border)]/50">
                      <div className="col-span-3">Order ID</div>
                      <div className="col-span-2">Date</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2">Items</div>
                      <div className="col-span-1 text-right">Qty</div>
                      <div className="col-span-2 text-right">Revenue</div>
                    </div>
                    
                    <div className="divide-y divide-slate-700/50">
                      {filteredOrders.map((order) => {
                        const orderTotal = getOrderTotal(order)
                        const itemCount = getOrderItemCount(order)
                        const firstItem = order.orderItems?.[0]
                        const orderId = order.id
                        
                        return (
                          <div key={order.id} className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-[var(--secondary)]/30 items-center">
                            <div className="col-span-3">
                              <p className="font-mono text-[var(--foreground)] text-sm truncate" title={orderId}>
                                {orderId}
                              </p>
                              {order.fulfillmentChannel && (
                                <span className="text-xs text-[var(--muted-foreground)]">{order.fulfillmentChannel}</span>
                              )}
                            </div>
                            <div className="col-span-2">
                              <p className="text-[var(--foreground)] text-sm">{formatDate(new Date(order.purchaseDate))}</p>
                              {order.shipCity && (
                                <p className="text-xs text-[var(--muted-foreground)] truncate">
                                  {order.shipCity}, {order.shipState || ''}
                                </p>
                              )}
                            </div>
                            <div className="col-span-2">
                              {getStatusBadge(order.status)}
                            </div>
                            <div className="col-span-2">
                              {firstItem && (
                                <>
                                  <p className="text-[var(--foreground)] text-sm truncate" title={firstItem.product?.title || firstItem.masterSku}>
                                    {firstItem.product?.title || firstItem.masterSku}
                                  </p>
                                  <p className="text-xs text-[var(--muted-foreground)] font-mono">
                                    {firstItem.product?.sku || firstItem.masterSku}
                                  </p>
                                  {order.orderItems.length > 1 && (
                                    <p className="text-xs text-cyan-400">+{order.orderItems.length - 1} more</p>
                                  )}
                                </>
                              )}
                            </div>
                            <div className="col-span-1 text-right">
                              <p className="text-[var(--foreground)]">{itemCount}</p>
                            </div>
                            <div className="col-span-2 text-right">
                              <p className="text-lg font-semibold text-[var(--foreground)]">
                                {formatCurrency(orderTotal)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {ordersPagination?.hasMore && (
                      <div className="p-4 border-t border-[var(--border)]/50">
                        <button
                          onClick={() => fetchOrders(ordersOffset + 100, true)}
                          disabled={loadingMoreOrders}
                          className="w-full py-3 bg-[var(--secondary)] hover:bg-[var(--muted)] disabled:bg-[var(--secondary)] rounded-lg text-[var(--foreground)] font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          {loadingMoreOrders ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-cyan-400 border-t-transparent"></div>
                              Loading more...
                            </>
                          ) : (
                            <>Load More Orders</>
                          )}
                        </button>
                        <p className="text-center text-sm text-[var(--muted-foreground)] mt-2">
                          Showing {orders.length} of {ordersPagination.total} orders
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Date Range Selector */}
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[var(--muted-foreground)]" />
                    <span className="text-sm text-[var(--muted-foreground)]">Date Range:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['7d', '30d', '90d', '1y', '2y'] as const).map((range) => (
                      <button
                        key={range}
                        onClick={() => setSalesDateRange(range)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          salesDateRange === range
                            ? 'bg-cyan-600 text-[var(--foreground)]'
                            : 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--muted)]'
                        }`}
                      >
                        {range === '7d' ? '7 Days' : 
                         range === '30d' ? '30 Days' : 
                         range === '90d' ? '90 Days' : 
                         range === '1y' ? '1 Year' : '2 Years'}
                      </button>
                    ))}
                    <button
                      onClick={() => setSalesDateRange('custom')}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        salesDateRange === 'custom'
                          ? 'bg-cyan-600 text-[var(--foreground)]'
                          : 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--muted)]'
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  {salesDateRange === 'custom' && (
                    <div className="flex items-center gap-2 ml-auto">
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="px-3 py-1.5 bg-[var(--secondary)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:border-cyan-500"
                      />
                      <span className="text-[var(--muted-foreground)]">to</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="px-3 py-1.5 bg-[var(--secondary)] border border-[var(--border)] rounded-lg text-[var(--foreground)] text-sm focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        onClick={handleCustomDateApply}
                        disabled={!customStartDate || !customEndDate}
                        className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 text-[var(--foreground)] text-sm rounded-lg transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    placeholder="Search by SKU, product name, or channel SKU..."
                    value={salesSearchTerm}
                    onChange={(e) => setSalesSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Sales History List */}
            <Card>
              <CardHeader>
                <CardTitle>Sales History</CardTitle>
                <CardDescription>
                  {salesLoading ? 'Loading...' : `${filteredSalesHistory.length} records (${
                    salesDateRange === '7d' ? 'Last 7 days' :
                    salesDateRange === '30d' ? 'Last 30 days' :
                    salesDateRange === '90d' ? 'Last 90 days' :
                    salesDateRange === '1y' ? 'Last 1 year' :
                    salesDateRange === '2y' ? 'Last 2 years' :
                    `${customStartDate} to ${customEndDate}`
                  })`}
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
                    <p className="text-lg text-[var(--muted-foreground)]">No sales history found</p>
                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                      {salesHistory.length === 0 
                        ? 'Sync sales history from Amazon Settings to import data'
                        : 'No results match your search'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-slate-700/50">
                      <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[var(--secondary)]/30 text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
                        <div className="col-span-2">Date</div>
                        <div className="col-span-3">Product</div>
                        <div className="col-span-2">Channel</div>
                        <div className="col-span-1 text-right">Units</div>
                        <div className="col-span-2 text-right">Revenue</div>
                        <div className="col-span-2 text-right">Fees</div>
                      </div>
                      {filteredSalesHistory.map((item) => (
                        <div key={item.id} className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-[var(--secondary)]/30">
                          <div className="col-span-2">
                            <p className="text-[var(--foreground)]">{formatDate(new Date(item.date))}</p>
                          </div>
                          <div className="col-span-3">
                            <p className="text-[var(--foreground)] font-medium">{item.skuMapping?.product?.title || item.masterSku}</p>
                            <p className="text-xs text-[var(--muted-foreground)] font-mono">{item.masterSku}</p>
                          </div>
                          <div className="col-span-2">
                            <span className="px-2 py-0.5 text-xs rounded bg-[var(--muted)] text-[var(--foreground)]">
                              {item.channel}
                            </span>
                          </div>
                          <div className="col-span-1 text-right">
                            <p className="text-[var(--foreground)]">{item.unitsSold}</p>
                          </div>
                          <div className="col-span-2 text-right">
                            <p className="text-[var(--foreground)] font-medium">{formatCurrency(Number(item.revenue))}</p>
                          </div>
                          <div className="col-span-2 text-right">
                            <p className="text-[var(--muted-foreground)]">{formatCurrency(Number(item.fees))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {salesHasMore && (
                      <div className="p-4 border-t border-[var(--border)]/50">
                        <button
                          onClick={() => fetchSalesHistory(salesOffset + 200, true)}
                          disabled={loadingMoreSales}
                          className="w-full py-3 bg-[var(--secondary)] hover:bg-[var(--muted)] disabled:bg-[var(--secondary)] rounded-lg text-[var(--foreground)] font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          {loadingMoreSales ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-cyan-400 border-t-transparent"></div>
                              Loading more...
                            </>
                          ) : (
                            <>Load More Sales</>
                          )}
                        </button>
                        <p className="text-center text-sm text-[var(--muted-foreground)] mt-2">
                          Showing {salesHistory.length} of {salesSummary?.totalRecords || 0} records
                        </p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  )
}
