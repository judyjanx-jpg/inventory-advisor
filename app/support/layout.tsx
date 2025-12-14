'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import ChatWidget from '@/components/support/ChatWidget'

// Public support layout - no authentication required
export default function SupportLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/support" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-slate-900 font-bold text-lg">C</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white tracking-tight">CHOE Support</h1>
              <p className="text-xs text-slate-400">Help Center</p>
            </div>
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm text-slate-300">Need help?</p>
              <p className="text-xs text-slate-500">Mon-Fri 9am-5pm EST</p>
            </div>
            <Link 
              href="/support/contact"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-lg transition-colors text-sm"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 bg-slate-900/50 mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-white font-semibold mb-3">Quick Links</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/support/warranty" className="text-slate-400 hover:text-amber-400 transition-colors">Warranty Claim</Link></li>
                <li><Link href="/support/faq" className="text-slate-400 hover:text-amber-400 transition-colors">FAQs</Link></li>
                <li><Link href="/support/contact" className="text-slate-400 hover:text-amber-400 transition-colors">Contact Us</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-3">Popular Topics</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/support/faq/shipping" className="text-slate-400 hover:text-amber-400 transition-colors">Shipping Info</Link></li>
                <li><Link href="/support/faq/returns" className="text-slate-400 hover:text-amber-400 transition-colors">Returns & Exchanges</Link></li>
                <li><Link href="/support/faq/sizing" className="text-slate-400 hover:text-amber-400 transition-colors">Sizing Guide</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-3">About CHOE</h3>
              <p className="text-sm text-slate-400">
                Quality jewelry with lifetime warranty. We stand behind every piece we sell.
              </p>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-slate-800/50 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} CHOE Jewelers. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Floating Chat Widget */}
      <ChatWidget />
    </div>
  )
}

