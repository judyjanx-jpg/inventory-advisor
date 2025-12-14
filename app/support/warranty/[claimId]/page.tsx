'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  Shield, 
  Package, 
  Truck, 
  CheckCircle2, 
  Clock, 
  ArrowLeft,
  Download,
  ExternalLink,
  RefreshCw,
  DollarSign,
  AlertCircle,
  Loader2,
  Copy,
  Check
} from 'lucide-react'
import { use } from 'react'

interface TimelineStep {
  status: string
  label: string
  date: string | null
  completed: boolean
  current: boolean
}

interface ClaimDetails {
  claimNumber: string
  orderId: string
  claimType: 'REFUND' | 'REPLACEMENT'
  status: string
  productName: string | null
  createdAt: string
  returnTracking: string | null
  returnCarrier: string | null
  returnLabelUrl: string | null
  returnShippedAt: string | null
  returnDeliveredAt: string | null
  replacementTracking: string | null
  replacementShippedAt: string | null
  refundAmount: number | null
  refundProcessedAt: string | null
  shippingAddress: {
    name: string
    street1: string
    street2?: string
    city: string
    state: string
    zip: string
  } | null
  timeline: TimelineStep[]
}

const statusIcons: Record<string, React.ElementType> = {
  'PENDING_RETURN': Clock,
  'RETURN_SHIPPED': Truck,
  'RETURN_DELIVERED': Package,
  'PROCESSING': RefreshCw,
  'COMPLETED': CheckCircle2,
}

