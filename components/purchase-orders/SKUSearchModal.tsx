'use client'

import { useState, useEffect } from 'react'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Search, X } from 'lucide-react'

interface SKU {
  sku: string
  title: string
  cost: number
}

interface SKUSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (sku: SKU) => void
}

export default function SKUSearchModal({ isOpen, onClose, onSelect }: SKUSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [skus, setSkus] = useState<SKU[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchSKUs()
      setSearchTerm('')
    }
  }, [isOpen])

  const fetchSKUs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/products?flat=true')
      if (res.ok) {
        const data = await res.json()
        setSkus(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Error fetching SKUs:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredSKUs = skus.filter(sku =>
    sku.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sku.title?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelect = (sku: SKU) => {
    onSelect(sku)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Item by SKU"
      size="lg"
    >
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Search by SKU or product name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-cyan-500"
            autoFocus
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
          </div>
        ) : filteredSKUs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[var(--muted-foreground)]">No matching SKUs found</p>
            {searchTerm && (
              <p className="text-sm text-[var(--muted-foreground)] mt-2">Try a different search term</p>
            )}
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {filteredSKUs.map((sku) => (
              <div
                key={sku.sku}
                onClick={() => handleSelect(sku)}
                className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:bg-[var(--hover-bg)] cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--foreground)] font-medium truncate">{sku.sku}</div>
                    <div className="text-sm text-[var(--muted-foreground)] truncate">{sku.title || 'No title'}</div>
                  </div>
                  <div className="text-sm text-[var(--foreground)] ml-4">
                    ${Number(sku.cost || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

