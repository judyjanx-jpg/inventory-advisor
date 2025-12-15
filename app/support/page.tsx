'use client'

import Link from 'next/link'
import { useBranding } from '@/contexts/BrandingContext'
import {
  Shield,
  Package,
  MessageCircle,
  FileText,
  HelpCircle,
  ChevronRight,
  Sparkles,
  Heart
} from 'lucide-react'

export default function PublicSupportPortal() {
  const branding = useBranding()

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Hero */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            We're here to help
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Welcome to {branding.brandName} Support
          </h1>
          <p className="text-xl text-gray-500">
            How can we assist you today?
          </p>
        </div>
      </section>

      {/* Action Cards */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Chat Card */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('openChat'))}
            className="group bg-white border-2 border-gray-100 hover:border-emerald-200 rounded-2xl p-8 text-left transition-all hover:shadow-xl"
          >
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <MessageCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Chat with Us</h2>
            <p className="text-gray-500 mb-4">Get instant answers from our AI assistant</p>
            <span className="inline-flex items-center text-emerald-600 font-medium">
              Start chatting <ChevronRight className="w-4 h-4 ml-1" />
            </span>
          </button>

          {/* Warranty Card */}
          <Link
            href="/support/warranty"
            className="group bg-white border-2 border-gray-100 hover:border-purple-200 rounded-2xl p-8 transition-all hover:shadow-xl"
          >
            <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Shield className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Warranty Claim</h2>
            <p className="text-gray-500 mb-4">Start a warranty claim for your jewelry</p>
            <span className="inline-flex items-center text-purple-600 font-medium">
              File a claim <ChevronRight className="w-4 h-4 ml-1" />
            </span>
          </Link>

          {/* Contact Card */}
          <Link
            href="/support/contact"
            className="group bg-white border-2 border-gray-100 hover:border-blue-200 rounded-2xl p-8 transition-all hover:shadow-xl"
          >
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Contact Us</h2>
            <p className="text-gray-500 mb-4">Submit a support request</p>
            <span className="inline-flex items-center text-blue-600 font-medium">
              Get in touch <ChevronRight className="w-4 h-4 ml-1" />
            </span>
          </Link>

          {/* FAQ Card */}
          <Link
            href="/support/faq"
            className="group bg-white border-2 border-gray-100 hover:border-amber-200 rounded-2xl p-8 transition-all hover:shadow-xl"
          >
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <HelpCircle className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">FAQs</h2>
            <p className="text-gray-500 mb-4">Find answers to common questions</p>
            <span className="inline-flex items-center text-amber-600 font-medium">
              Browse FAQs <ChevronRight className="w-4 h-4 ml-1" />
            </span>
          </Link>
        </div>
      </section>

      {/* Track Order */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <a
          href="https://www.amazon.com/gp/your-account/order-history"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between bg-gray-900 text-white rounded-2xl p-6 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-4">
            <Package className="w-8 h-8" />
            <div>
              <h3 className="text-lg font-semibold">Track Your Order</h3>
              <p className="text-gray-400">View order status on Amazon</p>
            </div>
          </div>
          <ChevronRight className="w-6 h-6" />
        </a>
      </section>

      {/* Warranty Promise */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div 
          className="rounded-3xl p-10 text-center"
          style={{ backgroundColor: branding.primaryColor + '10' }}
        >
          <Heart className="w-12 h-12 mx-auto mb-4" style={{ color: branding.primaryColor }} />
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Lifetime Warranty Included
          </h2>
          <p className="text-lg text-gray-600 max-w-xl mx-auto mb-6">
            Every {branding.brandName} piece comes with our comprehensive lifetime warranty. 
            We stand behind the quality of our jewelry.
          </p>
          <Link
            href="/support/warranty"
            className="inline-flex items-center gap-2 px-8 py-4 text-white text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
            style={{ backgroundColor: branding.primaryColor }}
          >
            <Shield className="w-5 h-5" />
            Start a Warranty Claim
          </Link>
        </div>
      </section>
    </div>
  )
}
