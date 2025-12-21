'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import EditableField from '@/components/purchase-orders/EditableField'
import { Plus, Trash2 } from 'lucide-react'

interface AdditionalCost {
  id: number
  description: string
  amount: number
}

interface AdditionalCostsSectionProps {
  costs: AdditionalCost[]
  onAdd: () => void
  onUpdate: (id: number, field: string, value: any) => void
  onDelete: (id: number) => void
}

export default function AdditionalCostsSection({
  costs,
  onAdd,
  onUpdate,
  onDelete,
}: AdditionalCostsSectionProps) {
  const subtotal = costs.reduce((sum, cost) => sum + Number(cost.amount || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Additional Costs</h3>
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add Cost
        </Button>
      </div>

      {costs.length === 0 ? (
        <div className="text-center py-8 text-[var(--muted-foreground)] border border-[var(--border)] rounded-lg">
          No additional costs added
        </div>
      ) : (
        <div className="space-y-2">
          {costs.map((cost) => (
            <div
              key={cost.id}
              className="flex items-center gap-4 p-4 bg-[var(--card)] border border-[var(--border)] rounded-lg"
            >
              <div className="flex-1">
                <EditableField
                  value={cost.description}
                  onChange={(value) => onUpdate(cost.id, 'description', value)}
                  type="text"
                  className="text-[var(--foreground)] font-medium"
                  placeholder="Cost description"
                />
              </div>
              <div className="w-32">
                <div className="flex items-center gap-1">
                  <span className="text-[var(--muted-foreground)]">$</span>
                  <EditableField
                    value={Number(cost.amount || 0)}
                    onChange={(value) => onUpdate(cost.id, 'amount', value)}
                    type="number"
                    className="text-[var(--foreground)] font-medium"
                    formatValue={(val) => Number(val).toFixed(2)}
                    parseValue={(val) => parseFloat(val) || 0}
                    min={0}
                    step={0.01}
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm('Delete this cost?')) {
                    onDelete(cost.id)
                  }
                }}
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {costs.length > 0 && (
        <div className="pt-4 border-t border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--muted-foreground)]">Additional Costs Subtotal</span>
            <span className="text-[var(--foreground)] font-semibold">${subtotal.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

