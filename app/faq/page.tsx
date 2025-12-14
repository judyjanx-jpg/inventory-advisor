'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageCircle,
  Package,
  HelpCircle,
  Shield,
  Menu,
  X,
  ChevronDown,
  Search,
  RefreshCw,
  CreditCard,
  Truck
} from 'lucide-react'

const navItems = [
  { href: '/support', label: 'Support Chat', icon: MessageCircle },
  { href: '/track', label: 'Track Package', icon: Package },
  { href: '/faq', label: 'FAQs', icon: HelpCircle },
  { href: '/warranty', label: 'Warranty Claim', icon: Shield },
]

interface FAQ {
  question: string
  answer: string
}

interface FAQCategory {
  id: string
  title: string
  icon: React.ElementType
  color: string
  faqs: FAQ[]
}

const faqCategories: FAQCategory[] = [
  {
    id: 'orders',
    title: 'Orders & Tracking',
    icon: Package,
    color: 'from-emerald-500 to-teal-500',
    faqs: [
      { question: 'How do I track my order?', answer: 'You can track your order using the "Track Package" feature. Simply enter your order number (found in your confirmation email) and you\'ll see real-time tracking information.' },
      { question: 'How long does shipping take?', answer: 'Standard shipping typically takes 3-5 business days within the continental US. Expedited shipping (2-day) and overnight options are available at checkout.' },
      { question: 'Can I change my shipping address after ordering?', answer: 'If your order hasn\'t shipped yet, please contact our support team immediately. Once an order has shipped, we cannot change the delivery address.' },
      { question: 'What if my package shows delivered but I haven\'t received it?', answer: 'First, check around your property and with neighbors. If you still can\'t find it after 48 hours, contact our support team with your order number.' },
    ]
  },
  {
    id: 'returns',
    title: 'Returns & Replacements',
    icon: RefreshCw,
    color: 'from-orange-500 to-amber-500',
    faqs: [
      { question: 'What is your return policy?', answer: 'We offer a 30-day return policy for most items. Products must be in their original packaging and unused condition. Return shipping is free for defective items.' },
      { question: 'How do I request a replacement?', answer: 'If you received a defective or damaged item, you can request a replacement through our warranty claim form or by contacting support.' },
      { question: 'How long does it take to process a return?', answer: 'Once we receive your returned item, processing takes 3-5 business days. Refunds may take an additional 5-10 business days to appear on your statement.' },
      { question: 'Can I exchange an item for a different size/color?', answer: 'Yes! You can request an exchange for a different size or color of the same product. Contact support or use the warranty claim form.' },
    ]
  },
  {
    id: 'payment',
    title: 'Payment & Billing',
    icon: CreditCard,
    color: 'from-purple-500 to-pink-500',
    faqs: [
      { question: 'What payment methods do you accept?', answer: 'We accept all major credit cards (Visa, Mastercard, American Express, Discover), PayPal, Amazon Pay, and Apple Pay.' },
      { question: 'Is my payment information secure?', answer: 'Absolutely. We use industry-standard SSL encryption and never store your full credit card details. Our payment processing is PCI-DSS compliant.' },
      { question: 'When will I be charged for my order?', answer: 'Your payment method is charged when your order is placed. For pre-orders, you\'ll be charged when the item ships.' },
      { question: 'How do I get a receipt or invoice?', answer: 'A receipt is automatically emailed to you after purchase. You can also access your order history by tracking your order in our portal.' },
    ]
  },
  {
    id: 'shipping',
    title: 'Shipping & Delivery',
    icon: Truck,
    color: 'from-cyan-500 to-blue-500',
    faqs: [
      { question: 'Do you offer free shipping?', answer: 'Yes! We offer free standard shipping on all orders over $50 within the continental United States.' },
      { question: 'Do you ship internationally?', answer: 'Yes, we ship to most countries worldwide. International shipping rates are calculated at checkout based on destination and package weight.' },
      { question: 'Can I request a specific delivery date?', answer: 'While we cannot guarantee specific delivery dates, you can add delivery instructions at checkout. For time-sensitive orders, we recommend expedited shipping.' },
      { question: 'What carriers do you use?', answer: 'We partner with major carriers including UPS, FedEx, USPS, and DHL for international shipments.' },
    ]
  },
  {
    id: 'warranty',
    title: 'Warranty & Protection',
    icon: Shield,
    color: 'from-red-500 to-rose-500',
    faqs: [
      { question: 'What does the warranty cover?', answer: 'Our standard warranty covers manufacturing defects and material failures under normal use. It does not cover damage from misuse, accidents, or normal wear and tear.' },
      { question: 'How long is the warranty period?', answer: 'Most electronic products come with a 1-year manufacturer warranty. Furniture and home goods have a 2-year warranty.' },
      { question: 'How do I file a warranty claim?', answer: 'You can file a warranty claim through our portal using the "Warranty Claim" form. You\'ll need your order number and a description of the issue.' },
      { question: 'Do I need to keep the original packaging for warranty?', answer: 'While keeping the original packaging is recommended, it\'s not required. However, you will need proof of purchase (order confirmation email or receipt).' },
    ]
  },
]

