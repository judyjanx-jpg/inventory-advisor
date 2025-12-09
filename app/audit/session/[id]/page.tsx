'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import MainLayout from '@/components/layout/MainLayout'
import Button from '@/components/ui/Button'
import { ArrowLeft, ArrowRight, SkipForward, CheckCircle, AlertTriangle, Camera, X } from 'lucide-react'

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
  const [loading, setLoading] = useState(true)

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
        // Show success indicator briefly
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
    
    // Auto-save after a brief delay
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
    
    // Look up the SKU
    try {
      const res = await fetch(`/api/audit/lookup/${encodeURIComponent(scannedSku)}?warehouseId=${session?.warehouse.id}`)
      if (res.ok) {
        const data = await res.json()
        
        // Find index of this SKU
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

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={async () => {
                // Pause the session before exiting
                try {
                  const res = await fetch(`/api/audit/${sessionId}/pause`, { method: 'PUT' })
                  if (!res.ok) {
                    console.error('Failed to pause session')
                  }
                } catch (error) {
                  console.error('Error pausing session:', error)
                }
                // Use window.location to ensure a full navigation
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
          </div>
        </div>

        {/* Progress Bar */}
        {progress && (
          <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        )}

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

        {/* Navigation */}
        {((session.auditMode === 'parent' && currentIndex < groupedSkus.length) ||
          (session.auditMode === 'single_sku' && currentIndex < skus.length)) && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-700">
            <Button variant="ghost" onClick={handleBack} disabled={currentIndex === 0}>
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
        )}

        {/* Barcode Scanner Modal */}
        {showScanner && (
          <BarcodeScanner
            onScan={handleScan}
            onClose={() => setShowScanner(false)}
          />
        )}
      </div>
    </MainLayout>
  )
}

// Parent Audit View Component
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
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h2 className="text-xl font-bold text-white mb-6">PARENT: {group.parentSku}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {group.items.map(item => {
          const qty = currentQty[item.sku] ?? item.available
          const variance = qty - item.available
          const isFlagged = Math.abs(variance) > 10 || (item.available > 0 && Math.abs(variance) > item.available * 0.2)
          
          return (
            <div key={item.sku} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
              <div className="text-sm text-slate-400 mb-1">{item.sku}</div>
              <div className="text-xs text-slate-500 mb-3">Current: {item.available}</div>
              <input
                type="number"
                min="0"
                value={qty}
                onChange={(e) => onQtyChange(item.sku, parseInt(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-lg font-bold mb-2"
                placeholder="0"
              />
              {variance !== 0 && (
                <div className={`text-sm font-medium ${variance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {variance > 0 ? '+' : ''}{variance}
                  {isFlagged && <AlertTriangle className="w-4 h-4 inline ml-1" />}
                </div>
              )}
              {saving[item.sku] && (
                <div className="text-xs text-cyan-400 mt-1">Saving...</div>
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
          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white"
          rows={2}
          placeholder="Add notes for this parent..."
        />
      </div>
    </div>
  )
}

// Single SKU Audit View Component
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

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-8">
      <div className="text-center mb-8">
        <div className="text-4xl font-bold text-white mb-2">{sku.sku}</div>
        {sku.parentSku && (
          <div className="text-lg text-slate-400">Parent: {sku.parentSku}</div>
        )}
        <div className="text-sm text-slate-500 mt-2">{sku.title}</div>
      </div>

      <div className="text-center mb-8">
        <div className="text-sm text-slate-400 mb-2">Current Qty: {sku.available}</div>
        <input
          type="number"
          min="0"
          value={currentQty}
          onChange={(e) => onQtyChange(parseInt(e.target.value) || 0)}
          onFocus={(e) => e.target.select()}
          className="w-48 px-6 py-4 text-5xl font-bold text-center bg-slate-900 border-2 border-slate-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
        />
        {variance !== 0 && (
          <div className={`text-2xl font-bold mt-4 ${variance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            Variance: {variance > 0 ? '+' : ''}{variance}
            {isFlagged && <AlertTriangle className="w-6 h-6 inline ml-2" />}
          </div>
        )}
        {saving && (
          <div className="text-sm text-cyan-400 mt-2">Saving...</div>
        )}
      </div>

      <div className="mt-8">
        <label className="block text-sm text-slate-400 mb-2">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white"
          rows={3}
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Scan Barcode</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            autoFocus
            className="w-full px-4 py-3 text-xl bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
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
        <p className="text-sm text-slate-400 mt-4 text-center">
          Supports SKU, FNSKU, UPC, or ASIN
        </p>
      </div>
    </div>
  )
}

