'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  Search, 
  ChevronDown, 
  ChevronRight, 
  ArrowLeft,
  Truck,
  RotateCcw,
  Ruler,
  Sparkles,
  Shield,
  Clock,
  HelpCircle
} from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
}

interface FAQCategory {
  id: string
  title: string
  icon: React.ElementType
  items: FAQItem[]
}

const faqData: FAQCategory[] = [
  {
    id: 'shipping',
    title: 'Shipping',
    icon: Truck,
    items: [
      {
        question: 'How long does shipping take?',
        answer: 'Standard shipping typically takes 3-5 business days within the continental US. Expedited shipping options are available at checkout for faster delivery.'
      },
      {
        question: 'Do you ship internationally?',
        answer: 'Currently, we ship to the United States and Canada. International shipping rates and delivery times vary by location.'
      },
      {
        question: 'How can I track my order?',
        answer: 'Once your order ships, you\'ll receive a confirmation email with tracking information. You can also check your order status on Amazon\'s "Your Orders" page.'
      },
      {
        question: 'What carriers do you use?',
        answer: 'We primarily use USPS for standard shipping and UPS/FedEx for expedited orders. All shipments include tracking and insurance.'
      },
    ]
  },
  {
    id: 'returns',
    title: 'Returns & Exchanges',
    icon: RotateCcw,
    items: [
      {
        question: 'What is your return policy?',
        answer: 'We offer a 30-day return policy for unused items in original packaging. For warranty claims, we offer lifetime coverage on all jewelry.'
      },
      {
        question: 'How do I start a return?',
        answer: 'For Amazon purchases, you can initiate a return through Amazon\'s return center or contact us directly. For warranty claims, use our warranty portal.'
      },
      {
        question: 'How long do refunds take?',
        answer: 'Once we receive your return, refunds are typically processed within 3-5 business days. It may take an additional 5-10 days for the refund to appear on your statement.'
      },
      {
        question: 'Can I exchange for a different size?',
        answer: 'Yes! Contact us and we\'ll help arrange an exchange for a different size at no additional cost.'
      },
    ]
  },
  {
    id: 'sizing',
    title: 'Sizing Guide',
    icon: Ruler,
    items: [
      {
        question: 'How do I find my ring size?',
        answer: 'You can use a ring sizer tool, measure an existing ring that fits, or use our printable ring size guide. For the most accurate measurement, visit a local jeweler.'
      },
      {
        question: 'What if I order the wrong size?',
        answer: 'No worries! We offer free size exchanges. Simply contact us and we\'ll send you the correct size once you return the original.'
      },
      {
        question: 'How do I measure for a necklace?',
        answer: 'Use a flexible measuring tape around your neck where you want the necklace to sit. Add 2-4 inches to your neck measurement for a comfortable fit.'
      },
      {
        question: 'Do your rings run true to size?',
        answer: 'Our rings are designed to US standard sizing. If you\'re between sizes, we recommend going up to the larger size for comfort.'
      },
    ]
  },
  {
    id: 'care',
    title: 'Jewelry Care',
    icon: Sparkles,
    items: [
      {
        question: 'How should I clean my jewelry?',
        answer: 'Clean your jewelry with a soft, lint-free cloth. For deeper cleaning, use mild soap and warm water, then dry thoroughly. Avoid harsh chemicals and abrasives.'
      },
      {
        question: 'Can I wear my jewelry in water?',
        answer: 'We recommend removing jewelry before swimming, showering, or exercising. Chlorine, salt water, and sweat can affect the finish over time.'
      },
      {
        question: 'How should I store my jewelry?',
        answer: 'Store pieces separately in a cool, dry place to prevent scratching. Use the pouch or box provided, or a jewelry organizer with individual compartments.'
      },
      {
        question: 'What causes tarnishing?',
        answer: 'Exposure to air, moisture, chemicals, and oils from skin can cause tarnishing. Proper storage and regular cleaning help maintain shine.'
      },
    ]
  },
  {
    id: 'warranty',
    title: 'Warranty',
    icon: Shield,
    items: [
      {
        question: 'What does the warranty cover?',
        answer: 'Our lifetime warranty covers manufacturing defects, tarnishing, and breakage from normal wear. This includes free repairs or replacements.'
      },
      {
        question: 'How do I make a warranty claim?',
        answer: 'Visit our warranty portal, enter your order number and ZIP code, and follow the steps to submit a claim. We\'ll send you a prepaid return label.'
      },
      {
        question: 'Do I need proof of purchase?',
        answer: 'Yes, you\'ll need your Amazon order number to verify your purchase. We can look up orders using the order ID and shipping ZIP code.'
      },
      {
        question: 'What\'s not covered by warranty?',
        answer: 'The warranty doesn\'t cover damage from misuse, accidents, improper care, or normal wear of plating on fashion jewelry. It also doesn\'t cover lost items.'
      },
    ]
  },
  {
    id: 'processing',
    title: 'Order Processing',
    icon: Clock,
    items: [
      {
        question: 'How long does order processing take?',
        answer: 'Orders are typically processed within 1-2 business days. You\'ll receive a shipping confirmation email once your order ships.'
      },
      {
        question: 'Can I modify or cancel my order?',
        answer: 'If your order hasn\'t shipped yet, contact us immediately and we\'ll do our best to make changes. Once shipped, you\'ll need to wait for delivery and then return if needed.'
      },
      {
        question: 'Why hasn\'t my order shipped yet?',
        answer: 'Orders may be delayed if items are out of stock or if there\'s an issue with the shipping address. Check your email for any communication from us.'
      },
      {
        question: 'Do you offer gift wrapping?',
        answer: 'All orders come in elegant packaging suitable for gifting. We don\'t currently offer additional gift wrapping services.'
      },
    ]
  },
]

