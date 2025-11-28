'use client'

import { useState, useEffect, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { useSyncContext } from '@/components/sync/SyncProvider'

const MARKETPLACES = [
  { id: 'ATVPDKIKX0DER', name: 'United States', region: 'na' },
  { id: 'A2EUQ1WTGCTBG2', name: 'Canada', region: 'na' },
  { id: 'A1AM78C64UM0Y8', name: 'Mexico', region: 'na' },
  { id: 'A2Q3Y263D00KWC', name: 'Brazil', region: 'na' },
  { id: 'A1F83G8C2ARO7P', name: 'United Kingdom', region: 'eu' },
  { id: 'A1PA6795UKMFR9', name: 'Germany', region: 'eu' },
  { id: 'A13V1IB3VIYBER', name: 'France', region: 'eu' },
  { id: 'A1RKKUPIHCS9HS', name: 'Spain', region: 'eu' },
  { id: 'APJ6JRA9NG5V4', name: 'Italy', region: 'eu' },
  { id: 'A1805IZSGTT6HS', name: 'Netherlands', region: 'eu' },
  { id: 'A2NODRKZP88ZB9', name: 'Sweden', region: 'eu' },
  { id: 'A1C3SOZRARQ6R3', name: 'Poland', region: 'eu' },
  { id: 'A39IBJ37TRP1C6', name: 'Australia', region: 'fe' },
  { id: 'A1VC38T7YXB528', name: 'Japan', region: 'fe' },
  { id: 'A19VAU5U5O7RUS', name: 'Singapore', region: 'fe' },
]

interface SyncState {
  type: 'products' | 'inventory' | 'orders' | 'sales' | 'initial' | null
  status: 'idle' | 'syncing' | 'success' | 'error'
  message?: string
  startedAt?: number
}

export default function AmazonSettingsPage() {
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{
    lastSyncAt?: string
    lastSyncStatus?: string
    lastSyncError?: string
    lastSuccessfulSync?: string
  }>({})

  // Form state
  const [sellerId, setSellerId] = useState('')
  const [marketplaceId, setMarketplaceId] = useState('ATVPDKIKX0DER')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [refreshToken, setRefreshToken] = useState('')

  // Sync state - persistent
  const [syncState, setSyncState] = useState<SyncState>({ type: null, status: 'idle' })
  const [syncResults, setSyncResults] = useState<Record<string, { success?: boolean; message?: string; error?: string }>>({})
  
  // Toast notification
  const [toast, setToast] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ 
    show: false, 
    type: 'success', 
    message: '' 
  })

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ show: true, type, message })
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 5000)
  }

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/amazon')
      const data = await res.json()
      
      setIsConnected(data.isConnected || false)
      setSyncStatus({
        lastSyncAt: data.lastSyncAt,
        lastSyncStatus: data.lastSyncStatus,
        lastSyncError: data.lastSyncError,
        lastSuccessfulSync: data.lastSuccessfulSync,
      })

      // Check if sync is running
      if (data.lastSyncStatus === 'running') {
        setSyncState(prev => prev.status !== 'syncing' ? { ...prev, status: 'syncing' } : prev)
      }

      if (data.credentials) {
        setSellerId(data.credentials.sellerId || '')
        setMarketplaceId(data.credentials.marketplaceId || 'ATVPDKIKX0DER')
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Poll for sync status while syncing
  useEffect(() => {
    if (syncState.status !== 'syncing') return
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/settings/amazon')
        const data = await res.json()
        
        if (data.lastSyncStatus === 'success') {
          setSyncState(prev => ({ ...prev, status: 'success' }))
          setSyncResults(prev => ({ 
            ...prev, 
            [syncState.type || 'products']: { success: true, message: 'Sync completed successfully!' } 
          }))
          const typeLabels: Record<string, string> = { products: 'Products', inventory: 'Inventory', orders: 'Orders', sales: 'Sales History' }
          showToast('success', `✓ ${typeLabels[syncState.type || 'products']} sync completed!`)
          fetchSettings()
          clearInterval(interval)
        } else if (data.lastSyncStatus === 'error') {
          setSyncState(prev => ({ ...prev, status: 'error' }))
          setSyncResults(prev => ({ 
            ...prev, 
            [syncState.type || 'products']: { success: false, error: data.lastSyncError } 
          }))
          showToast('error', `Sync failed: ${data.lastSyncError}`)
          fetchSettings()
          clearInterval(interval)
        }
      } catch (err) {
        console.error('Error polling sync status:', err)
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [syncState.status, syncState.type, fetchSettings])

  const handleSave = async () => {
    setSaving(true)
    try {
      const marketplace = MARKETPLACES.find(m => m.id === marketplaceId)
      
      const res = await fetch('/api/settings/amazon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId,
          marketplaceId,
          clientId,
          clientSecret,
          refreshToken,
          region: marketplace?.region || 'na',
        }),
      })

      const data = await res.json()
      
      if (data.success) {
        setIsConnected(true)
        setClientId('')
        setClientSecret('')
        setRefreshToken('')
        showToast('success', 'Amazon connected successfully!')
        fetchSettings()
      } else {
        showToast('error', data.error || 'Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      showToast('error', 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Amazon? This will remove all API credentials.')) {
      return
    }

    try {
      const res = await fetch('/api/settings/amazon', { method: 'DELETE' })
      const data = await res.json()
      
      if (data.success) {
        setIsConnected(false)
        setSellerId('')
        setMarketplaceId('ATVPDKIKX0DER')
        setClientId('')
        setClientSecret('')
        setRefreshToken('')
        setSyncStatus({})
        showToast('success', 'Disconnected from Amazon')
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
    }
  }

  // Get global sync context
  const { startSync: globalStartSync, endSync: globalEndSync } = useSyncContext()

  const handleSync = async (type: 'products' | 'inventory' | 'orders' | 'sales') => {
    setSyncState({ type, status: 'syncing', startedAt: Date.now() })
    setSyncResults(prev => ({ ...prev, [type]: {} }))
    globalStartSync(type.charAt(0).toUpperCase() + type.slice(1))

    try {
      const res = await fetch(`/api/amazon/sync/${type}`, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        setSyncState({ type, status: 'success', message: data.message })
        setSyncResults(prev => ({ ...prev, [type]: { success: true, message: data.message } }))
        showToast('success', `✓ ${data.message}`)
        globalEndSync('success', data.message)
      } else {
        setSyncState({ type, status: 'error', message: data.error })
        setSyncResults(prev => ({ ...prev, [type]: { success: false, error: data.error } }))
        showToast('error', data.error || 'Sync failed')
        globalEndSync('error', data.error)
      }
      
      fetchSettings()
    } catch (error: any) {
      setSyncState({ type, status: 'error', message: error.message })
      setSyncResults(prev => ({ ...prev, [type]: { success: false, error: error.message } }))
      showToast('error', error.message || 'Sync failed')
      globalEndSync('error', error.message)
    }
  }

  const handleInitialSync = async () => {
    if (!confirm('This will pull 2 years of historical data from Amazon.\n\nThis may take 1-4+ hours for large accounts.\n\nContinue?')) {
      return
    }

    setSyncState({ type: 'initial', status: 'syncing', startedAt: Date.now() })
    setSyncResults(prev => ({ ...prev, initial: {} }))
    globalStartSync('2-Year Historical Data')

    try {
      const res = await fetch('/api/amazon/sync/initial', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        setSyncState({ type: 'initial', status: 'success', message: data.message })
        setSyncResults(prev => ({ ...prev, initial: { success: true, message: data.message } }))
        showToast('success', `✓ ${data.message}`)
        globalEndSync('success', data.message)
      } else {
        setSyncState({ type: 'initial', status: 'error', message: data.error })
        setSyncResults(prev => ({ ...prev, initial: { success: false, error: data.error } }))
        showToast('error', data.error || 'Initial sync failed')
        globalEndSync('error', data.error)
      }
      
      fetchSettings()
    } catch (error: any) {
      setSyncState({ type: 'initial', status: 'error', message: error.message })
      setSyncResults(prev => ({ ...prev, initial: { success: false, error: error.message } }))
      showToast('error', error.message || 'Initial sync failed')
      globalEndSync('error', error.message)
    }
  }

  const getSyncDuration = () => {
    if (!syncState.startedAt) return ''
    const seconds = Math.floor((Date.now() - syncState.startedAt) / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
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
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg transform transition-all duration-300 ${
          toast.type === 'success' 
            ? 'bg-emerald-500/90 text-white' 
            : 'bg-red-500/90 text-white'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-xl">{toast.type === 'success' ? '✓' : '✗'}</span>
            <span className="font-medium">{toast.message}</span>
            <button 
              onClick={() => setToast(prev => ({ ...prev, show: false }))}
              className="ml-4 hover:opacity-70"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-[#232f3e] to-[#37475a] rounded-xl flex items-center justify-center">
              <span className="text-2xl">📦</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Amazon SP-API</h1>
              <p className="text-slate-400">Connect to Amazon Seller Central</p>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-full text-sm font-medium ${
            isConnected 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : 'bg-slate-700/50 text-slate-400 border border-slate-600'
          }`}>
            {isConnected ? '✓ Connected' : '○ Not Connected'}
          </div>
        </div>

        {/* Sync Section */}
        {isConnected && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-cyan-400">⟳</span> Data Sync
            </h2>

            {syncStatus.lastSyncError && syncState.status !== 'syncing' && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                ⚠ Last sync error: {syncStatus.lastSyncError}
              </div>
            )}

            {/* Initial Historical Sync */}
            <div className={`mb-6 bg-gradient-to-r from-purple-900/30 to-cyan-900/30 border border-purple-500/30 rounded-xl p-5 ${syncState.type === 'initial' && syncState.status === 'syncing' ? 'ring-2 ring-purple-500' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center">
                    {syncState.type === 'initial' && syncState.status === 'syncing' ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-400 border-t-transparent"></div>
                    ) : (
                      <span className="text-2xl">🚀</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-lg">Initial Historical Sync</h3>
                    <p className="text-slate-400 text-sm">Pull 2 years of orders, fees, returns, reimbursements & more</p>
                  </div>
                </div>
                <button
                  onClick={handleInitialSync}
                  disabled={syncState.status === 'syncing'}
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all flex items-center gap-2 shadow-lg shadow-purple-500/20"
                >
                  {syncState.type === 'initial' && syncState.status === 'syncing' ? (
                    <>
                      <span className="animate-spin">⟳</span> Running... {getSyncDuration()}
                    </>
                  ) : (
                    <>🚀 Run Initial Sync</>
                  )}
                </button>
              </div>
              {syncResults.initial?.success && (
                <p className="mt-3 text-sm text-emerald-400">✓ {syncResults.initial.message}</p>
              )}
              {syncResults.initial?.error && (
                <p className="mt-3 text-sm text-red-400">✗ {syncResults.initial.error}</p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                ⚠️ This can take 1-4+ hours for large accounts. You can continue using the app while it runs.
              </p>
            </div>

            {/* Quick Syncs */}
            <h3 className="text-sm font-medium text-slate-400 mb-3">Quick Syncs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Products Sync */}
              <div className={`bg-slate-900/50 rounded-lg p-4 ${syncState.type === 'products' && syncState.status === 'syncing' ? 'ring-2 ring-blue-500' : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    {syncState.type === 'products' && syncState.status === 'syncing' ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-400 border-t-transparent"></div>
                    ) : (
                      <span className="text-blue-400">📦</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Products</h3>
                    <p className="text-xs text-slate-400">Catalog data & SKUs</p>
                  </div>
                </div>
                {syncResults.products?.success && (
                  <p className="text-xs text-emerald-400 mb-2">✓ {syncResults.products.message}</p>
                )}
                {syncResults.products?.error && (
                  <p className="text-xs text-red-400 mb-2">✗ {syncResults.products.error}</p>
                )}
                <button
                  onClick={() => handleSync('products')}
                  disabled={syncState.status === 'syncing'}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {syncState.type === 'products' && syncState.status === 'syncing' ? (
                    <>
                      <span className="animate-spin">⟳</span> Syncing... {getSyncDuration()}
                    </>
                  ) : (
                    <>⟳ Sync Products</>
                  )}
                </button>
              </div>

              {/* Inventory Sync */}
              <div className={`bg-slate-900/50 rounded-lg p-4 ${syncState.type === 'inventory' && syncState.status === 'syncing' ? 'ring-2 ring-emerald-500' : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    {syncState.type === 'inventory' && syncState.status === 'syncing' ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-400 border-t-transparent"></div>
                    ) : (
                      <span className="text-emerald-400">📊</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Inventory</h3>
                    <p className="text-xs text-slate-400">FBA stock levels</p>
                  </div>
                </div>
                {syncResults.inventory?.success && (
                  <p className="text-xs text-emerald-400 mb-2">✓ {syncResults.inventory.message}</p>
                )}
                {syncResults.inventory?.error && (
                  <p className="text-xs text-red-400 mb-2">✗ {syncResults.inventory.error}</p>
                )}
                <button
                  onClick={() => handleSync('inventory')}
                  disabled={syncState.status === 'syncing'}
                  className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {syncState.type === 'inventory' && syncState.status === 'syncing' ? (
                    <>
                      <span className="animate-spin">⟳</span> Syncing... {getSyncDuration()}
                    </>
                  ) : (
                    <>⟳ Sync Inventory</>
                  )}
                </button>
              </div>

              {/* Orders Sync */}
              <div className={`bg-slate-900/50 rounded-lg p-4 ${syncState.type === 'orders' && syncState.status === 'syncing' ? 'ring-2 ring-amber-500' : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                    {syncState.type === 'orders' && syncState.status === 'syncing' ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-amber-400 border-t-transparent"></div>
                    ) : (
                      <span className="text-amber-400">🛒</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Orders</h3>
                    <p className="text-xs text-slate-400">12 months history</p>
                  </div>
                </div>
                {syncResults.orders?.success && (
                  <p className="text-xs text-emerald-400 mb-2">✓ {syncResults.orders.message}</p>
                )}
                {syncResults.orders?.error && (
                  <p className="text-xs text-red-400 mb-2">✗ {syncResults.orders.error}</p>
                )}
                <button
                  onClick={() => handleSync('orders')}
                  disabled={syncState.status === 'syncing'}
                  className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {syncState.type === 'orders' && syncState.status === 'syncing' ? (
                    <>
                      <span className="animate-spin">⟳</span> Syncing... {getSyncDuration()}
                    </>
                  ) : (
                    <>⟳ Sync Orders</>
                  )}
                </button>
              </div>

              {/* Sales History Sync */}
              <div className={`bg-slate-900/50 rounded-lg p-4 ${syncState.type === 'sales' && syncState.status === 'syncing' ? 'ring-2 ring-purple-500' : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    {syncState.type === 'sales' && syncState.status === 'syncing' ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-400 border-t-transparent"></div>
                    ) : (
                      <span className="text-purple-400">📈</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Sales History</h3>
                    <p className="text-xs text-slate-400">2 years for trends</p>
                  </div>
                </div>
                {syncResults.sales?.success && (
                  <p className="text-xs text-emerald-400 mb-2">✓ {syncResults.sales.message}</p>
                )}
                {syncResults.sales?.error && (
                  <p className="text-xs text-red-400 mb-2">✗ {syncResults.sales.error}</p>
                )}
                <button
                  onClick={() => handleSync('sales')}
                  disabled={syncState.status === 'syncing'}
                  className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {syncState.type === 'sales' && syncState.status === 'syncing' ? (
                    <>
                      <span className="animate-spin">⟳</span> Syncing... {getSyncDuration()}
                    </>
                  ) : (
                    <>⟳ Sync Sales</>
                  )}
                </button>
              </div>
            </div>

            {syncStatus.lastSuccessfulSync && (
              <p className="text-xs text-slate-500 mt-4">
                Last successful sync: {new Date(syncStatus.lastSuccessfulSync).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Credentials Form */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-slate-400">⚙</span> API Credentials
            </h2>
            {isConnected && (
              <button
                onClick={() => {
                  const el = document.getElementById('credentials-form')
                  if (el) el.classList.toggle('hidden')
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                Update credentials
              </button>
            )}
          </div>

          <div id="credentials-form" className={isConnected ? 'hidden' : ''}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Seller ID */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Seller ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  placeholder="AEQATM2NEGVIR"
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Marketplace */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Marketplace <span className="text-red-400">*</span>
                </label>
                <select
                  value={marketplaceId}
                  onChange={(e) => setMarketplaceId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  {MARKETPLACES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              {/* LWA Client ID */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  LWA Client ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="amzn1.application-oa2-client.xxxxx"
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* LWA Client Secret */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  LWA Client Secret <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="amzn1.oa2-cs.v1.xxxxx"
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Refresh Token */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Refresh Token <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  placeholder="Atzr|IwEBIF..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !sellerId || !clientId || !clientSecret || !refreshToken}
                className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-600 disabled:to-slate-600 rounded-lg text-white font-medium transition-all"
              >
                {saving ? 'Saving...' : isConnected ? 'Update Connection' : 'Connect to Amazon'}
              </button>

              {isConnected && (
                <button
                  onClick={handleDisconnect}
                  className="px-6 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-red-400 font-medium transition-colors"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {isConnected && (
            <div className="text-sm text-slate-400">
              <p>✓ Connected as Seller ID: <span className="text-white font-mono">{sellerId}</span></p>
              <p>✓ Marketplace: <span className="text-white">{MARKETPLACES.find(m => m.id === marketplaceId)?.name || 'Unknown'}</span></p>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">📚 Setup Guide</h3>
          <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
            <li>Register as a developer in <a href="https://sellercentral.amazon.com/apps/store/developer" target="_blank" className="text-cyan-400 hover:underline">Seller Central Developer Portal</a></li>
            <li>Create an SP-API app with required roles (Product Listing, Inventory, Orders)</li>
            <li>Get your LWA credentials from the app settings</li>
            <li>Self-authorize your app to generate a Refresh Token</li>
            <li>Enter all credentials above and connect</li>
          </ol>
        </div>
      </div>
    </MainLayout>
  )
}
