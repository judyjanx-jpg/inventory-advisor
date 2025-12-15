'use client'
// Public Support Portal v4 - Customer-facing only

import { useState } from 'react'
import Link from 'next/link'
import { useBranding } from '@/contexts/BrandingContext'
import {
  Shield,
  Package,
  Mail,
  HelpCircle,
  MessageCircle,
  FileText,
  ChevronRight,
  Search
} from 'lucide-react'

export default function PublicSupportPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const branding = useBranding()

  const quickActions = [
    {
      icon: MessageCircle,
      title: 'Chat with Us',
      description: 'Get instant help from our support team',
      href: '#',
      onClick: () => window.dispatchEvent(new CustomEvent('openChat')),
      color: 'emerald',
    },
    {
      icon: FileText,
      title: 'Submit a Ticket',
      description: 'Create a support request',
      href: '/support/contact',
      color: 'blue',
    },
    {
      icon: Shield,
      title: 'File a Claim',
      description: 'Start a warranty claim',
      href: '/support/warranty',
      color: 'purple',
    },
    {
      icon: Package,
      title: 'Track Order',
      description: 'Check your order status',
      href: 'https://www.amazon.com/gp/your-account/order-history',
      external: true,
      color: 'amber',
    },
    {
      icon: HelpCircle,
      title: 'FAQ',
      description: 'Find answers to common questions',
      href: '/support/faq',
      color: 'cyan',
    },
  ]

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; iconBg: string; icon: string; border: string }> = {
      emerald: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', icon: 'text-emerald-600', border: 'hover:border-emerald-300' },
      blue: { bg: 'bg-blue-50', iconBg: 'bg-blue-100', icon: 'text-blue-600', border: 'hover:border-blue-300' },
      purple: { bg: 'bg-purple-50', iconBg: 'bg-purple-100', icon: 'text-purple-600', border: 'hover:border-purple-300' },
      amber: { bg: 'bg-amber-50', iconBg: 'bg-amber-100', icon: 'text-amber-600', border: 'hover:border-amber-300' },
      cyan: { bg: 'bg-cyan-50', iconBg: 'bg-cyan-100', icon: 'text-cyan-600', border: 'hover:border-cyan-300' },
    }
    return colors[color] || colors.emerald
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            How can we help you?
          </h1>
          <p className="text-lg text-gray-500 mb-8">
            Welcome to {branding.brandName} Support Center
          </p>

          {/* Search */}
          <div className="max-w-xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for help..."
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">
          What would you like to do?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickActions.map((action) => {
            const colors = getColorClasses(action.color)
            const linkProps = action.external
              ? { target: '_blank' as const, rel: 'noopener noreferrer' }
              : {}

            const content = (
              <div className={`group rounded-2xl ${colors.bg} border-2 border-transparent ${colors.border} p-6 transition-all hover:shadow-lg cursor-pointer`}>
                <div className={`w-14 h-14 rounded-xl ${colors.iconBg} flex items-center justify-center mb-4`}>
                  <action.icon className={`w-7 h-7 ${colors.icon}`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {action.title}
                </h3>
                <p className="text-sm text-gray-500">
                  {action.description}
                </p>
                <ChevronRight className="w-5 h-5 text-gray-300 mt-4 group-hover:translate-x-1 transition-transform" />
              </div>
            )

            if (action.onClick) {
              return (
                <button key={action.title} onClick={action.onClick} className="text-left w-full">
                  {content}
                </button>
              )
            }

            return (
              <Link key={action.title} href={action.href} {...linkProps}>
                {content}
              </Link>
            )
          })}
        </div>
      </section>

      {/* Warranty Banner */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: branding.primaryColor + '15' }}
        >
          <Shield className="w-12 h-12 mx-auto mb-4" style={{ color: branding.primaryColor }} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Lifetime Warranty
          </h2>
          <p className="text-gray-600 mb-6 max-w-lg mx-auto">
            All {branding.brandName} products come with our comprehensive lifetime warranty.
            We stand behind every piece we sell.
          </p>
          <Link
            href="/support/warranty"
            className="inline-flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
            style={{ backgroundColor: branding.primaryColor }}
          >
            Start Warranty Claim
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Contact Section */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Still need help?
          </h2>
          <p className="text-gray-500 mb-6">
            Our support team is available {branding.supportHours}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/support/contact"
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              Submit a Request
            </Link>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('openChat'))}
              className="px-6 py-3 text-white font-medium rounded-xl hover:shadow-lg transition-all"
              style={{ backgroundColor: branding.primaryColor }}
            >
              Chat with Us
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
