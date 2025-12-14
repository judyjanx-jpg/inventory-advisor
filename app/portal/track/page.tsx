'use client'

import { useState } from 'react'
import {
  Package,
  Search,
  Truck,
  CheckCircle,
  Clock,
  MapPin,
  Calendar,
  AlertCircle,
  Loader2,
  ExternalLink
} from 'lucide-react'

interface TrackingResult {
  orderId: string
  orderDate: string
  status: 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned'
  carrier?: string
  trackingNumber?: string
  estimatedDelivery?: string
  deliveredDate?: string
  items: Array<{
    name: string
    quantity: number
    sku: string
  }>
  timeline: Array<{
    status: string
    date: string
    location?: string
  }>
  shippingAddress?: {
    city: string
    state: string
    zip: string
  }
}

const statusConfig = {
  processing: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Processing' },
  shipped: { icon: Package, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Shipped' },
  in_transit: { icon: Truck, color: 'text-cyan-500', bg: 'bg-cyan-50', label: 'In Transit' },
  out_for_delivery: { icon: MapPin, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Out for Delivery' },
  delivered: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: 'Delivered' },
  returned: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Returned' },
}

export default function TrackPackagePage() {
  const [orderNumber, setOrderNumber] = useState('')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<TrackingResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderNumber.trim()) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/portal/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: orderNumber.trim(), email: email.trim() })
      })

      const data = await res.json()

      if (data.success && data.order) {
        setResult(data.order)
      } else {
        setError(data.error || 'Order not found. Please check your order number and try again.')
      }
    } catch (err) {
      setError('Unable to track order. Please try again later.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Package className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Track Your Package</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Enter your order number to see the current status of your delivery
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleTrack} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Order Number *
            </label>
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="e.g., ORD-12345 or 123-4567890-1234567"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email (optional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="For additional verification"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!orderNumber.trim() || isLoading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Tracking...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Track Order
              </>
            )}
          </button>
        </div>
      </form>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700 dark:text-red-400 font-medium">Order Not Found</p>
            <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Tracking Result */}
      {result && (
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Order #{result.orderId}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    Ordered on {result.orderDate}
                  </span>
                </div>
              </div>
              <div className={`px-3 py-1.5 rounded-full ${statusConfig[result.status].bg} flex items-center gap-2`}>
                {(() => {
                  const StatusIcon = statusConfig[result.status].icon
                  return <StatusIcon className={`w-4 h-4 ${statusConfig[result.status].color}`} />
                })()}
                <span className={`text-sm font-medium ${statusConfig[result.status].color}`}>
                  {statusConfig[result.status].label}
                </span>
              </div>
            </div>

            {/* Delivery Info */}
            {result.estimatedDelivery && result.status !== 'delivered' && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 mb-6">
                <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                  Estimated Delivery: {result.estimatedDelivery}
                </p>
                {result.shippingAddress && (
                  <p className="text-emerald-600 dark:text-emerald-300 text-sm mt-1">
                    Shipping to: {result.shippingAddress.city}, {result.shippingAddress.state} {result.shippingAddress.zip}
                  </p>
                )}
              </div>
            )}

            {result.deliveredDate && result.status === 'delivered' && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-6">
                <p className="text-green-700 dark:text-green-400 font-medium flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Delivered on {result.deliveredDate}
                </p>
              </div>
            )}

            {/* Carrier & Tracking */}
            {result.carrier && result.trackingNumber && (
              <div className="flex items-center justify-between py-3 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Carrier</p>
                  <p className="font-medium text-slate-700 dark:text-slate-200">{result.carrier}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Tracking Number</p>
                  <a
                    href={`https://www.google.com/search?q=${result.carrier}+tracking+${result.trackingNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    {result.trackingNumber}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Tracking History</h3>
            <div className="space-y-4">
              {result.timeline.map((event, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    {index < result.timeline.length - 1 && (
                      <div className="w-0.5 h-full bg-slate-200 dark:bg-slate-700 mt-1" />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className={`font-medium ${index === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {event.status}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{event.date}</p>
                    {event.location && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">{event.location}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Items in This Order</h3>
            <div className="space-y-3">
              {result.items.map((item, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{item.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">SKU: {item.sku}</p>
                  </div>
                  <span className="text-slate-600 dark:text-slate-300">Qty: {item.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
