'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { MessageCircle, X } from 'lucide-react'
import { useState } from 'react'

// Public support layout - no authentication required
export default function SupportLayout({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false)

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
      <div className="fixed bottom-6 right-6 z-50">
        {chatOpen ? (
          <div className="w-80 sm:w-96 h-[500px] bg-slate-900 rounded-2xl shadow-2xl shadow-black/50 border border-slate-700 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Support Chat</h4>
                  <p className="text-xs text-slate-700">We typically reply instantly</p>
                </div>
              </div>
              <button 
                onClick={() => setChatOpen(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-900" />
              </button>
            </div>
            
            {/* Chat Body */}
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm p-3 max-w-[85%]">
                <p className="text-sm text-slate-200">
                  Hi there! 👋 I'm your AI support assistant. How can I help you today?
                </p>
                <p className="text-xs text-slate-500 mt-2">Just now</p>
              </div>
              
              {/* Quick Actions */}
              <div className="mt-4 space-y-2">
                <p className="text-xs text-slate-500 mb-2">Quick options:</p>
                <button className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors">
                  📦 Track my order
                </button>
                <button className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors">
                  🔄 Start a warranty claim
                </button>
                <button className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors">
                  📏 Help with sizing
                </button>
                <button className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors">
                  👤 Talk to a human
                </button>
              </div>
            </div>
            
            {/* Chat Input */}
            <div className="p-3 border-t border-slate-700">
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
                />
                <button className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-xl transition-colors text-sm">
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setChatOpen(true)}
            className="group flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 font-semibold rounded-full shadow-lg shadow-amber-500/30 transition-all hover:shadow-amber-500/50 hover:scale-105"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="hidden sm:inline">Chat with us</span>
          </button>
        )}
      </div>
    </div>
  )
}

