'use client'

import { useState, useEffect } from 'react'

export type TitleDisplayMode = 'full' | 'short' | 'none'

export interface DisplaySettings {
  titleDisplay: TitleDisplayMode
  shortTitleLength: number
}

const DEFAULT_SETTINGS: DisplaySettings = {
  titleDisplay: 'short',
  shortTitleLength: 30,
}

export function useDisplaySettings() {
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    // Load from localStorage
    const stored = localStorage.getItem('displaySettings')
    if (stored) {
      try {
        setSettings(JSON.parse(stored))
      } catch (e) {
        console.error('Error loading display settings:', e)
      }
    }

    // Listen for changes
    const handleChange = (e: CustomEvent<DisplaySettings>) => {
      setSettings(e.detail)
    }

    window.addEventListener('displaySettingsChanged', handleChange as EventListener)
    return () => window.removeEventListener('displaySettingsChanged', handleChange as EventListener)
  }, [])

  return settings
}

export function formatTitle(title: string, settings: DisplaySettings): string | null {
  if (!title) return null
  
  switch (settings.titleDisplay) {
    case 'none':
      return null
    case 'short':
      if (title.length <= settings.shortTitleLength) return title
      return title.slice(0, settings.shortTitleLength) + '...'
    case 'full':
    default:
      return title
  }
}

// Get settings synchronously (for components that can't use hooks)
export function getDisplaySettings(): DisplaySettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  
  const stored = localStorage.getItem('displaySettings')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch (e) {
      return DEFAULT_SETTINGS
    }
  }
  return DEFAULT_SETTINGS
}


