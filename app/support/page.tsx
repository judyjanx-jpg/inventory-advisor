'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useBranding } from './layout'
import { 
  Shield, 
  Package, 
  Mail, 
  HelpCircle, 
  Search, 
  ChevronRight,
  Truck,
  RotateCcw,
  Ruler,
  Sparkles,
  Clock,
  CheckCircle2
} from 'lucide-react'

export default function SupportPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const branding = useBranding()

  const quickActions = [
    {
      icon: Shield,
      title: 'Warranty Claim',
      description: 'Start a warranty claim for your jewelry',
      href: '/support/warranty',
      bgColor: 'bg-emerald-50',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      hoverBorder: 'hover:border-emerald-200',
    },
    {
      icon: Package,
      title: 'Track Order',
      description: 'Check your order status and tracking',
      href: '/support/warranty',
      bgColor: 'bg-blue-50',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      hoverBorder: 'hover:border-blue-200',
    },
    {
      icon: Mail,
      title: 'Contact Us',
      description: 'Get in touch with our support team',
      href: '/support/contact',
      bgColor: 'bg-purple-50',
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      hoverBorder: 'hover:border-purple-200',
    },
    {
      icon: HelpCircle,
      title: 'FAQs',
      description: 'Find answers to common questions',
      href: '/support/faq',
      bgColor: 'bg-amber-50',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      hoverBorder: 'hover:border-amber-200',
    },
  ]

  const popularTopics = [
    { icon: Truck, title: 'Shipping Information', href: '/support/faq/shipping' },
    { icon: RotateCcw, title: 'Returns & Exchanges', href: '/support/faq/returns' },
    { icon: Ruler, title: 'Ring Sizing Guide', href: '/support/faq/sizing' },
    { icon: Sparkles, title: 'Jewelry Care Tips', href: '/support/faq/care' },
    { icon: Shield, title: 'Warranty Policy', href: '/support/faq/warranty' },
    { icon: Clock, title: 'Processing Times', href: '/support/faq/processing' },
  ]

  const warrantyBenefits = [
    'Lifetime warranty on all products',
    'Free returns for warranty claims',
    'Fast replacement shipping',
    'No questions asked policy',
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              How can we help you?
            </h1>
            <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
              Welcome to {branding.brandName} Support. Find answers, start a warranty claim, or get in touch with our team.
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for help articles, topics, or questions..."
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className={`group relative rounded-2xl ${action.bgColor} border border-transparent ${action.hoverBorder} p-6 transition-all hover:shadow-lg`}
            >
              <div className={`w-12 h-12 rounded-xl ${action.iconBg} flex items-center justify-center mb-4`}>
                <action.icon className={`w-6 h-6 ${action.iconColor}`} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-gray-700">
                {action.title}
              </h3>
              <p className="text-sm text-gray-500">
                {action.description}
              </p>
              <ChevronRight className="absolute bottom-6 right-6 w-5 h-5 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all" />
            </Link>
          ))}
        </div>
      </section>

      {/* Popular Topics */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Popular Topics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {popularTopics.map((topic) => (
            <Link
              key={topic.title}
              href={topic.href}
              className="group flex items-center gap-4 p-4 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                <topic.icon className="w-5 h-5 text-gray-500 group-hover:text-emerald-600 transition-colors" />
              </div>
              <span className="text-gray-700 group-hover:text-gray-900 transition-colors font-medium">
                {topic.title}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 ml-auto opacity-0 group-hover:opacity-100 transition-all" />
            </Link>
          ))}
        </div>
      </section>

      {/* Warranty Highlight */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div 
          className="relative overflow-hidden rounded-3xl p-8 sm:p-12"
          style={{ backgroundColor: branding.primaryColor + '10' }}
        >
          <div 
            className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-30" 
            style={{ backgroundColor: branding.primaryColor }}
          />
          
          <div className="relative grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div 
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-4"
                style={{ backgroundColor: branding.primaryColor + '20', color: branding.primaryColor }}
              >
                <Shield className="w-4 h-4" />
                Lifetime Warranty
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                We Stand Behind Every Piece
              </h2>
              <p className="text-gray-600 mb-6">
                All {branding.brandName} jewelry comes with our comprehensive lifetime warranty. If your jewelry breaks, tarnishes, or doesn't meet your expectations, we'll make it right.
              </p>
              <Link
                href="/support/warranty"
                className="inline-flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-xl transition-all hover:shadow-lg"
                style={{ backgroundColor: branding.primaryColor }}
              >
                Start Warranty Claim
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="space-y-3">
              {warrantyBenefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <span className="text-gray-700">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="text-center bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Still need help?
          </h2>
          <p className="text-gray-500 mb-6">
            Our support team is available {branding.supportHours}.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/support/contact"
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              Submit a Request
            </Link>
            <button
              onClick={() => {
                const event = new CustomEvent('openChat')
                window.dispatchEvent(event)
              }}
              className="px-6 py-3 text-white font-medium rounded-xl transition-all hover:shadow-lg"
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