export default function FAQPage() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const toggleItem = (id: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedItems(newExpanded)
  }

  const filteredCategories = faqCategories.map(category => ({
    ...category,
    faqs: category.faqs.filter(faq =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category =>
    activeCategory ? category.id === activeCategory : category.faqs.length > 0 || !searchQuery
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/support" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">CS</span>
              </div>
              <span className="font-semibold text-slate-900">Customer Support</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-100'
                    }`}>
                    <Icon className="w-4 h-4" />{item.label}
                  </Link>
                )
              })}
            </nav>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <nav className="px-4 py-2 space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-cyan-50 text-cyan-700' : 'text-slate-600 hover:bg-slate-100'
                    }`}>
                    <Icon className="w-4 h-4" />{item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HelpCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Frequently Asked Questions</h1>
          <p className="text-slate-600 mt-2">Find answers to common questions about our products and services</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for answers..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none" />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 justify-center">
          <button onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              !activeCategory ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            All Topics
          </button>
          {faqCategories.map(category => (
            <button key={category.id} onClick={() => setActiveCategory(activeCategory === category.id ? null : category.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                activeCategory === category.id ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              <category.icon className="w-4 h-4" />{category.title}
            </button>
          ))}
        </div>

        {/* FAQ Categories */}
        <div className="space-y-8">
          {filteredCategories.map(category => (
            <div key={category.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${category.color} flex items-center justify-center`}>
                  <category.icon className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">{category.title}</h2>
              </div>
              <div className="space-y-3">
                {category.faqs.map((faq, index) => {
                  const itemId = `${category.id}-${index}`
                  const isExpanded = expandedItems.has(itemId)
                  return (
                    <div key={itemId} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <button onClick={() => toggleItem(itemId)}
                        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors">
                        <span className="font-medium text-slate-900 pr-4">{faq.question}</span>
                        <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isExpanded && (
                        <div className="px-5 pb-4">
                          <p className="text-slate-600 leading-relaxed">{faq.answer}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* No Results */}
        {searchQuery && filteredCategories.every(c => c.faqs.length === 0) && (
          <div className="text-center py-12">
            <HelpCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-700">No results found</h3>
            <p className="text-slate-500 mt-1">Try different keywords or contact our support team</p>
          </div>
        )}

        {/* Still Need Help */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-8 text-center text-white">
          <h2 className="text-2xl font-bold mb-2">Still Have Questions?</h2>
          <p className="text-purple-100 mb-6">Our AI support assistant is available 24/7 to help with any questions not covered here.</p>
          <Link href="/support"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-purple-600 font-semibold rounded-lg hover:bg-purple-50 transition-colors">
            <MessageCircle className="w-5 h-5" />Chat with Support
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <p>&copy; {new Date().getFullYear()} Customer Support Portal. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/faq" className="hover:text-slate-700">FAQs</Link>
              <Link href="/warranty" className="hover:text-slate-700">Warranty</Link>
              <Link href="/support" className="hover:text-slate-700">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