export default function FAQPage() {
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<string | null>('shipping')
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  // Initialize search from URL query parameter
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setSearchQuery(q)
      setExpandedCategory(null) // Show all matching results
    }
  }, [searchParams])

  const toggleItem = (categoryId: string, index: number) => {
    const key = `${categoryId}-${index}`
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedItems(newExpanded)
  }

  // Filter FAQ items based on search
  const filteredData = searchQuery.trim() 
    ? faqData.map(category => ({
        ...category,
        items: category.items.filter(item => 
          item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.answer.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(category => category.items.length > 0)
    : faqData

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Link
        href="/support"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Support
      </Link>

      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
          <HelpCircle className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Frequently Asked Questions</h1>
        <p className="text-gray-500">
          Find answers to common questions about our products and services.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search FAQs..."
          className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </div>

      {/* Category Navigation */}
      <div className="flex flex-wrap gap-2 mb-8">
        {faqData.map(category => (
          <button
            key={category.id}
            onClick={() => {
              setExpandedCategory(category.id)
              setSearchQuery('')
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              expandedCategory === category.id && !searchQuery
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <category.icon className="w-4 h-4" />
            {category.title}
          </button>
        ))}
      </div>

      {/* FAQ Categories */}
      <div className="space-y-6">
        {filteredData.map(category => (
          <div
            key={category.id}
            className={`bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm ${
              !searchQuery && expandedCategory !== category.id ? 'hidden' : ''
            }`}
          >
            <button
              onClick={() => setExpandedCategory(expandedCategory === category.id ? null : category.id)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <category.icon className="w-5 h-5 text-emerald-500" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{category.title}</h2>
                <span className="text-sm text-gray-400">({category.items.length})</span>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${
                searchQuery || expandedCategory === category.id ? 'rotate-180' : ''
              }`} />
            </button>

            {(searchQuery || expandedCategory === category.id) && (
              <div className="border-t border-gray-100">
                {category.items.map((item, index) => {
                  const isExpanded = expandedItems.has(`${category.id}-${index}`)
                  return (
                    <div key={index} className="border-b border-gray-100 last:border-0">
                      <button
                        onClick={() => toggleItem(category.id, index)}
                        className="w-full flex items-start justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-gray-800 font-medium pr-4">{item.question}</span>
                        <ChevronRight className={`w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`} />
                      </button>
                      {isExpanded && (
                        <div className="px-5 pb-5 -mt-2">
                          <p className="text-gray-600 text-sm leading-relaxed">{item.answer}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredData.length === 0 && searchQuery && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No results found for "{searchQuery}"</p>
          <Link
            href="/support/contact"
            className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700"
          >
            Contact us for help
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Still Need Help */}
      <div className="mt-12 text-center bg-gray-50 border border-gray-200 rounded-2xl p-8">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Still have questions?</h3>
        <p className="text-gray-500 mb-6">
          Can't find what you're looking for? We're here to help.
        </p>
        <Link
          href="/support/contact"
          className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors"
        >
          Contact Support
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

