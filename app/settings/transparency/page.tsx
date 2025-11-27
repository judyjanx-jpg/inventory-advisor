'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ArrowLeft, Key, Check, AlertCircle, Trash2, Eye, EyeOff } from 'lucide-react'

export default function TransparencySettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  
  const [settings, setSettings] = useState({
    configured: false,
    clientId: '',
    hasSecret: false,
  })
  
  const [formData, setFormData] = useState({
    clientId: '',
    clientSecret: '',
  })
  
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings/transparency')
      const data = await res.json()
      
      setSettings(data)
      if (data.clientId) {
        setFormData(prev => ({ ...prev, clientId: data.clientId }))
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/settings/transparency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        fetchSettings()
        setFormData(prev => ({ ...prev, clientSecret: '' }))
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to remove the Transparency API credentials?')) {
      return
    }

    try {
      const res = await fetch('/api/settings/transparency', { method: 'DELETE' })
      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: data.message })
        setSettings({ configured: false, clientId: '', hasSecret: false })
        setFormData({ clientId: '', clientSecret: '' })
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete settings' })
    }
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
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/settings')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Transparency API</h1>
            <p className="text-slate-400">Configure Amazon Transparency program integration</p>
          </div>
        </div>

        {/* Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {settings.configured ? (
                <>
                  <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
                  <span className="text-emerald-400 font-medium">Connected</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                  <span className="text-slate-400">Not configured</span>
                </>
              )}
            </div>
            {settings.configured && (
              <p className="text-sm text-slate-400 mt-2">
                Client ID: {settings.clientId?.slice(0, 8)}...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Credentials Form */}
        <Card>
          <CardHeader>
            <CardTitle>API Credentials</CardTitle>
            <CardDescription>
              Enter your Transparency API credentials from Amazon Developer Console
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Client ID
                </label>
                <input
                  type="text"
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  placeholder="e.g., 55n109uplvpo5q9spnoldgf1n2"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Client Secret
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={formData.clientSecret}
                    onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                    placeholder={settings.hasSecret ? '••••••••••••••••' : 'Enter client secret'}
                    className="w-full px-4 py-2 pr-12 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {settings.hasSecret && !formData.clientSecret && (
                  <p className="text-xs text-slate-500 mt-1">
                    Leave blank to keep existing secret
                  </p>
                )}
              </div>

              {message && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  message.type === 'success' 
                    ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400'
                    : 'bg-red-900/30 border border-red-500/30 text-red-400'
                }`}>
                  {message.type === 'success' 
                    ? <Check className="w-4 h-4" /> 
                    : <AlertCircle className="w-4 h-4" />
                  }
                  {message.text}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={saving || (!formData.clientId)}>
                  {saving ? 'Saving...' : 'Save & Verify'}
                </Button>
                {settings.configured && (
                  <Button type="button" variant="outline" onClick={handleDelete}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Info */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-medium text-white mb-2">About Transparency</h3>
            <p className="text-sm text-slate-400 mb-4">
              Amazon Transparency is a product serialization service that helps protect your brand
              from counterfeit products. Each unit receives a unique code that Amazon and customers
              can scan to verify authenticity.
            </p>
            <h3 className="font-medium text-white mb-2">How it works</h3>
            <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
              <li>Products enrolled in Transparency receive unique serial codes</li>
              <li>Codes are printed as 2D barcodes (QR codes) on labels</li>
              <li>This integration automatically fetches codes when printing labels</li>
              <li>Each code is used only once and tracked by Amazon</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}

