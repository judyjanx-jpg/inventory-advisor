'use client'

import { useEffect, useState, useRef } from 'react'
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
  ChevronUp,
  Globe,
  Building2
} from 'lucide-react'
import WarehouseInventoryUpload from '@/components/inventory/WarehouseInventoryUpload'

interface ChannelInventory {
  channel: string
  channelSku: string
  fbaAvailable: number
  velocity7d?: number
  velocity30d?: number
  daysOfStock?: number
}

interface WarehouseInventory {
  warehouseId: number
  warehouseName: string
  warehouseCode: string
  available: number
  reserved: number
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
  warehouseInventory?: WarehouseInventory[]
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

type SortColumn = 'sku' | 'fba' | 'inbound' | 'warehouse' | 'velocity' | 'days'
type SortDirection = 'asc' | 'desc'

export default function InventoryPage() {
  const [inventory, setInventory] = useState<ProductInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [recalculatingVelocity, setRecalculatingVelocity] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedSku, setExpandedSku] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<SortColumn>('sku')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const fetchingRef = useRef(false) // Prevent concurrent fetches

  useEffect(() => {
    fetchInventory()
  }, [])

  const fetchInventory = async () => {
    // Prevent concurrent fetches
    if (fetchingRef.current) {
      console.log('Fetch already in progress, skipping...')
      return
    }
    
    fetchingRef.current = true
    setLoading(true)
    try {
      const res = await fetch('/api/inventory')
      if (!res.ok) {
        console.error('API error:', res.status, res.statusText)
        const errorData = await res.json().catch(() => ({}))
        console.error('Error data:', errorData)
        setInventory([])
        return
      }
      
      const data = await res.json()
      console.log('Inventory API response:', data.length, 'items')
      
      // Log first few items to debug
      if (data.length > 0) {
        const sample = data[0]
        console.log('Sample inventory item:', {
          masterSku: sample.masterSku,
          fbaAvailable: sample.fbaAvailable,
          fbaInboundWorking: sample.fbaInboundWorking,
          fbaInboundShipped: sample.fbaInboundShipped,
          fbaInboundReceiving: sample.fbaInboundReceiving,
          warehouseAvailable: sample.warehouseAvailable,
          productTitle: sample.product?.title,
        })
        
        // Check for items with inventory > 0
        const itemsWithInventory = data.filter((item: any) => 
          (item.fbaAvailable || 0) > 0 || 
          (item.fbaInboundWorking || 0) > 0 || 
          (item.warehouseAvailable || 0) > 0
        )
        console.log(`Items with inventory > 0: ${itemsWithInventory.length} out of ${data.length}`)
        if (itemsWithInventory.length > 0) {
          console.log('First item with inventory:', itemsWithInventory[0])
        }
      }
      
      // Transform the data
      const transformed = (Array.isArray(data) ? data : []).map((item: any, index: number) => {
        const fbaAvailable = Number(item.fbaAvailable) || 0
        const fbaInboundWorking = Number(item.fbaInboundWorking) || 0
        const fbaInboundShipped = Number(item.fbaInboundShipped) || 0
        const fbaInboundReceiving = Number(item.fbaInboundReceiving) || 0
        const fbaInbound = fbaInboundWorking + fbaInboundShipped + fbaInboundReceiving
        const warehouseAvailable = Number(item.warehouseAvailable) || 0
        const totalStock = fbaAvailable + fbaInbound + warehouseAvailable
        
        // Get velocity - check multiple possible locations
        // Use velocity30d if available, otherwise fall back to velocity90d
        const salesVelocity = item.product?.salesVelocity
        let velocity30d = 0
        if (salesVelocity) {
          velocity30d = Number(salesVelocity.velocity30d || salesVelocity.velocity_30d || 0)
          // If 30d is 0 but 90d has data, use 90d as fallback (divide by 3 to approximate daily rate)
          if (velocity30d === 0 && salesVelocity.velocity90d) {
            const velocity90d = Number(salesVelocity.velocity90d || 0)
            if (velocity90d > 0) {
              // Use 90d velocity as estimate (it's already per-day, so use it directly)
              velocity30d = velocity90d
            }
          }
        }
        
        // Debug first few items - show full structure
        if (index < 5) {
          console.log(`[Frontend] ${item.masterSku}:`, {
            hasProduct: !!item.product,
            hasSalesVelocity: !!salesVelocity,
            salesVelocityType: typeof salesVelocity,
            salesVelocityValue: salesVelocity,
            velocity30d,
            fullItem: item,
          })
        }
        const daysOfStock = velocity30d > 0 ? Math.floor(totalStock / velocity30d) : (totalStock > 0 ? 999 : 0)

        let status: 'healthy' | 'low' | 'critical' | 'overstocked' = 'healthy'
        if (totalStock === 0) status = 'critical' // No stock is critical
        else if (daysOfStock < 14) status = 'critical'
        else if (daysOfStock < 30) status = 'low'
        else if (daysOfStock > 180 && velocity30d > 0) status = 'overstocked'

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
          warehouseInventory: item.product?.warehouseInventory?.map((wh: any) => ({
            warehouseId: wh.warehouse.id,
            warehouseName: wh.warehouse.name,
            warehouseCode: wh.warehouse.code,
            available: wh.available || 0,
            reserved: wh.reserved || 0,
          })) || [],
        }
      })
      
      setInventory(transformed)
    } catch (error) {
      console.error('Error fetching inventory:', error)
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }

