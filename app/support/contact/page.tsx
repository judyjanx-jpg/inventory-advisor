'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useBranding } from '@/contexts/BrandingContext'
import { 
  Mail, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ArrowLeft,
  MessageSquare,
  Package,
  Shield,
  HelpCircle
} from 'lucide-react'

export default function ContactPage() {
  const branding = useBranding()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    orderId: '',
    category: 'OTHER',
    subject: '',
    message: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)

  const categories = [
    { value: 'ORDER', label: 'Order Issue', icon: Package },
    { value: 'WARRANTY', label: 'Warranty/Returns', icon: Shield },
    { value: 'PRODUCT', label: 'Product Question', icon: HelpCircle },
    { value: 'OTHER', label: 'Other', icon: MessageSquare },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.email || !formData.subject || !formData.message) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Unable to submit. Please try again.')
        return
      }

      setTicketNumber(data.ticketNumber)
      setSuccess(true)
    } catch (err) {
      setError('Unable to submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div 
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg"
          style={{ backgroundColor: branding.primaryColor }}
        >
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Message Sent!</h1>
        <p className="text-gray-500 mb-8">
          We've received your message and will get back to you within 24 hours.
        </p>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-8 text-left shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <span className="text-gray-500">Ticket Number</span>
            <span className="text-gray-900 font-mono font-semibold">{ticketNumber}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Subject</span>
            <span className="text-gray-900">{formData.subject}</span>
          </div>
        </div>

        <Link
          href="/support"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Support
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link
        href="/support"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Support
      </Link>

      <div className="text-center mb-10">
        <div 
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
          style={{ backgroundColor: branding.primaryColor }}
        >
          <Mail className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Contact Us</h1>
        <p className="text-gray-500">
          Have a question or need help? Fill out the form below and we'll get back to you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Category Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            What can we help you with?
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setFormData({ ...formData, category: cat.value })}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  formData.category === cat.value
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <cat.icon className={`w-5 h-5 mb-2 ${
                  formData.category === cat.value ? 'text-emerald-600' : 'text-gray-400'
                }`} />
                <span className={`text-sm font-medium ${
                  formData.category === cat.value ? 'text-emerald-700' : 'text-gray-600'
                }`}>
                  {cat.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Order Number (if applicable)
          </label>
          <input
            type="text"
            value={formData.orderId}
            onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            placeholder="e.g., 111-1234567-1234567"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            required
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            placeholder="Brief description of your issue"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            required
            rows={5}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
            placeholder="Please describe your issue or question in detail..."
          />
        </div>

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: branding.primaryColor }}
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Send Message
            </>
          )}
        </button>
      </form>

      <p className="text-center text-sm text-gray-400 mt-6">
        We typically respond within 24 hours during business days.
      </p>
    </div>
  )
}
