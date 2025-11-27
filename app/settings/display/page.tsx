'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Monitor, Save, Check } from 'lucide-react'

type TitleDisplayMode = 'full' | 'short' | 'none'

interface DisplaySettings {
  titleDisplay: TitleDisplayMode
  shortTitleLength: number
}

const TITLE_OPTIONS: { value: TitleDisplayMode; label: string; description: string }[] = [
  { value: 'full', label: 'Full Title', description: 'Show the complete product title' },
  { value: 'short', label: 'Short Title', description: 'Show first 30 characters with ellipsis' },
  { value: 'none', label: 'SKU Only', description: 'Only show SKU, hide product title' },
]

export default function DisplaySettingsPage() {
  const [settings, setSettings] = useState<DisplaySettings>({
    titleDisplay: 'short',
    shortTitleLength: 30,
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
          <h1 className="text-3xl font-bold text-white">Display Settings</h1>
          <p className="text-slate-400 mt-1">Customize how information is displayed</p>
        </div>

        {/* Title Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Product Title Display
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-400">
              Choose how product titles are displayed throughout the app
            </p>

            <div className="space-y-3">
              {TITLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                    settings.titleDisplay === option.value
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="titleDisplay"
                    value={option.value}
                    checked={settings.titleDisplay === option.value}
                    onChange={(e) => setSettings({ ...settings, titleDisplay: e.target.value as TitleDisplayMode })}
                    className="mt-1 w-4 h-4 text-cyan-500 bg-slate-800 border-slate-600"
                  />
                  <div>
                    <div className="font-medium text-white">{option.label}</div>
                    <div className="text-sm text-slate-400">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>

            {settings.titleDisplay === 'short' && (
              <div className="pt-4 border-t border-slate-700">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Short title length (characters)
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={settings.shortTitleLength}
                  onChange={(e) => setSettings({ ...settings, shortTitleLength: parseInt(e.target.value) || 30 })}
                  className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
            )}

            {/* Preview */}
            <div className="pt-4 border-t border-slate-700">
              <p className="text-sm font-medium text-slate-300 mb-2">Preview</p>
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <div className="text-white font-medium">MJBC116</div>
                {settings.titleDisplay === 'full' && (
                  <div className="text-slate-400 text-sm mt-1">
                    KISPER 24k Gold Box Chain Necklace – Thin, Dainty, Gold Plated Stainless Steel Jewelry for Women with Lobster Clasp, 16"
                  </div>
                )}
                {settings.titleDisplay === 'short' && (
                  <div className="text-slate-400 text-sm mt-1">
                    {`KISPER 24k Gold Box Chain Necklace – Thin, Dainty, Gold Plated Stainless Steel Jewelry for Women with Lobster Clasp, 16"`.slice(0, settings.shortTitleLength)}...
                  </div>
                )}
                {settings.titleDisplay === 'none' && (
                  <div className="text-slate-500 text-sm mt-1 italic">
                    (title hidden)
                  </div>
                )}
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

