'use client'

import { useState } from 'react'
import Link from 'next/link'
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

  const quickActions = [
    {
      icon: Shield,
      title: 'Warranty Claim',
      description: 'Start a warranty claim for your jewelry',
      href: '/support/warranty',
      color: 'from-emerald-500 to-teal-600',
      shadowColor: 'shadow-emerald-500/20',
    },
    {
      icon: Package,
      title: 'Track Order',
      description: 'Check your order status and tracking',
      href: '/support/warranty',
      color: 'from-blue-500 to-indigo-600',
      shadowColor: 'shadow-blue-500/20',
    },
    {
      icon: Mail,
      title: 'Contact Us',
      description: 'Get in touch with our support team',
      href: '/support/contact',
      color: 'from-purple-500 to-pink-600',
      shadowColor: 'shadow-purple-500/20',
    },
    {
      icon: HelpCircle,
      title: 'FAQs',
      description: 'Find answers to common questions',
      href: '/support/faq',
      color: 'from-amber-500 to-orange-600',
      shadowColor: 'shadow-amber-500/20',
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
      <section className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, rgba(251, 191, 36, 0.1) 0%, transparent 50%),
                             radial-gradient(circle at 75% 75%, rgba(251, 191, 36, 0.05) 0%, transparent 50%)`
          }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-16 sm:py-24">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
              How can we help you?
            </h1>
            <p className="text-lg text-slate-400 mb-8 max-w-2xl mx-auto">
              Welcome to CHOE Support. Find answers, start a warranty claim, or get in touch with our team.
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for help articles, topics, or questions..."
                  className="w-full pl-12 pr-4 py-4 bg-slate-800/80 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-lg backdrop-blur-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="max-w-6xl mx-auto px-4 -mt-8 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className={`group relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6 hover:border-slate-600 transition-all hover:scale-[1.02] backdrop-blur-sm shadow-xl ${action.shadowColor}`}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4 shadow-lg`}>
                <action.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-amber-400 transition-colors">
                {action.title}
              </h3>
              <p className="text-sm text-slate-400">
                {action.description}
              </p>
              <ChevronRight className="absolute bottom-6 right-6 w-5 h-5 text-slate-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
            </Link>
          ))}
        </div>
      </section>

      {/* Popular Topics */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-white mb-8">Popular Topics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {popularTopics.map((topic) => (
            <Link
              key={topic.title}
              href={topic.href}
              className="group flex items-center gap-4 p-4 bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 rounded-xl transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                <topic.icon className="w-5 h-5 text-slate-400 group-hover:text-amber-400 transition-colors" />
              </div>
              <span className="text-slate-300 group-hover:text-white transition-colors font-medium">
                {topic.title}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 ml-auto opacity-0 group-hover:opacity-100 transition-all" />
            </Link>
          ))}
        </div>
      </section>

      {/* Warranty Highlight */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-8 sm:p-12">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-amber-600/10 rounded-full blur-3xl" />
          
          <div className="relative grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 rounded-full text-amber-400 text-sm font-medium mb-4">
                <Shield className="w-4 h-4" />
                Lifetime Warranty
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">
                We Stand Behind Every Piece
              </h2>
              <p className="text-slate-400 mb-6">
                All CHOE jewelry comes with our comprehensive lifetime warranty. If your jewelry breaks, tarnishes, or doesn't meet your expectations, we'll make it right.
              </p>
              <Link
                href="/support/warranty"
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-xl transition-colors"
              >
                Start Warranty Claim
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            
            <div className="space-y-3">
              {warrantyBenefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <span className="text-slate-300">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="text-center bg-slate-800/30 border border-slate-700/50 rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-white mb-2">
            Still need help?
          </h2>
          <p className="text-slate-400 mb-6">
            Our support team is available Monday through Friday, 9am to 5pm EST.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/support/contact"
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors"
            >
              Submit a Request
            </Link>
            <button
              onClick={() => {
                // Open chat widget
                const event = new CustomEvent('openChat')
                window.dispatchEvent(event)
              }}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-xl transition-colors"
            >
              Chat with Us
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

