'use client'

import { useState } from 'react'
import {
  RefreshCw,
  Search,
  Package,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  FileText
} from 'lucide-react'

interface ReplacementResult {
  replacementId: string
  originalOrderId: string
  requestDate: string
  status: 'pending_approval' | 'approved' | 'processing' | 'shipped' | 'delivered' | 'denied'
  reason: string
  newTrackingNumber?: string
  carrier?: string
  estimatedDelivery?: string
  timeline: Array<{
    status: string
    date: string
    note?: string
  }>
  items: Array<{
    name: string
    quantity: number
    sku: string
  }>
}

const statusConfig = {
  pending_approval: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Pending Approval' },
  approved: { icon: CheckCircle, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Approved' },
  processing: { icon: RefreshCw, color: 'text-cyan-500', bg: 'bg-cyan-50', label: 'Processing' },
  shipped: { icon: Truck, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Shipped' },
  delivered: { icon: Package, color: 'text-green-500', bg: 'bg-green-50', label: 'Delivered' },
  denied: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Denied' },
}

export default function ReplacementTrackingPage() {
  const [searchType, setSearchType] = useState<'replacement' | 'order'>('replacement')
  const [searchValue, setSearchValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ReplacementResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchValue.trim()) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/portal/replacement/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [searchType === 'replacement' ? 'replacementId' : 'orderId']: searchValue.trim()
        })
      })

      const data = await res.json()

      if (data.success && data.replacement) {
        setResult(data.replacement)
      } else {
        setError(data.error || 'Replacement request not found.')
      }
    } catch (err) {
      setError('Unable to track replacement. Please try again later.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <RefreshCw className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Track Your Replacement</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Check the status of your replacement order
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleTrack} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="space-y-4">
          {/* Search Type Toggle */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Search By
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSearchType('replacement')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  searchType === 'replacement'
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                Replacement ID
              </button>
              <button
                type="button"
                onClick={() => setSearchType('order')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  searchType === 'order'
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                Original Order ID
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {searchType === 'replacement' ? 'Replacement ID' : 'Original Order ID'}
            </label>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={searchType === 'replacement' ? 'e.g., RPL-12345' : 'e.g., ORD-12345'}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={!searchValue.trim() || isLoading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-amber-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Track Replacement
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
            <p className="text-red-700 dark:text-red-400 font-medium">Not Found</p>
            <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Replacement Result */}
      {result && (
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Replacement #{result.replacementId}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Original Order: {result.originalOrderId}
                </p>
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

            {/* Reason */}
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Reason for Replacement</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{result.reason}</p>
                </div>
              </div>
            </div>

            {/* Shipping Info (if shipped) */}
            {result.status === 'shipped' && result.newTrackingNumber && (
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 mb-6">
                <p className="text-purple-700 dark:text-purple-400 font-medium">
                  Your replacement has been shipped!
                </p>
                <div className="flex items-center gap-4 mt-2">
                  {result.carrier && (
                    <span className="text-sm text-purple-600 dark:text-purple-300">
                      Carrier: {result.carrier}
                    </span>
                  )}
                  <span className="text-sm text-purple-600 dark:text-purple-300">
                    Tracking: {result.newTrackingNumber}
                  </span>
                </div>
                {result.estimatedDelivery && (
                  <p className="text-sm text-purple-600 dark:text-purple-300 mt-1">
                    Est. Delivery: {result.estimatedDelivery}
                  </p>
                )}
              </div>
            )}

            {/* Delivered Info */}
            {result.status === 'delivered' && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-6">
                <p className="text-green-700 dark:text-green-400 font-medium flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Replacement Delivered Successfully
                </p>
              </div>
            )}

            {/* Denied Info */}
            {result.status === 'denied' && (
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-6">
                <p className="text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Replacement Request Denied
                </p>
                <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                  Please contact support for more information.
                </p>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Replacement Timeline</h3>
            <div className="space-y-4">
              {result.timeline.map((event, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    {index < result.timeline.length - 1 && (
                      <div className="w-0.5 h-full bg-slate-200 dark:bg-slate-700 mt-1" />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className={`font-medium ${index === 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {event.status}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{event.date}</p>
                    {event.note && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 italic">{event.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Replacement Items</h3>
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
