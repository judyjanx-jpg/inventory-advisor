'use client'

import { ReactNode, useState, useEffect, createContext, useContext } from 'react'
import Link from 'next/link'
import ChatWidget from '@/components/support/ChatWidget'

interface BrandingSettings {
  brandName: string
  tagline: string
  supportEmail: string
  supportPhone: string
  supportHours: string
  primaryColor: string
  logoUrl: string | null
}

const defaultBranding: BrandingSettings = {
  brandName: 'KISPER',
  tagline: 'Fine Jewelry',
  supportEmail: 'support@kisperjewelry.com',
  supportPhone: '',
  supportHours: 'Mon-Fri 9am-5pm EST',
  primaryColor: '#10b981',
  logoUrl: null,
}

export const BrandingContext = createContext<BrandingSettings>(defaultBranding)
export const useBranding = () => useContext(BrandingContext)

export default function SupportLayout({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(defaultBranding)

  useEffect(() => {
    fetch('/api/settings/branding')
      .then(res => res.json())
      .then(data => { if (data.branding) setBranding(data.branding) })
      .catch(console.error)
  }, [])

  return (
    <BrandingContext.Provider value={branding}>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <header className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/support" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ backgroundColor: branding.primaryColor + '33' }}>
                <span className="font-bold text-lg" style={{ color: branding.primaryColor }}>{branding.brandName.charAt(0)}</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white tracking-tight">{branding.brandName} Support</h1>
                <p className="text-xs text-slate-400">{branding.tagline || 'Help Center'}</p>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm text-slate-300">Need help?</p>
                <p className="text-xs text-slate-500">{branding.supportHours}</p>
              </div>
              <Link href="/support/contact" className="px-4 py-2 text-white font-medium rounded-lg transition-colors text-sm hover:opacity-90" style={{ backgroundColor: branding.primaryColor }}>
                Contact Us
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-800/50 bg-slate-900/50 mt-auto">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-white font-semibold mb-3">Quick Links</h3>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/support/warranty" className="text-slate-400 hover:text-emerald-400 transition-colors">Warranty Claim</Link></li>
                  <li><Link href="/support/faq" className="text-slate-400 hover:text-emerald-400 transition-colors">FAQs</Link></li>
                  <li><Link href="/support/contact" className="text-slate-400 hover:text-emerald-400 transition-colors">Contact Us</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-3">Popular Topics</h3>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/support/faq/shipping" className="text-slate-400 hover:text-emerald-400 transition-colors">Shipping Info</Link></li>
                  <li><Link href="/support/faq/returns" className="text-slate-400 hover:text-emerald-400 transition-colors">Returns & Exchanges</Link></li>
                  <li><Link href="/support/faq/sizing" className="text-slate-400 hover:text-emerald-400 transition-colors">Sizing Guide</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-3">About {branding.brandName}</h3>
                <p className="text-sm text-slate-400">Quality jewelry with lifetime warranty. We stand behind every piece we sell.</p>
                {branding.supportEmail && <p className="text-sm text-slate-400 mt-2"><a href={`mailto:${branding.supportEmail}`} className="hover:text-emerald-400">{branding.supportEmail}</a></p>}
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-800/50 text-center text-xs text-slate-500">Copyright {new Date().getFullYear()} {branding.brandName}. All rights reserved.</div>
          </div>
        </footer>
        <ChatWidget />
      </div>
    </BrandingContext.Provider>
  )
}
