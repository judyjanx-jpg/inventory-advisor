'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, StatCard } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { 
  DollarSign, 
  TrendingUp, 
  Package, 
  ShoppingCart, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Truck,
  Clock
} from 'lucide-react'

interface DashboardStats {
  totalRevenue: number
  totalProfit: number
  profitMargin: number
  unitsSold: number
  ordersCount: number
  lowStockItems: number
  pendingPOs: number
  inboundShipments: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('/api/dashboard/stats')
      const data = await res.json()
      setStats(data.stats)
      setLowStockProducts(data.lowStockProducts || [])
      setRecentActivity(data.recentActivity || [])
    } catch (error) {
      console.error('Error fetching dashboard:', error)
      // Set default stats if API fails
      setStats({
        totalRevenue: 0,
        totalProfit: 0,
        profitMargin: 0,
        unitsSold: 0,
        ordersCount: 0,
        lowStockItems: 0,
        pendingPOs: 0,
        inboundShipments: 0,
      })
    } finally {
      setLoading(false)
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
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400 mt-1">Overview of your business performance</p>
          </div>
          <Button onClick={fetchDashboardData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Revenue"
            value={formatCurrency(stats?.totalRevenue || 0)}
            change="+12.5% from last month"
            changeType="positive"
            icon={<DollarSign className="w-6 h-6 text-emerald-400" />}
            iconBg="bg-emerald-500/20"
          />
          <StatCard
            title="Total Profit"
            value={formatCurrency(stats?.totalProfit || 0)}
            change="+8.3% from last month"
            changeType="positive"
            icon={<TrendingUp className="w-6 h-6 text-cyan-400" />}
            iconBg="bg-cyan-500/20"
          />
          <StatCard
            title="Profit Margin"
            value={`${stats?.profitMargin || 0}%`}
            change="Industry avg: 30%"
            changeType="neutral"
            icon={<ArrowUpRight className="w-6 h-6 text-blue-400" />}
            iconBg="bg-blue-500/20"
          />
          <StatCard
            title="Units Sold"
            value={(stats?.unitsSold || 0).toLocaleString()}
            change={`${stats?.ordersCount || 0} orders`}
            changeType="neutral"
            icon={<ShoppingCart className="w-6 h-6 text-purple-400" />}
            iconBg="bg-purple-500/20"
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats?.lowStockItems || 0}</p>
                  <p className="text-sm text-slate-400">Low Stock Items</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats?.pendingPOs || 0}</p>
                  <p className="text-sm text-slate-400">Pending POs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center">
                  <Truck className="w-6 h-6 text-teal-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats?.inboundShipments || 0}</p>
                  <p className="text-sm text-slate-400">Inbound Shipments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Low Stock Alerts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Low Stock Alerts</CardTitle>
                  <CardDescription>Products that need reordering</CardDescription>
                </div>
                <Button variant="ghost" size="sm">View All</Button>
              </div>
            </CardHeader>
            <CardContent>
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No low stock items</p>
                  <p className="text-sm text-slate-500 mt-1">All products are well stocked!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lowStockProducts.slice(0, 5).map((product: any) => (
                    <div 
                      key={product.sku} 
                      className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                    >
                      <div>
                        <p className="font-medium text-white">{product.title}</p>
                        <p className="text-sm text-slate-400">SKU: {product.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-red-400 font-semibold">{product.stock} units</p>
                        <p className="text-xs text-slate-500">{product.daysLeft} days left</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest orders and shipments</CardDescription>
                </div>
                <Button variant="ghost" size="sm">View All</Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No recent activity</p>
                  <p className="text-sm text-slate-500 mt-1">Activity will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.slice(0, 5).map((activity: any, index: number) => (
                    <div 
                      key={index} 
                      className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        activity.type === 'order' ? 'bg-emerald-500' :
                        activity.type === 'shipment' ? 'bg-blue-500' :
                        'bg-slate-500'
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm text-white">{activity.description}</p>
                        <p className="text-xs text-slate-500">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <Package className="w-5 h-5" />
                <span>Add Product</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span>Create PO</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <Truck className="w-5 h-5" />
                <span>New Shipment</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <RefreshCw className="w-5 h-5" />
                <span>Sync Amazon</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
