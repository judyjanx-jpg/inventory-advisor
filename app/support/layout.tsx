'use client'

import { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import ChatWidget from '@/components/support/ChatWidget'
import { BrandingProvider, useBranding } from '@/contexts/BrandingContext'

function SupportHeader() {
  const branding = useBranding()

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/support" className="flex items-center gap-3">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.brandName} className="h-10 w-auto" />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: branding.primaryColor + '20' }}
            >
              <span className="font-bold text-lg" style={{ color: branding.primaryColor }}>
                {branding.brandName.charAt(0)}
              </span>
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
              {branding.brandName} Support
            </h1>
            <p className="text-xs text-gray-500">{branding.tagline || 'Help Center'}</p>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm text-gray-600">Need help?</p>
            <p className="text-xs text-gray-400">{branding.supportHours}</p>
          </div>
          <Link
            href="/support/contact"
            className="px-4 py-2 text-white font-medium rounded-lg transition-all text-sm hover:shadow-lg"
            style={{ backgroundColor: branding.primaryColor }}
          >
            Contact Us
          </Link>
        </div>
      </div>
    </header>
  )
}

// Component to force light theme and hide admin UI on public support pages
function PublicPageStyles() {
  useEffect(() => {
    // Force light theme on support pages
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('light')
    document.documentElement.setAttribute('data-theme', 'light')

    // Clean up on unmount - restore previous theme
    return () => {
      const storedTheme = localStorage.getItem('theme') || 'dark'
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(storedTheme)
      document.documentElement.setAttribute('data-theme', storedTheme)
    }
  }, [])

  return (
    <style jsx global>{`
      /* Hide admin sidebar and floating elements on public support pages */
      .public-support-page ~ div > div:first-child > div[class*="w-64"][class*="fixed"],
      body > div > div > div[class*="w-64"][class*="fixed"],
      div[class*="sidebar"],
      div[class*="Sidebar"] {
        display: none !important;
      }

      /* Remove any left margin that might be applied for sidebar */
      .public-support-page ~ div main[class*="ml-64"],
      .public-support-page main[class*="ml-64"],
      main[class*="ml-64"] {
        margin-left: 0 !important;
      }

      /* Hide floating AI orb on public pages */
      .public-support-page ~ div > div[class*="fixed"][class*="bottom"],
      div[class*="FloatingOrb"] {
        display: none !important;
      }

      /* Force light background on public support pages */
      .public-support-page {
        --background: #f8fafc !important;
        --foreground: #0f172a !important;
        --card: #ffffff !important;
        --card-foreground: #0f172a !important;
        --border: #e2e8f0 !important;
        --muted: #f1f5f9 !important;
        --muted-foreground: #64748b !important;
      }
    `}</style>
  )
}

function SupportFooter() {
  const branding = useBranding()
  
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: branding.primaryColor + '20' }}
              >
                <span className="font-bold" style={{ color: branding.primaryColor }}>
                  {branding.brandName.charAt(0)}
                </span>
              </div>
              <span className="font-semibold text-gray-900">{branding.brandName}</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Quality jewelry with lifetime warranty. We stand behind every piece we sell.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Support</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/support/warranty" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Warranty Claim
                </Link>
              </li>
              <li>
                <Link href="/support/faq" className="text-gray-600 hover:text-gray-900 transition-colors">
                  FAQs
                </Link>
              </li>
              <li>
                <Link href="/support/contact" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Help Topics */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Help Topics</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/support/faq/shipping" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Shipping Info
                </Link>
              </li>
              <li>
                <Link href="/support/faq/returns" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Returns & Exchanges
                </Link>
              </li>
              <li>
                <Link href="/support/faq/sizing" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Sizing Guide
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">Contact</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              {branding.supportEmail && (
                <li>
                  <a 
                    href={`mailto:${branding.supportEmail}`} 
                    className="hover:text-gray-900 transition-colors"
                  >
                    {branding.supportEmail}
                  </a>
                </li>
              )}
              {branding.supportPhone && (
                <li>
                  <a 
                    href={`tel:${branding.supportPhone}`} 
                    className="hover:text-gray-900 transition-colors"
                  >
                    {branding.supportPhone}
                  </a>
                </li>
              )}
              <li className="text-gray-400">{branding.supportHours}</li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-10 pt-6 border-t border-gray-100 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} {branding.brandName}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

export default function SupportLayout({ children }: { children: ReactNode }) {
  return (
    <BrandingProvider>
      <PublicPageStyles />
      <div className="public-support-page min-h-screen bg-gray-50 flex flex-col" style={{ marginLeft: 0 }}>
        <SupportHeader />
        <main className="flex-1" style={{ marginLeft: 0 }}>
          {children}
        </main>
        <SupportFooter />
        <ChatWidget />
      </div>
    </BrandingProvider>
  )
}
