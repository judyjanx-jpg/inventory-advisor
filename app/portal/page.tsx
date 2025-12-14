'use client'

import Link from 'next/link'
import {
  MessageCircle,
  Package,
  RefreshCw,
  HelpCircle,
  Shield,
  ArrowRight,
  Headphones,
  Clock,
  CheckCircle
} from 'lucide-react'

const features = [
  {
    href: '/portal/support',
    icon: MessageCircle,
    title: 'AI Support Chat',
    description: 'Get instant answers to your questions with our AI-powered support assistant.',
    color: 'from-cyan-500 to-blue-500',
  },
  {
    href: '/portal/track',
    icon: Package,
    title: 'Track Package',
    description: 'Track your order status and delivery information in real-time.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    href: '/portal/replacement',
    icon: RefreshCw,
    title: 'Track Replacement',
    description: 'Monitor the status of your replacement order and shipping details.',
    color: 'from-orange-500 to-amber-500',
  },
  {
    href: '/portal/faq',
    icon: HelpCircle,
    title: 'FAQs',
    description: 'Find answers to frequently asked questions about our products and services.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    href: '/portal/warranty',
    icon: Shield,
    title: 'Warranty Claim',
    description: 'Submit a warranty claim for defective or damaged products.',
    color: 'from-red-500 to-rose-500',
  },
]

const stats = [
  { icon: Headphones, value: '24/7', label: 'Support Available' },
  { icon: Clock, value: '< 2 min', label: 'Average Response' },
  { icon: CheckCircle, value: '98%', label: 'Satisfaction Rate' },
]

export default function PortalHomePage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          How can we help you today?
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Welcome to our customer support portal. Get instant help with AI chat, track your orders,
          or submit a warranty claim.
        </p>
      </section>

      {/* Stats */}
      <section className="flex flex-wrap justify-center gap-8">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm">
              <Icon className="w-5 h-5 text-cyan-500" />
              <div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
              </div>
            </div>
          )
        })}
      </section>

      {/* Feature Cards */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature) => {
          const Icon = feature.icon
          return (
            <Link
              key={feature.href}
              href={feature.href}
              className="group relative bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 border border-slate-200 dark:border-slate-700 hover:border-transparent overflow-hidden"
            >
              {/* Gradient Background on Hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <Icon className="w-6 h-6 text-white" />
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                {feature.title}
                <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                {feature.description}
              </p>
            </Link>
          )
        })}
      </section>

      {/* Quick Contact */}
      <section className="bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-2">Need Immediate Assistance?</h2>
        <p className="text-cyan-100 mb-6">
          Our AI support assistant is available 24/7 to help you with any questions.
        </p>
        <Link
          href="/portal/support"
          className="inline-flex items-center gap-2 px-6 py-3 bg-white text-cyan-600 font-semibold rounded-lg hover:bg-cyan-50 transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          Start Chat Now
        </Link>
      </section>
    </div>
  )
}
