'use client'

import { useState, useEffect } from 'react'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { GripVertical, Save, X, Layers } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SKU {
  sku: string
  title: string
  parentSku: string | null
  available: number
}

interface CustomOrderModalProps {
  isOpen: boolean
  onClose: () => void
  warehouseId: number | null
  warehouseName?: string
}

function SortableItem({ sku, title, parentSku, available }: SKU) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sku })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700/50"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-300"
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{sku}</div>
        <div className="text-sm text-slate-400 truncate">{title}</div>
        {parentSku && (
          <div className="text-xs text-slate-500">Parent: {parentSku}</div>
        )}
      </div>
      <div className="text-sm text-slate-400">
        Qty: {available}
      </div>
    </div>
  )
}

export default function CustomOrderModal({
  isOpen,
  onClose,
  warehouseId,
  warehouseName,
}: CustomOrderModalProps) {
  const [skus, setSkus] = useState<SKU[]>([])
  const [groupedSkus, setGroupedSkus] = useState<Map<string, SKU[]>>(new Map())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [groupByParent, setGroupByParent] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    if (isOpen && warehouseId) {
      fetchSKUsAndOrder()
    }
  }, [isOpen, warehouseId])

  const fetchSKUsAndOrder = async () => {
    if (!warehouseId) return

    setLoading(true)
    setHasChanges(false)
    try {
      // Fetch SKUs in alphabetical order first
      const skusRes = await fetch(`/api/audit/skus?warehouseId=${warehouseId}&sort=asc`)
      if (!skusRes.ok) {
        throw new Error('Failed to fetch SKUs')
      }
      
      const skusData = await skusRes.json()
      let skusList = skusData.skus || []

      // Fetch custom order if it exists
      const orderRes = await fetch(`/api/audit/custom-order?warehouseId=${warehouseId}`)
      if (orderRes.ok) {
        const orderData = await orderRes.json()
        if (orderData.order && orderData.order.length > 0) {
          // Reorder SKUs based on custom order
          const orderMap = new Map<string, number>(
            orderData.order.map((item: any) => [item.sku, Number(item.sortPosition)])
          )
          skusList = [...skusList].sort((a, b) => {
            const posA = orderMap.get(a.sku) ?? 999999
            const posB = orderMap.get(b.sku) ?? 999999
            return posA - posB
          })
        }
      }

      setSkus(skusList)
      updateGroupedSkus(skusList)
    } catch (error) {
      console.error('Error fetching SKUs:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateGroupedSkus = (skuList: SKU[]) => {
    const grouped = new Map<string, SKU[]>()
    skuList.forEach(sku => {
      const parentKey = sku.parentSku || sku.sku
      if (!grouped.has(parentKey)) {
        grouped.set(parentKey, [])
      }
      grouped.get(parentKey)!.push(sku)
    })
    setGroupedSkus(grouped)
  }

  useEffect(() => {
    if (skus.length > 0) {
      updateGroupedSkus(skus)
    }
  }, [skus])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setSkus((items) => {
        const oldIndex = items.findIndex(item => item.sku === active.id)
        const newIndex = items.findIndex(item => item.sku === over.id)
        const newItems = arrayMove(items, oldIndex, newIndex)
        setHasChanges(true)
        return newItems
      })
    }
  }

  const handleSave = async () => {
    if (!warehouseId) return

    setSaving(true)
    try {
      const order = skus.map((sku, index) => ({
        sku: sku.sku,
        sortPosition: index,
      }))

      const res = await fetch('/api/audit/custom-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId,
          order,
        }),
      })

      if (res.ok) {
        setHasChanges(false)
        alert('Custom order saved successfully!')
      } else {
        const error = await res.json()
        alert(`Failed to save: ${error.error}`)
      }
    } catch (error) {
      console.error('Error saving custom order:', error)
      alert('Failed to save custom order')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (confirm('Reset to alphabetical order? This will discard your custom order.')) {
      if (!warehouseId) return
      
      setLoading(true)
      try {
        const res = await fetch(`/api/audit/skus?warehouseId=${warehouseId}&sort=asc`)
        if (res.ok) {
          const data = await res.json()
          const skusList = data.skus || []
          setSkus(skusList)
          updateGroupedSkus(skusList)
          setHasChanges(true)
        }
      } catch (error) {
        console.error('Error resetting order:', error)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Custom SKU Order${warehouseName ? ` - ${warehouseName}` : ''}`}
      size="lg"
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Drag and drop SKUs to reorder them. The order will be used when "Custom Order" is selected for auditing.
          </div>
          {skus.length > 0 && (
            <div className="text-sm text-slate-300">
              {skus.length} SKU{skus.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Group by Parent Toggle */}
        <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">Group by Parent SKU</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={groupByParent}
              onChange={(e) => setGroupByParent(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
          </div>
        ) : skus.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            No SKUs found for this warehouse
          </div>
        ) : groupByParent ? (
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              {Array.from(groupedSkus.entries()).map(([parentSku, items]) => (
                <div key={parentSku} className="space-y-2">
                  <div className="text-sm font-semibold text-cyan-400 px-2 py-1 bg-cyan-500/10 rounded">
                    {parentSku === items[0]?.sku ? 'Standalone SKU' : `Parent: ${parentSku}`} ({items.length} variant{items.length !== 1 ? 's' : ''})
                  </div>
                  <SortableContext
                    items={items.map(sku => sku.sku)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2 pl-4 border-l-2 border-slate-700">
                      {items.map((sku) => (
                        <SortableItem key={sku.sku} {...sku} />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              ))}
            </DndContext>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={skus.map(sku => sku.sku)}
                strategy={verticalListSortingStrategy}
              >
                {skus.map((sku) => (
                  <SortableItem key={sku.sku} {...sku} />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <ModalFooter>
        <div className="flex items-center justify-between w-full">
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={loading || skus.length === 0}
          >
            Reset to A-Z
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={loading || saving || !hasChanges}
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Order'}
            </Button>
          </div>
        </div>
      </ModalFooter>
    </Modal>
  )
}

