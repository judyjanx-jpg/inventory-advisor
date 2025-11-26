'use client'

import { useEffect, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, StatCard } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { 
  Warehouse, 
  RefreshCw, 
  AlertTriangle, 
  TrendingUp,
  TrendingDown,
  Package,
  Truck,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Globe
} from 'lucide-react'

interface ChannelInventory {
  channel: string
  channelSku: string
  fbaAvailable: number
  velocity7d?: number
  velocity30d?: number
  daysOfStock?: number
}

interface ProductInventory {
  masterSku: string
  title: string
  asin?: string
  fbaAvailable: number
  fbaInbound: number
  warehouseAvailable: number
  totalStock: number
  velocity30d: number
  daysOfStock: number
  channelInventory?: ChannelInventory[]
  status: 'healthy' | 'low' | 'critical' | 'overstocked'
}

const CHANNEL_FLAGS: Record<string, string> = {
  amazon_us: '🇺🇸',
  amazon_uk: '🇬🇧',
  amazon_ca: '🇨🇦',
  amazon_de: '🇩🇪',
  amazon_fr: '🇫🇷',
  amazon_es: '🇪🇸',
  amazon_it: '🇮🇹',
  amazon_au: '🇦🇺',
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<ProductInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedSku, setExpandedSku] = useState<string | null>(null)

  useEffect(() => {
    fetchInventory()
  }, [])

  const fetchInventory = async () => {
    try {
      const res = await fetch('/api/inventory')
      const data = await res.json()
      
      // Transform the data
      const transformed = (Array.isArray(data) ? data : []).map((item: any) => {
        const fbaAvailable = item.fbaAvailable || 0
        const fbaInbound = (item.fbaInboundWorking || 0) + (item.fbaInboundShipped || 0) + (item.fbaInboundReceiving || 0)
        const warehouseAvailable = item.warehouseAvailable || 0
        const totalStock = fbaAvailable + fbaInbound + warehouseAvailable
        const velocity30d = item.product?.salesVelocity?.velocity30d || 0
        const daysOfStock = velocity30d > 0 ? Math.floor(totalStock / velocity30d) : 999

        let status: 'healthy' | 'low' | 'critical' | 'overstocked' = 'healthy'
        if (daysOfStock < 14) status = 'critical'
        else if (daysOfStock < 30) status = 'low'
        else if (daysOfStock > 180) status = 'overstocked'

        return {
          masterSku: item.masterSku,
          title: item.product?.title || item.masterSku,
          asin: item.product?.asin,
          fbaAvailable,
          fbaInbound,
          warehouseAvailable,
          totalStock,
          velocity30d,
          daysOfStock,
          status,
          channelInventory: item.product?.skuMappings?.map((mapping: any) => ({
            channel: mapping.channel,
            channelSku: mapping.channelSku,
            fbaAvailable: mapping.channelInventory?.[0]?.fbaAvailable || 0,
            velocity30d: mapping.channelInventory?.[0]?.velocity30d || 0,
          })) || [],
        }
      })
      
      setInventory(transformed)
    } catch (error) {
      console.error('Error fetching inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  const syncInventory = async () => {
    setSyncing(true)
    try {
      await fetch('/api/amazon/sync/inventory', { method: 'POST' })
      await fetchInventory()
    } catch (error) {
      console.error('Error syncing:', error)
    } finally {
      setSyncing(false)
    }
  }

  const filteredInventory = inventory
    .filter(item => statusFilter === 'all' || item.status === statusFilter)
    .filter(item => 
      item.masterSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.title.toLowerCase().includes(searchTerm.toLowerCase())
    )

  const stats = {
    totalProducts: inventory.length,
    lowStock: inventory.filter(i => i.status === 'low' || i.status === 'critical').length,
    criticalStock: inventory.filter(i => i.status === 'critical').length,
    totalUnits: inventory.reduce((sum, i) => sum + i.totalStock, 0),
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Healthy</span>
      case 'low':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">Low</span>
      case 'critical':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">Critical</span>
      case 'overstocked':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Overstocked</span>
      default:
        return null
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
            <h1 className="text-3xl font-bold text-white">Inventory</h1>
            <p className="text-slate-400 mt-1">Multi-channel inventory tracking and forecasting</p>
          </div>
          <Button onClick={syncInventory} loading={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync Amazon
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Products"
            value={stats.totalProducts}
            icon={<Package className="w-6 h-6 text-cyan-400" />}
            iconBg="bg-cyan-500/20"
          />
          <StatCard
            title="Total Units"
            value={stats.totalUnits.toLocaleString()}
            icon={<Warehouse className="w-6 h-6 text-blue-400" />}
            iconBg="bg-blue-500/20"
          />
          <StatCard
            title="Low Stock"
            value={stats.lowStock}
            change={stats.lowStock > 0 ? 'Needs attention' : 'All healthy'}
            changeType={stats.lowStock > 0 ? 'negative' : 'positive'}
            icon={<AlertTriangle className="w-6 h-6 text-amber-400" />}
            iconBg="bg-amber-500/20"
          />
          <StatCard
            title="Critical Stock"
            value={stats.criticalStock}
            change={stats.criticalStock > 0 ? 'Urgent reorder needed' : 'None'}
            changeType={stats.criticalStock > 0 ? 'negative' : 'positive'}
            icon={<TrendingDown className="w-6 h-6 text-red-400" />}
            iconBg="bg-red-500/20"
          />
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by SKU or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Status</option>
                <option value="healthy">Healthy</option>
                <option value="low">Low Stock</option>
                <option value="critical">Critical</option>
                <option value="overstocked">Overstocked</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Inventory List */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory Levels</CardTitle>
            <CardDescription>{filteredInventory.length} products</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredInventory.length === 0 ? (
              <div className="text-center py-12">
                <Warehouse className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-lg text-slate-400">No inventory found</p>
                <p className="text-sm text-slate-500 mt-1">Sync from Amazon to import inventory</p>
                <Button className="mt-4" onClick={syncInventory}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Amazon
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {filteredInventory.map((item) => (
                  <div key={item.masterSku}>
                    {/* Main Row */}
                    <div 
                      className="flex items-center px-6 py-4 hover:bg-slate-800/30 cursor-pointer"
                      onClick={() => setExpandedSku(expandedSku === item.masterSku ? null : item.masterSku)}
                    >
                      <div className="mr-3">
                        {expandedSku === item.masterSku ? (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <p className="font-semibold text-white font-mono">{item.masterSku}</p>
                          {getStatusBadge(item.status)}
                        </div>
                        <p className="text-sm text-slate-400 mt-0.5 truncate">
                          {item.asin && <span className="font-mono">{item.asin}</span>}
                          {item.asin && item.title && <span className="mx-2">•</span>}
                          {item.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-xs text-slate-500">FBA Available</p>
                          <p className="text-lg font-semibold text-white">{item.fbaAvailable}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">FBA Inbound</p>
                          <p className="text-lg font-semibold text-cyan-400">{item.fbaInbound}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Warehouse</p>
                          <p className="text-lg font-semibold text-blue-400">{item.warehouseAvailable}</p>
                        </div>
                        <div className="border-l border-slate-700 pl-6">
                          <p className="text-xs text-slate-500">Velocity</p>
                          <p className="text-lg font-semibold text-emerald-400">{Number(item.velocity30d || 0).toFixed(1)}/day</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Days of Stock</p>
                          <p className={`text-lg font-semibold ${
                            item.daysOfStock < 14 ? 'text-red-400' :
                            item.daysOfStock < 30 ? 'text-amber-400' :
                            'text-white'
                          }`}>
                            {item.daysOfStock > 365 ? '365+' : item.daysOfStock}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Channel Breakdown */}
                    {expandedSku === item.masterSku && item.channelInventory && item.channelInventory.length > 0 && (
                      <div className="px-6 py-4 bg-slate-900/30 border-t border-slate-700/50">
                        <div className="ml-8">
                          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
                            <Globe className="w-4 h-4" />
                            Channel Breakdown
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {item.channelInventory.map((channel, idx) => (
                              <div 
                                key={idx}
                                className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-xl">{CHANNEL_FLAGS[channel.channel] || '🔗'}</span>
                                  <div>
                                    <p className="text-sm font-medium text-white">
                                      {channel.channel.replace('amazon_', 'Amazon ').toUpperCase()}
                                    </p>
                                    <p className="text-xs text-slate-400 font-mono">{channel.channelSku}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold text-white">{channel.fbaAvailable}</p>
                                  <p className="text-xs text-slate-400">{Number(channel.velocity30d || 0).toFixed(1)}/day</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Reorder Recommendation */}
                          <div className="mt-4 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                            <h5 className="text-sm font-semibold text-white mb-2">📊 Reorder Recommendation</h5>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-slate-400">90-day need</p>
                                <p className="text-white font-medium">{Math.ceil(item.velocity30d * 90)} units</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Current total</p>
                                <p className="text-white font-medium">{item.totalStock} units</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Suggested PO</p>
                                <p className={`font-medium ${Math.ceil(item.velocity30d * 90) - item.totalStock > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {Math.max(0, Math.ceil(item.velocity30d * 90) - item.totalStock)} units
                                </p>
                              </div>
                            </div>
                            {Math.ceil(item.velocity30d * 90) - item.totalStock > 0 && (
                              <Button variant="outline" size="sm" className="mt-3">
                                <Truck className="w-4 h-4 mr-1" />
                                Create Purchase Order
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
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
