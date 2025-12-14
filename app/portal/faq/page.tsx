'use client'

import { useState } from 'react'
import {
  HelpCircle,
  ChevronDown,
  Search,
  Package,
  RefreshCw,
  CreditCard,
  Truck,
  Shield,
  MessageCircle
} from 'lucide-react'
import Link from 'next/link'

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
      {
        question: 'How do I track my order?',
        answer: 'You can track your order using the "Track Package" feature in our portal. Simply enter your order number (found in your confirmation email) and you\'ll see real-time tracking information including carrier details and estimated delivery date.'
      },
      {
        question: 'How long does shipping take?',
        answer: 'Standard shipping typically takes 3-5 business days within the continental US. Expedited shipping (2-day) and overnight options are available at checkout. International orders may take 7-14 business days depending on the destination.'
      },
      {
        question: 'Can I change my shipping address after ordering?',
        answer: 'If your order hasn\'t shipped yet, please contact our support team immediately and we\'ll try to update the address. Once an order has shipped, we cannot change the delivery address, but you may be able to redirect the package through the carrier\'s website.'
      },
      {
        question: 'What if my package shows delivered but I haven\'t received it?',
        answer: 'First, check around your property and with neighbors. Packages are sometimes left in safe places. If you still can\'t find it after 48 hours, contact our support team with your order number and we\'ll investigate with the carrier.'
      },
    ]
  },
  {
    id: 'returns',
    title: 'Returns & Replacements',
    icon: RefreshCw,
    color: 'from-orange-500 to-amber-500',
    faqs: [
      {
        question: 'What is your return policy?',
        answer: 'We offer a 30-day return policy for most items. Products must be in their original packaging and unused condition. Some items like personalized products or intimate goods may not be eligible for return. Return shipping is free for defective items.'
      },
      {
        question: 'How do I request a replacement?',
        answer: 'If you received a defective or damaged item, you can request a replacement through our warranty claim form or by contacting support. We\'ll ship a replacement within 2-3 business days after approval, often before you even return the defective item.'
      },
      {
        question: 'How long does it take to process a return?',
        answer: 'Once we receive your returned item, processing takes 3-5 business days. Refunds are issued to your original payment method and may take an additional 5-10 business days to appear on your statement depending on your bank.'
      },
      {
        question: 'Can I exchange an item for a different size/color?',
        answer: 'Yes! You can request an exchange for a different size or color of the same product. If there\'s a price difference, we\'ll either charge or refund the difference. Contact support or use the warranty claim form to initiate an exchange.'
      },
    ]
  },
  {
    id: 'payment',
    title: 'Payment & Billing',
    icon: CreditCard,
    color: 'from-purple-500 to-pink-500',
    faqs: [
      {
        question: 'What payment methods do you accept?',
        answer: 'We accept all major credit cards (Visa, Mastercard, American Express, Discover), PayPal, Amazon Pay, and Apple Pay. For larger orders, we also offer financing options through Affirm.'
      },
      {
        question: 'Is my payment information secure?',
        answer: 'Absolutely. We use industry-standard SSL encryption and never store your full credit card details. Our payment processing is PCI-DSS compliant, ensuring your financial information is always protected.'
      },
      {
        question: 'When will I be charged for my order?',
        answer: 'Your payment method is charged when your order is placed. For pre-orders, you\'ll be charged when the item ships. If an item is backordered, we may place a temporary authorization but won\'t charge until shipment.'
      },
      {
        question: 'How do I get a receipt or invoice?',
        answer: 'A receipt is automatically emailed to you after purchase. You can also access your order history and download invoices by tracking your order in our portal. For tax-exempt purchases, contact support with your exemption certificate.'
      },
    ]
  },
  {
    id: 'shipping',
    title: 'Shipping & Delivery',
    icon: Truck,
    color: 'from-cyan-500 to-blue-500',
    faqs: [
      {
        question: 'Do you offer free shipping?',
        answer: 'Yes! We offer free standard shipping on all orders over $50 within the continental United States. Alaska, Hawaii, and international orders may have additional shipping charges.'
      },
      {
        question: 'Do you ship internationally?',
        answer: 'Yes, we ship to most countries worldwide. International shipping rates are calculated at checkout based on destination and package weight. Please note that international orders may be subject to customs duties and taxes.'
      },
      {
        question: 'Can I request a specific delivery date?',
        answer: 'While we cannot guarantee specific delivery dates, you can add delivery instructions at checkout. For time-sensitive orders, we recommend choosing expedited shipping to ensure timely arrival.'
      },
      {
        question: 'What carriers do you use?',
        answer: 'We partner with major carriers including UPS, FedEx, USPS, and DHL for international shipments. The carrier is selected based on your location and shipping speed preference to ensure the best delivery experience.'
      },
    ]
  },
  {
    id: 'warranty',
    title: 'Warranty & Protection',
    icon: Shield,
    color: 'from-red-500 to-rose-500',
    faqs: [
      {
        question: 'What does the warranty cover?',
        answer: 'Our standard warranty covers manufacturing defects and material failures under normal use. This includes things like broken components, faulty electronics, or premature wear. It does not cover damage from misuse, accidents, or normal wear and tear.'
      },
      {
        question: 'How long is the warranty period?',
        answer: 'Most electronic products come with a 1-year manufacturer warranty. Furniture and home goods have a 2-year warranty. Some premium products may have extended warranty options available for purchase.'
      },
      {
        question: 'How do I file a warranty claim?',
        answer: 'You can file a warranty claim through our portal using the "Warranty Claim" form. You\'ll need your order number, a description of the issue, and photos if applicable. Our team typically responds within 1-2 business days.'
      },
      {
        question: 'Do I need to keep the original packaging for warranty?',
        answer: 'While keeping the original packaging is recommended, it\'s not required for warranty claims. However, you will need proof of purchase (order confirmation email or receipt) to validate your warranty.'
      },
    ]
  },
]

