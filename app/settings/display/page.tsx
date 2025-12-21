'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Monitor, Save, Check, Tag, Sun, Moon, Palette } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

type TitleDisplayMode = 'full' | 'short' | 'none'

interface DisplaySettings {
  titleDisplay: TitleDisplayMode
  shortTitleLength: number
  // Label settings
  fnskuLabelSize: string // e.g., "3x1"
  tpOnlyLabelSize: string // e.g., "1x1"
}

const TITLE_OPTIONS: { value: TitleDisplayMode; label: string; description: string }[] = [
  { value: 'full', label: 'Full Title', description: 'Show the complete product title' },
  { value: 'short', label: 'Short Title', description: 'Show first 30 characters with ellipsis' },
  { value: 'none', label: 'SKU Only', description: 'Only show SKU, hide product title' },
]

export default function DisplaySettingsPage() {
  const { theme, setTheme } = useTheme()
  const [settings, setSettings] = useState<DisplaySettings>({
    titleDisplay: 'short',
    shortTitleLength: 30,
    fnskuLabelSize: '3x1',
    tpOnlyLabelSize: '1x1',
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Load settings from localStorage
    const stored = localStorage.getItem('displaySettings')
    if (stored) {
      try {
        setSettings(JSON.parse(stored))
      } catch (e) {
        console.error('Error loading display settings:', e)
      }
    }
  }, [])

  const saveSettings = () => {
    localStorage.setItem('displaySettings', JSON.stringify(settings))
    // Dispatch event so other components can react
    window.dispatchEvent(new CustomEvent('displaySettingsChanged', { detail: settings }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">Display Settings</h1>
          <p className="text-[var(--muted-foreground)] mt-1">Customize how information is displayed</p>
        </div>

        {/* Theme Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Theme
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Choose your preferred color theme
            </p>

            <div className="grid grid-cols-2 gap-4">
              {/* Dark Theme Option */}
              <button
                onClick={() => setTheme('dark')}
                className={`relative p-4 rounded-xl border-2 transition-all ${
                  theme === 'dark'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-12 rounded-lg bg-slate-900 border border-[var(--border)] flex items-center justify-center shadow-lg">
                    <Moon className="w-6 h-6 text-[var(--muted-foreground)]" />
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-[var(--foreground)]">Dark</div>
                    <div className="text-xs text-[var(--muted-foreground)]">Easy on the eyes</div>
                  </div>
                </div>
                {theme === 'dark' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                )}
              </button>

              {/* Light Theme Option */}
              <button
                onClick={() => setTheme('light')}
                className={`relative p-4 rounded-xl border-2 transition-all ${
                  theme === 'light'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-lg">
                    <Sun className="w-6 h-6 text-amber-500" />
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-[var(--foreground)]">Light</div>
                    <div className="text-xs text-[var(--muted-foreground)]">Classic bright</div>
                  </div>
                </div>
                {theme === 'light' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                )}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Title Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Product Title Display
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              Choose how product titles are displayed throughout the app
            </p>

            <div className="space-y-3">
              {TITLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                    settings.titleDisplay === option.value
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-[var(--border)] hover:border-[var(--border)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="titleDisplay"
                    value={option.value}
                    checked={settings.titleDisplay === option.value}
                    onChange={(e) => setSettings({ ...settings, titleDisplay: e.target.value as TitleDisplayMode })}
                    className="mt-1 w-4 h-4 text-cyan-500 bg-[var(--card)] border-[var(--border)]"
                  />
                  <div>
                    <div className="font-medium text-[var(--foreground)]">{option.label}</div>
                    <div className="text-sm text-[var(--muted-foreground)]">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>

            {settings.titleDisplay === 'short' && (
              <div className="pt-4 border-t border-[var(--border)]">
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Short title length (characters)
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={settings.shortTitleLength}
                  onChange={(e) => setSettings({ ...settings, shortTitleLength: parseInt(e.target.value) || 30 })}
                  className="w-24 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)]"
                />
              </div>
            )}

            {/* Preview */}
            <div className="pt-4 border-t border-[var(--border)]">
              <p className="text-sm font-medium text-[var(--foreground)] mb-2">Preview</p>
              <div className="p-4 bg-[var(--card)]/50 rounded-lg">
                <div className="text-[var(--foreground)] font-medium">MJBC116</div>
                {settings.titleDisplay === 'full' && (
                  <div className="text-[var(--muted-foreground)] text-sm mt-1">
                    KISPER 24k Gold Box Chain Necklace – Thin, Dainty, Gold Plated Stainless Steel Jewelry for Women with Lobster Clasp, 16"
                  </div>
                )}
                {settings.titleDisplay === 'short' && (
                  <div className="text-[var(--muted-foreground)] text-sm mt-1">
                    {`KISPER 24k Gold Box Chain Necklace – Thin, Dainty, Gold Plated Stainless Steel Jewelry for Women with Lobster Clasp, 16"`.slice(0, settings.shortTitleLength)}...
                  </div>
                )}
                {settings.titleDisplay === 'none' && (
                  <div className="text-[var(--muted-foreground)] text-sm mt-1 italic">
                    (title hidden)
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Label Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Label Sizes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-[var(--muted-foreground)]">
              Configure default label sizes for printing
            </p>

            {/* FNSKU / FNSKU+TP Label Size */}
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                FNSKU & FNSKU+Transparency Labels
              </label>
              <div className="flex gap-2">
                {['2x1', '3x1', '4x2'].map(size => (
                  <button
                    key={size}
                    onClick={() => setSettings({ ...settings, fnskuLabelSize: size })}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      settings.fnskuLabelSize === size
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-[var(--border)] text-[var(--foreground)] hover:border-[var(--border)]'
                    }`}
                  >
                    {size}"
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Used for FNSKU-only and FNSKU+Transparency combo labels
              </p>
            </div>

            {/* TP Only Label Size */}
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Transparency-Only Labels
              </label>
              <div className="flex gap-2">
                {['1x1', '1.5x1.5', '2x2'].map(size => (
                  <button
                    key={size}
                    onClick={() => setSettings({ ...settings, tpOnlyLabelSize: size })}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      settings.tpOnlyLabelSize === size
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-[var(--border)] text-[var(--foreground)] hover:border-[var(--border)]'
                    }`}
                  >
                    {size}"
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Used for products that already have FNSKU on packaging
              </p>
            </div>

            {/* Label Type Info */}
            <div className="pt-4 border-t border-[var(--border)]">
              <p className="text-sm font-medium text-[var(--foreground)] mb-3">Label Types (set per product)</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-24 text-[var(--muted-foreground)]">FNSKU+TP:</span>
                  <span className="text-[var(--foreground)]">Barcode + Transparency QR code (combo label)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-24 text-[var(--muted-foreground)]">FNSKU:</span>
                  <span className="text-[var(--foreground)]">Barcode only (no transparency)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-24 text-[var(--muted-foreground)]">TP Only:</span>
                  <span className="text-[var(--foreground)]">Transparency QR only (product already has FNSKU)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={saveSettings}>
            {saved ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>
    </MainLayout>
  )
}

