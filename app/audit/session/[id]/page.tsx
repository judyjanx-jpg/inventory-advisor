'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import Button from '@/components/ui/Button'
import { ArrowLeft, ArrowRight, SkipForward, CheckCircle, AlertTriangle, Camera, X, Menu, StopCircle } from 'lucide-react'

interface AuditSession {
  id: number
  warehouse: { id: number; name: string }
  auditMode: string
  sortOrder: string
  totalSkus: number
  auditedCount: number
  status: string
}

interface SKU {
  sku: string
  title: string
  parentSku: string | null
  available: number
}

interface GroupedSKU {
  parentSku: string
  items: SKU[]
}

interface Progress {
  totalSkus: number
  auditedCount: number
  progress: number
  flaggedCount: number
  totalVariance: number
}

export default function AuditSessionPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string

  const [session, setSession] = useState<AuditSession | null>(null)
  const [skus, setSkus] = useState<SKU[]>([])
  const [groupedSkus, setGroupedSkus] = useState<GroupedSKU[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentQty, setCurrentQty] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<Progress | null>(null)
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [showScanner, setShowScanner] = useState(false)
  const [showEndEarlyModal, setShowEndEarlyModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    fetchSession()
    fetchSKUs()
    fetchProgress()
    
    // Poll progress every 5 seconds
    const interval = setInterval(fetchProgress, 5000)
    return () => clearInterval(interval)
  }, [sessionId])

  const fetchSession = async () => {
    try {
      const res = await fetch(`/api/audit/${sessionId}`)
      if (res.ok) {
        const data = await res.json()
        setSession(data)
      }
    } catch (error) {
      console.error('Error fetching session:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSKUs = async () => {
    if (!session) return
    
    try {
      const res = await fetch(`/api/audit/skus?warehouseId=${session.warehouse.id}&sort=${session.sortOrder}&grouped=${session.auditMode === 'parent'}`)
      if (res.ok) {
        const data = await res.json()
        if (session.auditMode === 'parent' && data.grouped) {
          setGroupedSkus(data.grouped)
        } else {
          setSkus(data.skus || [])
        }
      }
    } catch (error) {
      console.error('Error fetching SKUs:', error)
    }
  }

  useEffect(() => {
    if (session) {
      fetchSKUs()
    }
  }, [session])

  const fetchProgress = async () => {
    try {
      const res = await fetch(`/api/audit/${sessionId}/progress`)
      if (res.ok) {
        const data = await res.json()
        setProgress(data)
      }
    } catch (error) {
      console.error('Error fetching progress:', error)
    }
  }

  const saveEntry = async (sku: string, qty: number, note?: string) => {
    if (saving[sku]) return

    setSaving(prev => ({ ...prev, [sku]: true }))
    try {
      const res = await fetch(`/api/audit/${sessionId}/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          newQty: qty,
          notes: note || notes[sku] || '',
        }),
      })

      if (res.ok) {
        await fetchProgress()
        setTimeout(() => {
          setSaving(prev => ({ ...prev, [sku]: false }))
        }, 1000)
      } else {
        setSaving(prev => ({ ...prev, [sku]: false }))
        alert('Failed to save entry')
      }
    } catch (error) {
      console.error('Error saving entry:', error)
      setSaving(prev => ({ ...prev, [sku]: false }))
      alert('Failed to save entry')
    }
  }

  const handleQtyChange = (sku: string, qty: number) => {
    setCurrentQty(prev => ({ ...prev, [sku]: qty }))
    
    clearTimeout((window as any)[`saveTimeout_${sku}`])
    ;(window as any)[`saveTimeout_${sku}`] = setTimeout(() => {
      if (qty === 0) {
        if (confirm(`Confirm zero count for ${sku}?`)) {
          saveEntry(sku, qty)
        } else {
          setCurrentQty(prev => {
            const newQty = { ...prev }
            delete newQty[sku]
            return newQty
          })
        }
      } else {
        saveEntry(sku, qty)
      }
    }, 500)
  }

  const handleNext = () => {
    if (session?.auditMode === 'parent') {
      if (currentIndex < groupedSkus.length - 1) {
        setCurrentIndex(prev => prev + 1)
      }
    } else {
      if (currentIndex < skus.length - 1) {
        setCurrentIndex(prev => prev + 1)
      }
    }
  }

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
  }

  const handleSkip = () => {
    handleNext()
  }

  const handleScan = async (scannedSku: string) => {
    setShowScanner(false)
    
    try {
      const res = await fetch(`/api/audit/lookup/${encodeURIComponent(scannedSku)}?warehouseId=${session?.warehouse.id}`)
      if (res.ok) {
        const data = await res.json()
        
        if (session?.auditMode === 'parent') {
          const groupIndex = groupedSkus.findIndex(g => 
            g.items.some(item => item.sku === data.sku)
          )
          if (groupIndex >= 0) {
            setCurrentIndex(groupIndex)
          }
        } else {
          const skuIndex = skus.findIndex(s => s.sku === data.sku)
          if (skuIndex >= 0) {
            setCurrentIndex(skuIndex)
          }
        }
      } else {
        alert('SKU not found')
      }
    } catch (error) {
      console.error('Error looking up SKU:', error)
      alert('Failed to lookup SKU')
    }
  }

  const handleEndEarly = async (applyChanges: boolean) => {
    try {
      const res = await fetch(`/api/audit/${sessionId}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          endEarly: true,
          applyChanges 
        }),
      })

      if (res.ok) {
        router.push('/audit/history')
      } else {
        alert('Failed to end audit')
      }
    } catch (error) {
      console.error('Error ending audit:', error)
      alert('Failed to end audit')
    }
  }

  const goToSummary = async () => {
    router.push(`/audit/session/${sessionId}/summary`)
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      </MainLayout>
    )
  }

  if (!session) {
    return (
      <MainLayout>
        <div className="text-center py-16">
          <p className="text-slate-400">Audit session not found</p>
          <Button variant="ghost" onClick={() => router.push('/audit')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Setup
          </Button>
        </div>
      </MainLayout>
    )
  }

  const currentGroup = session.auditMode === 'parent' ? groupedSkus[currentIndex] : null
  const currentSku = session.auditMode === 'single_sku' ? skus[currentIndex] : null
  const totalItems = session.auditMode === 'parent' ? groupedSkus.length : skus.length

  return (
    <MainLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Mobile Header */}
        <div className="flex flex-col gap-3 md:hidden">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={async () => {
                try {
                  await fetch(`/api/audit/${sessionId}/pause`, { method: 'PUT' })
                } catch (error) {
                  console.error('Error pausing session:', error)
                }
                window.location.href = '/audit'
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-lg font-bold text-white truncate flex-1 text-center">
              {session.warehouse.name}
            </h1>
            <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <Menu className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Mobile Menu Dropdown */}
          {mobileMenuOpen && (
            <div className="bg-slate-800 rounded-lg p-3 space-y-2 border border-slate-700">
              <Button variant="ghost" size="sm" onClick={() => { setShowScanner(true); setMobileMenuOpen(false); }} className="w-full justify-start">
                <Camera className="w-4 h-4 mr-2" />
                Scan Barcode
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowEndEarlyModal(true); setMobileMenuOpen(false); }} className="w-full justify-start text-amber-400">
                <StopCircle className="w-4 h-4 mr-2" />
                End Audit Early
              </Button>
              <Button variant="ghost" size="sm" onClick={goToSummary} className="w-full justify-start">
                <CheckCircle className="w-4 h-4 mr-2" />
                View Summary
              </Button>
            </div>
          )}
          
          {/* Mobile Progress */}
          {progress && (
            <div className="text-center">
              <p className="text-sm text-slate-400">
                {progress.auditedCount}/{progress.totalSkus} SKUs • {Math.round(progress.progress)}%
              </p>
              <div className="w-full bg-slate-700 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={async () => {
                try {
                  await fetch(`/api/audit/${sessionId}/pause`, { method: 'PUT' })
                } catch (error) {
                  console.error('Error pausing session:', error)
                }
                window.location.href = '/audit'
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Exit Audit
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">
                AUDIT: {session.warehouse.name}
              </h1>
              {progress && (
                <p className="text-slate-400">
                  {progress.auditedCount}/{progress.totalSkus} SKUs • {Math.round(progress.progress)}% Complete
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {progress && (
              <span className={`text-sm ${progress.flaggedCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {progress.flaggedCount > 0 ? `⚠ ${progress.flaggedCount} flagged` : '✓ All saved'}
              </span>
            )}
            <Button variant="ghost" onClick={() => setShowScanner(true)}>
              <Camera className="w-4 h-4 mr-2" />
              Scan
            </Button>
            <Button variant="outline" onClick={() => setShowEndEarlyModal(true)} className="text-amber-400 border-amber-500/50 hover:bg-amber-500/10">
              <StopCircle className="w-4 h-4 mr-2" />
              End Early
            </Button>
          </div>
        </div>

        {/* Desktop Progress Bar */}
        {progress && (
          <div className="hidden md:block w-full bg-slate-700 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        )}

        {/* Item Counter - Mobile Friendly */}
        <div className="text-center text-sm text-slate-400">
          Item {currentIndex + 1} of {totalItems}
        </div>

        {/* Audit Content */}
        {session.auditMode === 'parent' && currentGroup ? (
          <ParentAuditView
            group={currentGroup}
            currentQty={currentQty}
            notes={notes}
            saving={saving}
            onQtyChange={handleQtyChange}
            onNotesChange={(sku, note) => setNotes(prev => ({ ...prev, [sku]: note }))}
            onSave={saveEntry}
          />
        ) : currentSku ? (
          <SingleSkuAuditView
            sku={currentSku}
            currentQty={currentQty[currentSku.sku] ?? currentSku.available}
            notes={notes[currentSku.sku] || ''}
            saving={saving[currentSku.sku]}
            onQtyChange={(qty) => handleQtyChange(currentSku.sku, qty)}
            onNotesChange={(note) => setNotes(prev => ({ ...prev, [currentSku.sku]: note }))}
            onSave={() => saveEntry(currentSku.sku, currentQty[currentSku.sku] ?? currentSku.available, notes[currentSku.sku])}
          />
        ) : (
          <div className="text-center py-16">
            <CheckCircle className="w-24 h-24 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Audit Complete!</h2>
            <Button onClick={goToSummary} className="mt-4">
              View Summary
            </Button>
          </div>
        )}

        {/* Navigation - Mobile Optimized with Sticky Bottom */}
        {((session.auditMode === 'parent' && currentIndex < groupedSkus.length) ||
          (session.auditMode === 'single_sku' && currentIndex < skus.length)) && (
          <>
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center justify-between pt-4 border-t border-slate-700 gap-2">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={currentIndex === 0}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleSkip}>
                  <SkipForward className="w-4 h-4 mr-2" />
                  Skip
                </Button>
                <Button variant="primary" onClick={handleNext}>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>

            {/* Mobile Sticky Bottom Navigation */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 p-3 z-40">
              <div className="flex items-center gap-2 max-w-lg mx-auto">
                <button
                  onClick={handleBack}
                  disabled={currentIndex === 0}
                  className="w-12 h-12 flex items-center justify-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors touch-manipulation"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSkip}
                  className="flex-1 h-12 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-xl transition-colors touch-manipulation"
                >
                  <SkipForward className="w-5 h-5" />
                  <span className="font-medium">Skip</span>
                </button>
                <button
                  onClick={handleNext}
                  className="flex-1 h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 active:from-cyan-600 active:to-blue-600 text-white font-bold rounded-xl transition-colors touch-manipulation"
                >
                  <span>Next</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Spacer for fixed bottom nav on mobile */}
            <div className="h-20 md:hidden" />
          </>
        )}

        {/* Barcode Scanner Modal */}
        {showScanner && (
          <BarcodeScanner
            onScan={handleScan}
            onClose={() => setShowScanner(false)}
          />
        )}

        {/* End Early Modal */}
        {showEndEarlyModal && (
          <EndEarlyModal
            progress={progress}
            onClose={() => setShowEndEarlyModal(false)}
            onEndWithChanges={() => handleEndEarly(true)}
            onEndWithoutChanges={() => handleEndEarly(false)}
          />
        )}
      </div>
    </MainLayout>
  )
}

// Parent Audit View Component - Mobile Optimized
function ParentAuditView({
  group,
  currentQty,
  notes,
  saving,
  onQtyChange,
  onNotesChange,
  onSave,
}: {
  group: GroupedSKU
  currentQty: Record<string, number>
  notes: Record<string, string>
  saving: Record<string, boolean>
  onQtyChange: (sku: string, qty: number) => void
  onNotesChange: (sku: string, note: string) => void
  onSave: (sku: string, qty: number, note?: string) => void
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-3 md:p-6">
      <h2 className="text-base md:text-xl font-bold text-white mb-3 md:mb-6 truncate">
        PARENT: {group.parentSku}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-3 md:mb-6">
        {group.items.map(item => {
          const qty = currentQty[item.sku] ?? item.available
          const variance = qty - item.available
          const isFlagged = Math.abs(variance) > 10 || (item.available > 0 && Math.abs(variance) > item.available * 0.2)

          return (
            <div key={item.sku} className="bg-slate-900 rounded-xl p-3 md:p-4 border border-slate-700">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs md:text-sm text-slate-400 truncate font-medium">{item.sku}</div>
                  <div className="text-xs text-slate-500">Cur: {item.available}</div>
                </div>
                {saving[item.sku] && (
                  <div className="text-xs text-cyan-400 flex-shrink-0">Saving...</div>
                )}
              </div>

              {/* Mobile-friendly quantity input with +/- buttons */}
              <div className="flex items-center gap-1 mb-2">
                <button
                  onClick={() => onQtyChange(item.sku, Math.max(0, qty - 1))}
                  className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center text-xl md:text-lg font-bold bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-lg transition-colors touch-manipulation flex-shrink-0"
                  type="button"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={qty}
                  onChange={(e) => onQtyChange(item.sku, parseInt(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 px-2 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-lg md:text-xl font-bold text-center touch-manipulation"
                  placeholder="0"
                />
                <button
                  onClick={() => onQtyChange(item.sku, qty + 1)}
                  className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center text-xl md:text-lg font-bold bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-400 text-white rounded-lg transition-colors touch-manipulation flex-shrink-0"
                  type="button"
                >
                  +
                </button>
              </div>

              {variance !== 0 && (
                <div className={`text-xs md:text-sm font-medium ${variance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {variance > 0 ? '+' : ''}{variance}
                  {isFlagged && <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 inline ml-1" />}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div>
        <label className="block text-sm text-slate-400 mb-2">Notes</label>
        <textarea
          value={notes[group.parentSku] || ''}
          onChange={(e) => onNotesChange(group.parentSku, e.target.value)}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm md:text-base"
          rows={2}
          placeholder="Add notes for this parent..."
        />
      </div>
    </div>
  )
}

// Single SKU Audit View Component - Mobile Optimized
function SingleSkuAuditView({
  sku,
  currentQty,
  notes,
  saving,
  onQtyChange,
  onNotesChange,
  onSave,
}: {
  sku: SKU
  currentQty: number
  notes: string
  saving: boolean
  onQtyChange: (qty: number) => void
  onNotesChange: (note: string) => void
  onSave: () => void
}) {
  const variance = currentQty - sku.available
  const isFlagged = Math.abs(variance) > 10 || (sku.available > 0 && Math.abs(variance) > sku.available * 0.2)

  const handleIncrement = () => onQtyChange(currentQty + 1)
  const handleDecrement = () => onQtyChange(Math.max(0, currentQty - 1))

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 md:p-8">
      <div className="text-center mb-4 md:mb-8">
        <div className="text-xl md:text-4xl font-bold text-white mb-2 break-all">{sku.sku}</div>
        {sku.parentSku && (
          <div className="text-sm md:text-lg text-slate-400">Parent: {sku.parentSku}</div>
        )}
        <div className="text-xs md:text-sm text-slate-500 mt-2 line-clamp-2">{sku.title}</div>
      </div>

      <div className="text-center mb-4 md:mb-8">
        <div className="text-sm text-slate-400 mb-3">Current Qty: {sku.available}</div>

        {/* Mobile-friendly quantity input with +/- buttons */}
        <div className="flex items-center justify-center gap-2 md:gap-4">
          <button
            onClick={handleDecrement}
            className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center text-3xl md:text-4xl font-bold bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white rounded-xl transition-colors touch-manipulation"
            type="button"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={currentQty}
            onChange={(e) => onQtyChange(parseInt(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            className="w-28 md:w-48 px-2 md:px-6 py-3 md:py-4 text-4xl md:text-5xl font-bold text-center bg-slate-900 border-2 border-slate-600 rounded-xl text-white focus:border-cyan-500 focus:outline-none touch-manipulation"
          />
          <button
            onClick={handleIncrement}
            className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center text-3xl md:text-4xl font-bold bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-400 text-white rounded-xl transition-colors touch-manipulation"
            type="button"
          >
            +
          </button>
        </div>

        {variance !== 0 && (
          <div className={`text-lg md:text-2xl font-bold mt-4 ${variance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            Variance: {variance > 0 ? '+' : ''}{variance}
            {isFlagged && <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 inline ml-2" />}
          </div>
        )}
        {saving && (
          <div className="text-sm text-cyan-400 mt-2">Saving...</div>
        )}
      </div>

      <div className="mt-4 md:mt-8">
        <label className="block text-sm text-slate-400 mb-2">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-base"
          rows={2}
          placeholder="Add notes..."
        />
      </div>
    </div>
  )
}

// Barcode Scanner Component
function BarcodeScanner({ onScan, onClose }: { onScan: (sku: string) => void; onClose: () => void }) {
  const [scanInput, setScanInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (scanInput.trim()) {
      onScan(scanInput.trim())
      setScanInput('')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg p-4 md:p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-bold text-white">Scan Barcode</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            autoFocus
            className="w-full px-4 py-3 text-lg md:text-xl bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
            placeholder="Scan or type SKU..."
          />
          <div className="flex gap-3 mt-4">
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={!scanInput.trim()}>
              Lookup
            </Button>
          </div>
        </form>
        <p className="text-xs md:text-sm text-slate-400 mt-4 text-center">
          Supports SKU, FNSKU, UPC, or ASIN
        </p>
      </div>
    </div>
  )
}

// End Early Modal Component
function EndEarlyModal({ 
  progress,
  onClose, 
  onEndWithChanges, 
  onEndWithoutChanges 
}: { 
  progress: Progress | null
  onClose: () => void
  onEndWithChanges: () => void
  onEndWithoutChanges: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg p-4 md:p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-bold text-white">End Audit Early?</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="mb-6">
          <p className="text-slate-300 mb-4">
            You've audited {progress?.auditedCount || 0} of {progress?.totalSkus || 0} SKUs ({Math.round(progress?.progress || 0)}%).
          </p>
          <p className="text-slate-400 text-sm">
            Choose how you want to end this audit:
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onEndWithChanges}
            className="w-full p-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-left transition-colors"
          >
            <div className="font-semibold">Save & Apply Changes</div>
            <div className="text-sm text-emerald-200">Update inventory with audited counts</div>
          </button>
          
          <button
            onClick={onEndWithoutChanges}
            className="w-full p-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-left transition-colors"
          >
            <div className="font-semibold">Save Without Applying</div>
            <div className="text-sm text-slate-400">Log audit data but don't update inventory</div>
          </button>
          
          <Button variant="ghost" onClick={onClose} className="w-full">
            Continue Auditing
          </Button>
        </div>
      </div>
    </div>
  )
}