export default function ClaimStatusPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = use(params)
  const [claim, setClaim] = useState<ClaimDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState(false)

  useEffect(() => {
    fetchClaimStatus()
  }, [claimId])

  const fetchClaimStatus = async () => {
    try {
      const res = await fetch(`/api/support/warranty/status/${claimId}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Unable to load claim status')
        return
      }

      setClaim(data)
    } catch (err) {
      setError('Unable to load claim status')
    } finally {
      setLoading(false)
    }
  }

  const generateLabel = async () => {
    if (!claim) return
    
    setGeneratingLabel(true)
    try {
      const res = await fetch('/api/support/warranty/return-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimNumber: claim.claimNumber }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        alert(data.error || 'Unable to generate return label')
        return
      }

      // Refresh claim data
      fetchClaimStatus()
    } catch (err) {
      alert('Unable to generate return label')
    } finally {
      setGeneratingLabel(false)
    }
  }

  const copyTracking = () => {
    if (claim?.returnTracking) {
      navigator.clipboard.writeText(claim.returnTracking)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const downloadLabel = () => {
    if (claim?.returnLabelUrl) {
      // If it's a data URL, trigger download
      const link = document.createElement('a')
      link.href = claim.returnLabelUrl
      link.download = `return-label-${claim.claimNumber}.pdf`
      link.click()
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-4" />
        <p className="text-slate-400">Loading claim status...</p>
      </div>
    )
  }

  if (error || !claim) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Claim Not Found</h1>
        <p className="text-slate-400 mb-6">{error || 'Unable to find this warranty claim.'}</p>
        <Link
          href="/support/warranty"
          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-xl transition-colors"
        >
          Start New Claim
        </Link>
      </div>
    )
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link
        href="/support"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Support
      </Link>

      {/* Header */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm text-slate-400">Warranty Claim</p>
            <h1 className="text-2xl font-bold text-white">{claim.claimNumber}</h1>
          </div>
          <div className={`px-3 py-1 rounded-lg text-sm font-medium ${
            claim.claimType === 'REFUND'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}>
            {claim.claimType === 'REFUND' ? (
              <span className="flex items-center gap-1"><DollarSign className="w-4 h-4" /> Refund</span>
            ) : (
              <span className="flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Replacement</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Order</p>
            <p className="text-white font-medium">{claim.orderId}</p>
          </div>
          <div>
            <p className="text-slate-500">Product</p>
            <p className="text-white font-medium">{claim.productName || 'N/A'}</p>
          </div>
          <div>
            <p className="text-slate-500">Submitted</p>
            <p className="text-white">{formatDate(claim.createdAt)}</p>
          </div>
          <div>
            <p className="text-slate-500">Status</p>
            <p className="text-amber-400 font-medium">
              {claim.status.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-6">Claim Progress</h2>
        
        <div className="relative">
          {claim.timeline.map((step, index) => {
            const Icon = statusIcons[step.status] || Clock
            const isLast = index === claim.timeline.length - 1
            
            return (
              <div key={step.status} className="flex gap-4 pb-6 last:pb-0">
                {/* Line */}
                {!isLast && (
                  <div className={`absolute left-[19px] top-10 w-0.5 h-[calc(100%-56px)] ${
                    step.completed ? 'bg-emerald-500' : 'bg-slate-700'
                  }`} style={{ top: `${index * 64 + 40}px`, height: '24px' }} />
                )}
                
                {/* Icon */}
                <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.completed
                    ? 'bg-emerald-500 text-white'
                    : step.current
                    ? 'bg-amber-500 text-white animate-pulse'
                    : 'bg-slate-700 text-slate-500'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>

                {/* Content */}
                <div className="flex-1 pt-2">
                  <p className={`font-medium ${
                    step.completed || step.current ? 'text-white' : 'text-slate-500'
                  }`}>
                    {step.label}
                  </p>
                  {step.date && (
                    <p className="text-sm text-slate-400">{formatDate(step.date)}</p>
                  )}
                  {step.current && !step.date && (
                    <p className="text-sm text-amber-400">In progress...</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Return Label Section */}
      {claim.status === 'PENDING_RETURN' && (
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Package className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">Return Your Item</h3>
              
              {claim.returnLabelUrl ? (
                <div className="space-y-4">
                  <p className="text-slate-400 text-sm">
                    Your prepaid return label is ready. Print it and attach it to your package.
                  </p>
                  
                  {claim.returnTracking && (
                    <div className="flex items-center gap-2 p-3 bg-slate-900/50 rounded-lg">
                      <span className="text-slate-400 text-sm">Tracking:</span>
                      <span className="text-white font-mono">{claim.returnTracking}</span>
                      <button
                        onClick={copyTracking}
                        className="p-1 hover:bg-slate-800 rounded transition-colors ml-auto"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={downloadLabel}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-lg transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download Label
                    </button>
                    {claim.returnTracking && (
                      <a
                        href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${claim.returnTracking}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Track Package
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-400 text-sm">
                    Click below to generate your prepaid return shipping label.
                  </p>
                  <button
                    onClick={generateLabel}
                    disabled={generatingLabel}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-slate-900 font-medium rounded-lg transition-colors"
                  >
                    {generatingLabel ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Package className="w-4 h-4" />
                        Generate Return Label
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Replacement Tracking */}
      {claim.claimType === 'REPLACEMENT' && claim.replacementTracking && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Replacement Shipment</h3>
          <div className="flex items-center gap-2 p-3 bg-slate-900/50 rounded-lg mb-4">
            <span className="text-slate-400 text-sm">Tracking:</span>
            <span className="text-white font-mono">{claim.replacementTracking}</span>
          </div>
          <a
            href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${claim.replacementTracking}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Track Your Replacement
          </a>
        </div>
      )}

      {/* Refund Info */}
      {claim.claimType === 'REFUND' && claim.status === 'COMPLETED' && claim.refundAmount && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">Refund Processed</h3>
          </div>
          <p className="text-slate-400 text-sm mb-4">
            Your refund of <span className="text-emerald-400 font-semibold">${claim.refundAmount.toFixed(2)}</span> has been issued to your original payment method.
          </p>
          {claim.refundProcessedAt && (
            <p className="text-xs text-slate-500">
              Processed on {formatDate(claim.refundProcessedAt)}
            </p>
          )}
        </div>
      )}

      {/* Help */}
      <div className="text-center">
        <p className="text-slate-500 text-sm mb-2">Need help with your claim?</p>
        <Link
          href="/support/contact"
          className="text-amber-400 hover:text-amber-300 text-sm font-medium"
        >
          Contact Support
        </Link>
      </div>
    </div>
  )
}

