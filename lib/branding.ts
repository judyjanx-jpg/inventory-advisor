/**
 * Support Portal Branding Configuration
 * Fetches brand settings from database with fallback to environment variables
 */

import { prisma } from '@/lib/prisma'

export interface BrandingSettings {
  brandName: string
  tagline: string
  supportEmail: string
  supportPhone: string
  supportHours: string
  primaryColor: string
  logoUrl: string | null
}

const DEFAULT_BRANDING: BrandingSettings = {
  brandName: process.env.SUPPORT_BRAND_NAME || 'KISPER',
  tagline: process.env.SUPPORT_TAGLINE || 'Fine Jewelry',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@kisperjewelry.com',
  supportPhone: process.env.SUPPORT_PHONE || '',
  supportHours: process.env.SUPPORT_HOURS || 'Mon-Fri 9am-5pm EST',
  primaryColor: process.env.SUPPORT_PRIMARY_COLOR || '#10b981', // emerald-500
  logoUrl: process.env.SUPPORT_LOGO_URL || null,
}

let cachedBranding: BrandingSettings | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60000 // 1 minute cache

/**
 * Get branding settings (server-side)
 */
export async function getBranding(): Promise<BrandingSettings> {
  // Return cache if valid
  if (cachedBranding && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedBranding
  }

  try {
    // Try to fetch from database
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          startsWith: 'branding_'
        }
      }
    })

    if (settings.length > 0) {
      const brandingFromDb: Partial<BrandingSettings> = {}
      settings.forEach(s => {
        const key = s.key.replace('branding_', '') as keyof BrandingSettings
        brandingFromDb[key] = s.value as any
      })

      cachedBranding = { ...DEFAULT_BRANDING, ...brandingFromDb }
    } else {
      cachedBranding = DEFAULT_BRANDING
    }
  } catch (error) {
    // Database not available or table doesn't exist yet
    console.log('[Branding] Using default settings')
    cachedBranding = DEFAULT_BRANDING
  }

  cacheTimestamp = Date.now()
  return cachedBranding
}

/**
 * Update branding settings
 */
export async function updateBranding(updates: Partial<BrandingSettings>): Promise<BrandingSettings> {
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      await prisma.setting.upsert({
        where: { key: `branding_${key}` },
        update: { value: String(value) },
        create: { key: `branding_${key}`, value: String(value) },
      })
    }
  }

  // Clear cache
  cachedBranding = null
  cacheTimestamp = 0

  return getBranding()
}

/**
 * Clear branding cache (call after updates)
 */
export function clearBrandingCache() {
  cachedBranding = null
  cacheTimestamp = 0
}