export default function FAQPage() {
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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <HelpCircle className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Frequently Asked Questions</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Find answers to common questions about our products and services
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for answers..."
          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none"
        />
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            !activeCategory
              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          All Topics
        </button>
        {faqCategories.map(category => (
          <button
            key={category.id}
            onClick={() => setActiveCategory(activeCategory === category.id ? null : category.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
              activeCategory === category.id
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <category.icon className="w-4 h-4" />
            {category.title}
          </button>
        ))}
      </div>

      {/* FAQ Categories */}
      <div className="space-y-8">
        {filteredCategories.map(category => (
          <div key={category.id} className="space-y-4">
            {/* Category Header */}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${category.color} flex items-center justify-center`}>
                <category.icon className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{category.title}</h2>
            </div>

            {/* FAQ Items */}
            <div className="space-y-3">
              {category.faqs.map((faq, index) => {
                const itemId = `${category.id}-${index}`
                const isExpanded = expandedItems.has(itemId)

                return (
                  <div
                    key={itemId}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleItem(itemId)}
                      className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <span className="font-medium text-slate-900 dark:text-white pr-4">{faq.question}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-4">
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{faq.answer}</p>
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
          <HelpCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No results found</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Try different keywords or contact our support team
          </p>
        </div>
      )}

      {/* Still Need Help */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-8 text-center text-white">
        <h2 className="text-2xl font-bold mb-2">Still Have Questions?</h2>
        <p className="text-purple-100 mb-6">
          Our AI support assistant is available 24/7 to help with any questions not covered here.
        </p>
        <Link
          href="/portal/support"
          className="inline-flex items-center gap-2 px-6 py-3 bg-white text-purple-600 font-semibold rounded-lg hover:bg-purple-50 transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          Chat with Support
        </Link>
      </div>
    </div>
  )
}
