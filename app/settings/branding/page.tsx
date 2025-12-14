'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import {
  Palette,
  Save,
  RefreshCw,
  Loader2,
  Check,
  ExternalLink,
  Mail,
  Phone,
  Clock,
  Type,
  Image,
} from 'lucide-react'

interface BrandingSettings {
  brandName: string
  tagline: string
  supportEmail: string
  supportPhone: string
  supportHours: string
  primaryColor: string
  logoUrl: string | null
}

const COLOR_PRESETS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Teal', value: '#14b8a6' },
]

export default function BrandingSettingsPage() {
  const [settings, setSettings] = useState<BrandingSettings>({
    brandName: 'KISPER',
    tagline: 'Fine Jewelry',
    supportEmail: 'support@kisperjewelry.com',
    supportPhone: '',
    supportHours: 'Mon-Fri 9am-5pm EST',
    primaryColor: '#10b981',
    logoUrl: null,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings/branding')
      const data = await res.json()
      if (res.ok && data.branding) {
        setSettings(data.branding)
      }
    } catch (error) {
      console.error('Error fetching branding:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/settings/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      } else {
        throw new Error('Failed to save')
      }
    } catch (error) {
      console.error('Error saving branding:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (key: keyof BrandingSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-3">
              <Palette className="w-7 h-7 text-purple-400" />
              Support Portal Branding
            </h1>
            <p className="text-[var(--muted-foreground)] mt-1">
              Customize the appearance of your customer support portal
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/support"
              target="_blank"
              className="flex items-center gap-2 px-4 py-2 bg-[var(--muted)] hover:bg-[var(--hover-bg)] text-[var(--foreground)] rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Preview
            </a>
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : saved ? (
                <Check className="w-4 h-4 mr-2 text-emerald-400" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saved ? 'Saved!' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Brand Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="w-5 h-5" />
              Brand Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Brand Name *
                </label>
                <input
                  type="text"
                  value={settings.brandName}
                  onChange={(e) => handleChange('brandName', e.target.value)}
                  placeholder="KISPER"
                  className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Displayed in header, emails, and chat
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Tagline
                </label>
                <input
                  type="text"
                  value={settings.tagline}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  placeholder="Fine Jewelry"
                  className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Optional subtitle shown under brand name
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                <Image className="w-4 h-4 inline mr-1" />
                Logo URL
              </label>
              <input
                type="text"
                value={settings.logoUrl || ''}
                onChange={(e) => handleChange('logoUrl', e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Leave empty to show brand name as text
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Theme Color */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Theme Color
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Primary Color
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => handleChange('primaryColor', e.target.value)}
                  className="w-12 h-12 rounded-lg cursor-pointer border border-[var(--border)]"
                />
                <input
                  type="text"
                  value={settings.primaryColor}
                  onChange={(e) => handleChange('primaryColor', e.target.value)}
                  placeholder="#10b981"
                  className="flex-1 px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => handleChange('primaryColor', preset.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                      settings.primaryColor === preset.value
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: preset.value }}
                    />
                    <span className="text-sm">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="mt-4 p-4 bg-slate-950 rounded-lg border border-slate-800">
              <p className="text-xs text-slate-400 mb-3">Preview:</p>
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: settings.primaryColor + '33' }}
                >
                  <span style={{ color: settings.primaryColor }} className="font-bold text-lg">
                    {settings.brandName.charAt(0)}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-white">{settings.brandName} Support</h3>
                  {settings.tagline && (
                    <p className="text-xs text-slate-400">{settings.tagline}</p>
                  )}
                </div>
              </div>
              <button
                className="mt-3 px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: settings.primaryColor }}
              >
                Start Chat
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Support Email
                </label>
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => handleChange('supportEmail', e.target.value)}
                  placeholder="support@example.com"
                  className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Support Phone
                </label>
                <input
                  type="tel"
                  value={settings.supportPhone}
                  onChange={(e) => handleChange('supportPhone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Support Hours
              </label>
              <input
                type="text"
                value={settings.supportHours}
                onChange={(e) => handleChange('supportHours', e.target.value)}
                placeholder="Mon-Fri 9am-5pm EST"
                className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button (bottom) */}
        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={saving} size="lg">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : saved ? (
              <Check className="w-4 h-4 mr-2 text-emerald-400" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </MainLayout>
  )
}