  const syncInventory = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/amazon/sync/inventory', { method: 'POST' })
      const data = await res.json()
      
      if (!res.ok) {
        alert(`Sync failed: ${data.error || 'Unknown error'}`)
        console.error('Sync error:', data)
      } else {
        console.log('Sync result:', data)
        if (data.updatedSkus && data.updatedSkus.length > 0) {
          console.log('SKUs that were updated:', data.updatedSkus)
        }
        if (data.updated === 0 && data.skipped > 0) {
          alert(`Sync completed but no products were updated. ${data.skipped} SKUs were skipped (product not found in database). Make sure your product SKUs match your Amazon SKUs.`)
        } else {
          alert(`Sync completed: ${data.updated} products updated, ${data.skipped} skipped`)
        }
      }
      
      await fetchInventory()
    } catch (error) {
      console.error('Error syncing:', error)
      alert('Error syncing inventory. Check console for details.')
    } finally {
      setSyncing(false)
    }
  }

  const recalculateVelocity = async () => {
    setRecalculatingVelocity(true)
    try {
      const res = await fetch('/api/velocity/recalculate', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const message = `${data.message}\n\nDailyProfit records: ${data.dailyProfitRecords?.total || 0} total, ${data.dailyProfitRecords?.last30Days || 0} in last 30 days\nProducts with velocity > 0: ${data.updated - (data.zeroVelocity || 0)}`
        alert(message)
        // Force a full page refresh to ensure data is reloaded
        await fetchInventory()
        // Also try a hard refresh
        window.location.reload()
      } else {
        alert(`Failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error recalculating velocity:', error)
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRecalculatingVelocity(false)
    }
  }

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      // Default direction: asc for SKU, desc for numbers (high to low)
      setSortDirection(column === 'sku' ? 'asc' : 'desc')
    }
  }

  const filteredInventory = inventory
    .filter(item => statusFilter === 'all' || item.status === statusFilter)
    .filter(item => 
      item.masterSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.title.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0
      switch (sortColumn) {
        case 'sku':
          comparison = a.masterSku.localeCompare(b.masterSku)
          break
        case 'fba':
          comparison = a.fbaAvailable - b.fbaAvailable
          break
        case 'inbound':
          comparison = a.fbaInbound - b.fbaInbound
          break
        case 'warehouse':
          comparison = a.warehouseAvailable - b.warehouseAvailable
          break
        case 'velocity':
          comparison = a.velocity30d - b.velocity30d
          break
        case 'days':
          comparison = a.daysOfStock - b.daysOfStock
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">Inventory</h1>
                <p className="text-sm sm:text-base text-[var(--muted-foreground)] mt-1">Multi-channel inventory tracking and forecasting</p>
              </div>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <WarehouseInventoryUpload onUploadComplete={fetchInventory} />
                <Button variant="outline" onClick={recalculateVelocity} loading={recalculatingVelocity} className="text-xs sm:text-sm">
                  <TrendingUp className={`w-4 h-4 sm:mr-2 ${recalculatingVelocity ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Recalculate Velocity</span>
                </Button>
                <Button onClick={syncInventory} loading={syncing} className="text-xs sm:text-sm">
                  <RefreshCw className={`w-4 h-4 sm:mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Sync Amazon</span>
                  <span className="sm:hidden">Sync</span>
                </Button>
              </div>
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
          <CardContent className="py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  placeholder="Search by SKU or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 text-sm sm:text-base bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-cyan-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:border-cyan-500"
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
          {/* Mobile Header Row - Sortable */}
          <div className="lg:hidden px-3 py-2 border-b border-[var(--border)] bg-[var(--secondary)]/30 flex items-center gap-1 text-[9px] text-[var(--muted-foreground)] uppercase tracking-wide">
            <span className="w-3"></span>
            <button 
              onClick={() => handleSort('sku')} 
              className={`flex-1 min-w-0 text-left flex items-center gap-0.5 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'sku' ? 'text-cyan-400' : ''}`}
            >
              SKU
              {sortColumn === 'sku' && (sortDirection === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
            </button>
            <button 
              onClick={() => handleSort('fba')} 
              className={`w-8 text-right flex items-center justify-end gap-0.5 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'fba' ? 'text-cyan-400' : ''}`}
            >
              {sortColumn === 'fba' && (sortDirection === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
              FBA
            </button>
            <button 
              onClick={() => handleSort('inbound')} 
              className={`w-8 text-right flex items-center justify-end gap-0.5 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'inbound' ? 'text-cyan-400' : ''}`}
            >
              {sortColumn === 'inbound' && (sortDirection === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
              In
            </button>
            <button 
              onClick={() => handleSort('warehouse')} 
              className={`w-8 text-right flex items-center justify-end gap-0.5 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'warehouse' ? 'text-cyan-400' : ''}`}
            >
              {sortColumn === 'warehouse' && (sortDirection === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
              WH
            </button>
            <button 
              onClick={() => handleSort('velocity')} 
              className={`w-10 text-right flex items-center justify-end gap-0.5 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'velocity' ? 'text-cyan-400' : ''}`}
            >
              {sortColumn === 'velocity' && (sortDirection === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
              Vel
            </button>
            <button 
              onClick={() => handleSort('days')} 
              className={`w-6 text-right flex items-center justify-end gap-0.5 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'days' ? 'text-cyan-400' : ''}`}
            >
              {sortColumn === 'days' && (sortDirection === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)}
              Days
            </button>
          </div>
          {/* Desktop Header Row - Sortable */}
          <div className="hidden lg:flex items-center px-6 py-3 border-b border-[var(--border)] bg-[var(--secondary)]/30 text-xs text-[var(--muted-foreground)] uppercase tracking-wide">
            <span className="w-8"></span>
            <button 
              onClick={() => handleSort('sku')} 
              className={`flex-1 min-w-0 text-left flex items-center gap-1 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'sku' ? 'text-cyan-400' : ''}`}
            >
              SKU
              {sortColumn === 'sku' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
            </button>
            <div className="flex items-center gap-6 text-right">
              <button 
                onClick={() => handleSort('fba')} 
                className={`w-20 flex items-center justify-end gap-1 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'fba' ? 'text-cyan-400' : ''}`}
              >
                FBA
                {sortColumn === 'fba' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
              </button>
              <button 
                onClick={() => handleSort('inbound')} 
                className={`w-20 flex items-center justify-end gap-1 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'inbound' ? 'text-cyan-400' : ''}`}
              >
                Inbound
                {sortColumn === 'inbound' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
              </button>
              <button 
                onClick={() => handleSort('warehouse')} 
                className={`w-20 flex items-center justify-end gap-1 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'warehouse' ? 'text-cyan-400' : ''}`}
              >
                Warehouse
                {sortColumn === 'warehouse' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
              </button>
              <button 
                onClick={() => handleSort('velocity')} 
                className={`w-20 pl-6 border-l border-[var(--border)] flex items-center justify-end gap-1 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'velocity' ? 'text-cyan-400' : ''}`}
              >
                Velocity
                {sortColumn === 'velocity' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
              </button>
              <button 
                onClick={() => handleSort('days')} 
                className={`w-20 flex items-center justify-end gap-1 hover:text-[var(--foreground)] transition-colors ${sortColumn === 'days' ? 'text-cyan-400' : ''}`}
              >
                Days
                {sortColumn === 'days' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
              </button>
            </div>
          </div>
          <CardContent className="p-0">
            {filteredInventory.length === 0 ? (
              <div className="text-center py-12">
                <Warehouse className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-lg text-[var(--muted-foreground)]">No inventory found</p>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">Sync from Amazon to import inventory</p>
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
                      className="px-3 sm:px-6 py-3 sm:py-4 hover:bg-[var(--secondary)]/30 cursor-pointer"
                      onClick={() => setExpandedSku(expandedSku === item.masterSku ? null : item.masterSku)}
                    >
                      {/* Mobile Layout - Single row */}
                      <div className="lg:hidden flex items-center gap-1">
                        {expandedSku === item.masterSku ? (
                          <ChevronDown className="w-3 h-3 flex-shrink-0 text-[var(--muted-foreground)]" />
                        ) : (
                          <ChevronRight className="w-3 h-3 flex-shrink-0 text-[var(--muted-foreground)]" />
                        )}
                        <span className="font-mono text-xs font-medium text-[var(--foreground)] truncate min-w-0 flex-1">{item.masterSku}</span>
                        <span className="text-[10px] text-[var(--foreground)] w-8 text-right">{item.fbaAvailable}</span>
                        <span className="text-[10px] text-cyan-400 w-8 text-right">{item.fbaInbound}</span>
                        <span className="text-[10px] text-blue-400 w-8 text-right">{item.warehouseAvailable}</span>
                        <span className="text-[10px] text-emerald-400 w-10 text-right">{Number(item.velocity30d || 0).toFixed(1)}</span>
                        <span className={`text-[10px] w-6 text-right font-medium ${
                          item.daysOfStock < 14 ? 'text-red-400' :
                          item.daysOfStock < 30 ? 'text-amber-400' :
                          'text-[var(--foreground)]'
                        }`}>
                          {item.daysOfStock > 365 ? '365+' : item.daysOfStock}
                        </span>
                      </div>

                      {/* Desktop Layout */}
                      <div className="hidden lg:flex items-center">
                        <div className="mr-3">
                          {expandedSku === item.masterSku ? (
                            <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)]" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-[var(--foreground)] font-mono">{item.masterSku}</p>
                            {getStatusBadge(item.status)}
                          </div>
                          <p className="text-sm text-[var(--muted-foreground)] mt-0.5 truncate">
                            {item.asin && <span className="font-mono">{item.asin}</span>}
                            {item.asin && item.title && <span className="mx-2">•</span>}
                            <span className="truncate block" title={item.title}>
                              {item.title && item.title.length > 80 ? `${item.title.substring(0, 80)}...` : item.title}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-6 text-right">
                          <div>
                            <p className="text-xs text-[var(--muted-foreground)]">FBA Available</p>
                            <p className="text-lg font-semibold text-[var(--foreground)]">{item.fbaAvailable}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--muted-foreground)]">FBA Inbound</p>
                            <p className="text-lg font-semibold text-cyan-400">{item.fbaInbound}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--muted-foreground)]">Warehouse</p>
                            <p className="text-lg font-semibold text-blue-400">{item.warehouseAvailable}</p>
                            {item.warehouseInventory && item.warehouseInventory.length > 0 && (
                              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                {item.warehouseInventory.length} location{item.warehouseInventory.length !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                          <div className="border-l border-[var(--border)] pl-6">
                            <p className="text-xs text-[var(--muted-foreground)]">Velocity</p>
                            <p className="text-lg font-semibold text-emerald-400">{Number(item.velocity30d || 0).toFixed(1)}/day</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--muted-foreground)]">Days of Stock</p>
                            <p className={`text-lg font-semibold ${
                              item.daysOfStock < 14 ? 'text-red-400' :
                              item.daysOfStock < 30 ? 'text-amber-400' :
                              'text-[var(--foreground)]'
                            }`}>
                              {item.daysOfStock > 365 ? '365+' : item.daysOfStock}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Channel Breakdown */}
                    {expandedSku === item.masterSku && (
                      <div className="px-3 sm:px-6 py-3 sm:py-4 bg-[var(--card)]/30 border-t border-[var(--border)]/50">
                        <div className="sm:ml-8 space-y-4 sm:space-y-6">
                          {item.channelInventory && item.channelInventory.length > 0 && (
                            <div>
                              <h4 className="text-xs sm:text-sm font-semibold text-[var(--foreground)] flex items-center gap-2 mb-3 sm:mb-4">
                                <Globe className="w-4 h-4" />
                                Channel Breakdown
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                {item.channelInventory.map((channel, idx) => (
                                  <div 
                                    key={idx}
                                    className="flex items-center justify-between p-2 sm:p-3 bg-[var(--secondary)]/50 rounded-lg border border-[var(--border)]/50"
                                  >
                                    <div className="flex items-center gap-2 sm:gap-3">
                                      <span className="text-lg sm:text-xl">{CHANNEL_FLAGS[channel.channel] || '🔗'}</span>
                                      <div>
                                        <p className="text-xs sm:text-sm font-medium text-[var(--foreground)]">
                                          {channel.channel.replace('amazon_', '').toUpperCase()}
                                        </p>
                                        <p className="text-[10px] sm:text-xs text-[var(--muted-foreground)] font-mono truncate max-w-[100px] sm:max-w-none">{channel.channelSku}</p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm sm:text-base font-semibold text-[var(--foreground)]">{channel.fbaAvailable}</p>
                                      <p className="text-[10px] sm:text-xs text-[var(--muted-foreground)]">{Number(channel.velocity30d || 0).toFixed(1)}/day</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {item.warehouseInventory && item.warehouseInventory.length > 0 && (
                            <div>
                              <h4 className="text-xs sm:text-sm font-semibold text-[var(--foreground)] flex items-center gap-2 mb-3 sm:mb-4">
                                <Warehouse className="w-4 h-4" />
                                Warehouse Breakdown
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                {item.warehouseInventory.map((wh, idx) => (
                                  <div 
                                    key={idx}
                                    className="flex items-center justify-between p-2 sm:p-3 bg-[var(--secondary)]/50 rounded-lg border border-[var(--border)]/50"
                                  >
                                    <div className="flex items-center gap-2 sm:gap-3">
                                      <Building2 className="w-4 sm:w-5 h-4 sm:h-5 text-blue-400" />
                                      <div>
                                        <p className="text-xs sm:text-sm font-medium text-[var(--foreground)]">{wh.warehouseName}</p>
                                        <p className="text-[10px] sm:text-xs text-[var(--muted-foreground)] font-mono">{wh.warehouseCode}</p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm sm:text-base font-semibold text-[var(--foreground)]">{wh.available}</p>
                                      {wh.reserved > 0 && (
                                        <p className="text-[10px] sm:text-xs text-[var(--muted-foreground)]">Reserved: {wh.reserved}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Reorder Recommendation */}
                          <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-[var(--secondary)]/30 rounded-lg border border-[var(--border)]/50">
                            <h5 className="text-xs sm:text-sm font-semibold text-[var(--foreground)] mb-2">📊 Reorder Recommendation</h5>
                            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
                              <div>
                                <p className="text-[var(--muted-foreground)] text-[10px] sm:text-sm">90-day need</p>
                                <p className="text-[var(--foreground)] font-medium">{Math.ceil(item.velocity30d * 90)}</p>
                              </div>
                              <div>
                                <p className="text-[var(--muted-foreground)] text-[10px] sm:text-sm">Current</p>
                                <p className="text-[var(--foreground)] font-medium">{item.totalStock}</p>
                              </div>
                              <div>
                                <p className="text-[var(--muted-foreground)] text-[10px] sm:text-sm">Suggested</p>
                                <p className={`font-medium ${Math.ceil(item.velocity30d * 90) - item.totalStock > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {Math.max(0, Math.ceil(item.velocity30d * 90) - item.totalStock)}
                                </p>
                              </div>
                            </div>
                            {Math.ceil(item.velocity30d * 90) - item.totalStock > 0 && (
                              <Button variant="outline" size="sm" className="mt-3 text-xs sm:text-sm">
                                <Truck className="w-3 sm:w-4 h-3 sm:h-4 mr-1" />
                                <span className="hidden sm:inline">Create Purchase Order</span>
                                <span className="sm:hidden">Create PO</span>
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
