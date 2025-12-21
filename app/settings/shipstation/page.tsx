'use client'

import { useState, useEffect, useCallback } from 'react'
import MainLayout from '@/components/layout/MainLayout'

export default function ShipStationSettingsPage() {
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Form state
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')

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
      const res = await fetch('/api/settings/shipstation')
      const data = await res.json()

      setIsConnected(data.isConnected || false)
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/shipstation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          apiSecret,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setIsConnected(true)
        setApiKey('')
        setApiSecret('')
        showToast('success', 'ShipStation connected successfully!')
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

  const handleTest = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/settings/shipstation/test', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        showToast('success', `Connection verified! Account: ${data.accountName || 'Connected'}`)
      } else {
        showToast('error', data.error || 'Connection test failed')
      }
    } catch (error) {
      console.error('Error testing connection:', error)
      showToast('error', 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect ShipStation? This will remove all API credentials.')) {
      return
    }

    try {
      const res = await fetch('/api/settings/shipstation', { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        setIsConnected(false)
        setApiKey('')
        setApiSecret('')
        showToast('success', 'Disconnected from ShipStation')
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
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
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg transform transition-all duration-300 ${
          toast.type === 'success'
            ? 'bg-emerald-500/90 text-[var(--foreground)]'
            : 'bg-red-500/90 text-[var(--foreground)]'
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
            <div className="w-14 h-14 bg-gradient-to-br from-[#f26c21] to-[#e85d04] rounded-xl flex items-center justify-center">
              <span className="text-2xl">🚢</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--foreground)]">ShipStation</h1>
              <p className="text-[var(--muted-foreground)]">Connect to ShipStation for shipping management</p>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-full text-sm font-medium ${
            isConnected
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-700/50 text-[var(--muted-foreground)] border border-[var(--border)]'
          }`}>
            {isConnected ? '✓ Connected' : '○ Not Connected'}
          </div>
        </div>

        {/* Features Overview */}
        {isConnected && (
          <div className="bg-[var(--card)]/50 border border-[var(--border)]/50 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <span className="text-orange-400">📦</span> ShipStation Integration
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[var(--secondary)]/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-blue-400">📋</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--foreground)]">Orders</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">Import & sync orders</p>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--secondary)]/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-emerald-400">🏷️</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--foreground)]">Labels</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">Create shipping labels</p>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--secondary)]/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-purple-400">📍</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--foreground)]">Tracking</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">Real-time tracking updates</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-[var(--card)] rounded-lg text-[var(--foreground)] text-sm font-medium transition-colors flex items-center gap-2"
              >
                {testing ? (
                  <>
                    <span className="animate-spin">⟳</span> Testing...
                  </>
                ) : (
                  <>🔗 Test Connection</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Credentials Form */}
        <div className="bg-[var(--card)]/50 border border-[var(--border)]/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
              <span className="text-[var(--muted-foreground)]">⚙</span> API Credentials
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
            <div className="space-y-4 mb-6">
              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  API Key <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your ShipStation API Key"
                  className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* API Secret */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  API Secret <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Enter your ShipStation API Secret"
                  className="w-full px-4 py-3 bg-[var(--secondary)]/50 border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !apiKey || !apiSecret}
                className="px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:from-slate-600 disabled:to-slate-600 rounded-lg text-[var(--foreground)] font-medium transition-all"
              >
                {saving ? 'Saving...' : isConnected ? 'Update Connection' : 'Connect to ShipStation'}
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
            <div className="text-sm text-[var(--muted-foreground)]">
              <p>✓ Connected to ShipStation</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">API credentials are securely stored</p>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="bg-[var(--card)]/30 border border-[var(--border)]/30 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">📚 Setup Guide</h3>
          <ol className="text-sm text-[var(--muted-foreground)] space-y-2 list-decimal list-inside">
            <li>Log in to your <a href="https://ship.shipstation.com/settings/api" target="_blank" className="text-cyan-400 hover:underline">ShipStation account</a></li>
            <li>Go to Settings → Account → API Settings</li>
            <li>Generate a new API Key and Secret if you don&apos;t have one</li>
            <li>Copy and paste the API Key and Secret above</li>
            <li>Click &quot;Connect to ShipStation&quot; to save</li>
          </ol>

          <div className="mt-4 p-4 bg-[var(--secondary)]/30 rounded-lg">
            <h4 className="text-sm font-medium text-[var(--foreground)] mb-2">🔒 Security Note</h4>
            <p className="text-xs text-[var(--muted-foreground)]">
              Your API credentials are encrypted and stored securely. ShipStation API uses Basic
              Authentication. Never share your API Secret with anyone.
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
