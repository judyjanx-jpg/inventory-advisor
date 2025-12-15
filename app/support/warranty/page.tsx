'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useBranding } from '@/contexts/BrandingContext'
import { 
  Shield, 
  Search, 
  Package, 
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  RefreshCw,
  DollarSign,
  MapPin,
} from 'lucide-react'

interface OrderItem {
  sku: string
  name: string
  quantity: number
  price: number
  imageUrl?: string
  isWarrantied: boolean
}

interface OrderDetails {
  orderId: string
  purchaseDate: string
  deliveryDate?: string
  status: string
  items: OrderItem[]
  shippingAddress: { city: string; state: string; zip: string }
  hasExistingClaim: boolean
}

type Step = 'lookup' | 'select' | 'choose_option' | 'confirm_address' | 'submitted'

export default function WarrantyPage() {
  const branding = useBranding()
  const [step, setStep] = useState<Step>('lookup')
  const [orderId, setOrderId] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null)
  const [claimType, setClaimType] = useState<'REFUND' | 'REPLACEMENT' | null>(null)
  const [address, setAddress] = useState({ name: '', email: '', street1: '', street2: '', city: '', state: '', zip: '' })
  const [claimId, setClaimId] = useState<string | null>(null)

  const lookupOrder = async () => {
    if (!orderId.trim() || !zipCode.trim()) {
      setError('Please enter both your order number and ZIP code')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/support/order-lookup?orderId=${encodeURIComponent(orderId.trim())}&zip=${encodeURIComponent(zipCode.trim())}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Order not found. Please check your order number and ZIP code.')
        return
      }
      setOrder(data.order)
      if (data.order.shippingAddress) {
        setAddress(prev => ({ ...prev, city: data.order.shippingAddress.city || '', state: data.order.shippingAddress.state || '', zip: data.order.shippingAddress.zip || zipCode }))
      }
      setStep('select')
    } catch (err) {
      setError('Unable to look up order. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const submitClaim = async () => {
    if (!selectedItem || !claimType || !order) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/support/warranty/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.orderId, sku: selectedItem.sku, productName: selectedItem.name, claimType, customerEmail: address.email, shippingAddress: address }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Unable to submit claim. Please try again.')
        return
      }
      setClaimId(data.claimNumber)
      setStep('submitted')
    } catch (err) {
      setError('Unable to submit claim. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const renderLookupStep = () => (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ backgroundColor: branding.primaryColor }}>
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Warranty Claim</h1>
        <p className="text-gray-500">Start by looking up your order. You'll need your Amazon order number and the ZIP code it was shipped to.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amazon Order Number</label>
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="e.g., 111-1234567-1234567"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          />
          <p className="text-xs text-gray-400 mt-1">Find this in your Amazon order confirmation email or Your Orders page</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Shipping ZIP Code</label>
          <input
            type="text"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            placeholder="e.g., 10001"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            maxLength={10}
          />
        </div>

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          onClick={lookupOrder}
          disabled={loading}
          className="w-full py-3 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:bg-gray-300"
          style={{ backgroundColor: loading ? undefined : branding.primaryColor }}
        >
          {loading ? <><Loader2 className="w-5 h-5 animate-spin" />Looking up order...</> : <><Search className="w-5 h-5" />Find My Order</>}
        </button>
      </div>

      <div className="mt-8 p-4 rounded-xl" style={{ backgroundColor: branding.primaryColor + '10' }}>
        <h3 className="text-sm font-medium mb-2" style={{ color: branding.primaryColor }}>Our Warranty Promise</h3>
        <ul className="space-y-1 text-sm text-gray-600">
          <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Lifetime warranty on all jewelry</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Free prepaid return shipping</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />Choice of refund or replacement</li>
        </ul>
      </div>
    </div>
  )

  const renderSelectStep = () => (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => { setStep('lookup'); setOrder(null); setError(null); }} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />Back to order lookup
      </button>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-gray-100 bg-gray-50">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Order</p>
              <p className="text-xl font-semibold text-gray-900">{order?.orderId}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Purchased</p>
              <p className="text-gray-900">{order?.purchaseDate}</p>
            </div>
          </div>
        </div>

        {order?.hasExistingClaim && (
          <div className="p-4 bg-amber-50 border-b border-amber-100">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-700 font-medium">Existing warranty claim found</p>
                <p className="text-sm text-gray-600 mt-1">You've already submitted a warranty claim for this order. <Link href="/support/contact" className="text-amber-600 hover:underline">Contact us</Link> if you need additional help.</p>
              </div>
            </div>
          </div>
        )}

        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Select the item for your warranty claim:</h3>
          <div className="space-y-3">
            {order?.items.map((item) => (
              <button
                key={item.sku}
                onClick={() => { setSelectedItem(item); setStep('choose_option'); }}
                disabled={!item.isWarrantied || order.hasExistingClaim}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                  item.isWarrantied && !order.hasExistingClaim ? 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow-md' : 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Package className="w-8 h-8 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium truncate">{item.name}</p>
                  <p className="text-sm text-gray-500">Qty: {item.quantity} · ${item.price.toFixed(2)}</p>
                  {!item.isWarrantied && <p className="text-xs text-amber-600 mt-1">Not eligible for warranty</p>}
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  const renderChooseOptionStep = () => (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => { setStep('select'); setClaimType(null); }} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />Back to item selection
      </button>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
          <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <div>
            <p className="text-gray-900 font-medium">{selectedItem?.name}</p>
            <p className="text-sm text-gray-500">From order {order?.orderId}</p>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-4">What would you like us to do?</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => { setClaimType('REFUND'); setStep('confirm_address'); }}
            className={`p-6 rounded-xl border-2 text-left transition-all ${claimType === 'REFUND' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Full Refund</h4>
            <p className="text-sm text-gray-500">Return the item and receive a full refund to your original payment method.</p>
          </button>

          <button
            onClick={() => { setClaimType('REPLACEMENT'); setStep('confirm_address'); }}
            className={`p-6 rounded-xl border-2 text-left transition-all ${claimType === 'REPLACEMENT' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
          >
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
              <RefreshCw className="w-6 h-6 text-blue-600" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Replacement</h4>
            <p className="text-sm text-gray-500">Return the item and we'll send you a brand new replacement free of charge.</p>
          </button>
        </div>
      </div>

      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">How it works:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>We'll email you a prepaid return shipping label</li>
          <li>Ship the item back using the provided label</li>
          <li>Once received, we'll process your {claimType === 'REFUND' ? 'refund' : 'replacement'}</li>
        </ol>
      </div>
    </div>
  )

  const renderConfirmAddressStep = () => (
    <div className="max-w-xl mx-auto">
      <button onClick={() => setStep('choose_option')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />Back
      </button>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <MapPin className="w-5 h-5" style={{ color: branding.primaryColor }} />
          <h3 className="text-lg font-semibold text-gray-900">Confirm Your Address</h3>
        </div>

        <p className="text-sm text-gray-500 mb-6">
          {claimType === 'REFUND' ? "We'll send the return label to this address." : "We'll send your replacement to this address."}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
            <input type="text" value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
            <input type="email" value={address.email} onChange={(e) => setAddress({ ...address, email: e.target.value })} placeholder="you@example.com" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" />
            <p className="text-xs text-gray-400 mt-1">We'll send your return label and claim updates to this email</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
            <input type="text" value={address.street1} onChange={(e) => setAddress({ ...address, street1: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Apt, Suite, etc. (optional)</label>
            <input type="text" value={address.street2} onChange={(e) => setAddress({ ...address, street2: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
              <input type="text" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
              <input type="text" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" maxLength={2} />
            </div>
          </div>
          <div className="w-1/2">
            <label className="block text-sm font-medium text-gray-700 mb-2">ZIP Code</label>
            <input type="text" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500" maxLength={10} />
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          onClick={submitClaim}
          disabled={loading || !address.name || !address.email || !address.street1 || !address.city || !address.state || !address.zip}
          className="w-full mt-6 py-3 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:bg-gray-300"
          style={{ backgroundColor: loading || !address.name || !address.email || !address.street1 || !address.city || !address.state || !address.zip ? undefined : branding.primaryColor }}
        >
          {loading ? <><Loader2 className="w-5 h-5 animate-spin" />Submitting claim...</> : <><CheckCircle2 className="w-5 h-5" />Submit Warranty Claim</>}
        </button>
      </div>
    </div>
  )

  const renderSubmittedStep = () => (
    <div className="max-w-xl mx-auto text-center">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg" style={{ backgroundColor: branding.primaryColor }}>
        <CheckCircle2 className="w-10 h-10 text-white" />
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">Claim Submitted!</h1>
      <p className="text-gray-500 mb-8">Your warranty claim has been received. We'll email you a prepaid return label within 24 hours.</p>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 text-left shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
          <span className="text-gray-500">Claim Number</span>
          <span className="text-gray-900 font-mono font-semibold">{claimId}</span>
        </div>
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
          <span className="text-gray-500">Order</span>
          <span className="text-gray-900">{order?.orderId}</span>
        </div>
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
          <span className="text-gray-500">Item</span>
          <span className="text-gray-900">{selectedItem?.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Type</span>
          <span className={`px-2 py-1 rounded-lg text-sm font-medium ${claimType === 'REFUND' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
            {claimType === 'REFUND' ? 'Full Refund' : 'Replacement'}
          </span>
        </div>
      </div>

      <div className="p-4 rounded-xl text-left mb-6" style={{ backgroundColor: branding.primaryColor + '10' }}>
        <h3 className="text-sm font-medium mb-2" style={{ color: branding.primaryColor }}>Next Steps</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
          <li>Check your email for the prepaid return label</li>
          <li>Package the item securely</li>
          <li>Drop it off at any USPS location</li>
          <li>We'll process your {claimType === 'REFUND' ? 'refund' : 'replacement'} once received</li>
        </ol>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Link href={`/support/warranty/${claimId}`} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors text-center">
          Track Claim Status
        </Link>
        <Link href="/support" className="flex-1 py-3 text-white font-medium rounded-xl transition-colors text-center" style={{ backgroundColor: branding.primaryColor }}>
          Back to Support
        </Link>
      </div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {step !== 'submitted' && (
        <div className="max-w-2xl mx-auto mb-12">
          <div className="flex items-center justify-between">
            {['Find Order', 'Select Item', 'Choose Option', 'Confirm'].map((label, i) => {
              const stepIndex = ['lookup', 'select', 'choose_option', 'confirm_address'].indexOf(step)
              const isActive = i <= stepIndex
              const isCurrent = i === stepIndex
              return (
                <div key={label} className="flex items-center">
                  <div className={`flex items-center gap-2 ${isActive ? '' : 'text-gray-300'}`} style={isActive ? { color: branding.primaryColor } : undefined}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${isCurrent ? 'text-white' : isActive ? '' : 'bg-gray-100 text-gray-400'}`} style={isCurrent ? { backgroundColor: branding.primaryColor } : isActive ? { backgroundColor: branding.primaryColor + '20' } : undefined}>
                      {i + 1}
                    </div>
                    <span className="hidden sm:inline text-sm font-medium">{label}</span>
                  </div>
                  {i < 3 && <div className={`w-8 sm:w-16 h-0.5 mx-2 ${isActive && i < stepIndex ? '' : 'bg-gray-200'}`} style={isActive && i < stepIndex ? { backgroundColor: branding.primaryColor } : undefined} />}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {step === 'lookup' && renderLookupStep()}
      {step === 'select' && renderSelectStep()}
      {step === 'choose_option' && renderChooseOptionStep()}
      {step === 'confirm_address' && renderConfirmAddressStep()}
      {step === 'submitted' && renderSubmittedStep()}
    </div>
  )
}
