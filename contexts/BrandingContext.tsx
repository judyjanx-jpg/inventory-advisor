'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export interface BrandingSettings {
  brandName: string
  tagline: string
  supportEmail: string
  supportPhone: string
  supportHours: string
  primaryColor: string
  logoUrl: string | null
}

export const defaultBranding: BrandingSettings = {
  brandName: 'KISPER',
  tagline: 'Fine Jewelry',
  supportEmail: 'support@kisperjewelry.com',
  supportPhone: '',
  supportHours: 'Mon-Fri 9am-5pm EST',
  primaryColor: '#10b981',
  logoUrl: null,
}

const BrandingContext = createContext<BrandingSettings>(defaultBranding)

export function useBranding() {
  return useContext(BrandingContext)
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    fetch('/api/settings/branding')
      .then(res => res.json())
      .then(data => { 
        if (data.branding) setBranding(data.branding) 
      })
      .catch(console.error)
  }, [])

  // Avoid hydration mismatch by using default values until mounted
  const value = mounted ? branding : defaultBranding

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  )
}

