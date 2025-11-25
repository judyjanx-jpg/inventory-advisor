'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'

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

  // Sync state
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResults, setSyncResults] = useState<Record<string, { success?: boolean; message?: string; error?: string }>>({})

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
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

      if (data.credentials) {
        setSellerId(data.credentials.sellerId || '')
        setMarketplaceId(data.credentials.marketplaceId || 'ATVPDKIKX0DER')
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

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
        // Clear sensitive fields after save
        setClientId('')
        setClientSecret('')
        setRefreshToken('')
        alert('Settings saved successfully!')
        fetchSettings()
      } else {
        alert(data.error || 'Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Failed to save settings')
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
        alert('Disconnected from Amazon')
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
    }
  }

  const handleSync = async (type: 'products' | 'inventory' | 'orders') => {
    setSyncing(type)
    setSyncResults(prev => ({ ...prev, [type]: {} }))

    try {
      const res = await fetch(`/api/amazon/sync/${type}`, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        setSyncResults(prev => ({ ...prev, [type]: { success: true, message: data.message } }))
      } else {
        setSyncResults(prev => ({ ...prev, [type]: { success: false, error: data.error } }))
      }
      
      fetchSettings() // Refresh sync status
    } catch (error: any) {
      setSyncResults(prev => ({ ...prev, [type]: { success: false, error: error.message } }))
    } finally {
      setSyncing(null)
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

            {syncStatus.lastSyncError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                ⚠ Last sync error: {syncStatus.lastSyncError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Products Sync */}
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-blue-400">📦</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Products</h3>
                    <p className="text-xs text-slate-400">Catalog data & SKUs</p>
                  </div>
                </div>
                {syncResults.products?.success && (
                  <p className="text-xs text-emerald-400 mb-2">{syncResults.products.message}</p>
                )}
                {syncResults.products?.error && (
                  <p className="text-xs text-red-400 mb-2">{syncResults.products.error}</p>
                )}
                <button
                  onClick={() => handleSync('products')}
                  disabled={syncing !== null}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {syncing === 'products' ? (
                    <>
                      <span className="animate-spin">⟳</span> Syncing...
                    </>
                  ) : (
                    <>⟳ Sync Products</>
                  )}
                </button>
              </div>

              {/* Inventory Sync */}
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-emerald-400">📊</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Inventory</h3>
                    <p className="text-xs text-slate-400">FBA stock levels</p>
                  </div>
                </div>
                {syncResults.inventory?.success && (
                  <p className="text-xs text-emerald-400 mb-2">{syncResults.inventory.message}</p>
                )}
                {syncResults.inventory?.error && (
                  <p className="text-xs text-red-400 mb-2">{syncResults.inventory.error}</p>
                )}
                <button
                  onClick={() => handleSync('inventory')}
                  disabled={syncing !== null}
                  className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {syncing === 'inventory' ? (
                    <>
                      <span className="animate-spin">⟳</span> Syncing...
                    </>
                  ) : (
                    <>⟳ Sync Inventory</>
                  )}
                </button>
              </div>

              {/* Orders Sync */}
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-amber-400">🛒</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-white">Orders</h3>
                    <p className="text-xs text-slate-400">12 months history</p>
                  </div>
                </div>
                {syncResults.orders?.success && (
                  <p className="text-xs text-emerald-400 mb-2">{syncResults.orders.message}</p>
                )}
                {syncResults.orders?.error && (
                  <p className="text-xs text-red-400 mb-2">{syncResults.orders.error}</p>
                )}
                <button
                  onClick={() => handleSync('orders')}
                  disabled={syncing !== null}
                  className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-600 rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {syncing === 'orders' ? (
                    <>
                      <span className="animate-spin">⟳</span> Syncing...
                    </>
                  ) : (
                    <>⟳ Sync Orders</>
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

