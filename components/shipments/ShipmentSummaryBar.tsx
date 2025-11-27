'use client'

import { Check, Circle, Loader2 } from 'lucide-react'

export type ShipmentStage = 'create' | 'pick' | 'label' | 'box' | 'ship'

interface ShipmentSummaryBarProps {
  totalSkus: number
  totalUnits: number
  totalBoxes: number
  currentStage: ShipmentStage
  completedStages: ShipmentStage[]
  status: string
  onStageClick?: (stage: ShipmentStage) => void
}

const stages: { id: ShipmentStage; label: string }[] = [
  { id: 'create', label: 'CREATE' },
  { id: 'pick', label: 'PICK' },
  { id: 'label', label: 'LABEL' },
  { id: 'box', label: 'BOX' },
  { id: 'ship', label: 'SHIP' },
]

export default function ShipmentSummaryBar({
  totalSkus,
  totalUnits,
  totalBoxes,
  currentStage,
  completedStages,
  status,
  onStageClick,
}: ShipmentSummaryBarProps) {
  // Don't show for shipped/received statuses
  if (['shipped', 'in_transit', 'receiving', 'received'].includes(status)) {
    return null
  }

  const getStageStatus = (stageId: ShipmentStage) => {
    if (completedStages.includes(stageId)) return 'complete'
    if (currentStage === stageId) return 'current'
    return 'pending'
  }

  const getProgressPercent = () => {
    const stageIndex = stages.findIndex(s => s.id === currentStage)
    const completedCount = completedStages.length
    return Math.min(100, (completedCount / stages.length) * 100)
  }

  const qtyPerBox = totalBoxes > 0 ? Math.round(totalUnits / totalBoxes) : 0

  return (
    <div className="sticky top-0 z-40 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-6 py-4">
        {/* Title and Metrics */}
        <div className="text-center mb-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Shipment Summary
          </h2>
          <div className="flex items-center justify-center gap-6 text-lg">
            <span className="text-white font-bold">{totalSkus} SKUs</span>
            <span className="text-slate-500">|</span>
            <span className="text-white font-bold">{totalUnits.toLocaleString()} pcs</span>
            <span className="text-slate-500">|</span>
            <span className="text-white font-bold">
              {totalBoxes > 0 ? `${qtyPerBox}/BOX` : '—/BOX'}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="relative h-2 bg-slate-700 rounded-full mb-4 overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${getProgressPercent()}%` }}
          />
        </div>

        {/* Stage Indicators */}
        <div className="flex items-center justify-between">
          {stages.map((stage, index) => {
            const stageStatus = getStageStatus(stage.id)
            return (
              <button
                key={stage.id}
                onClick={() => onStageClick?.(stage.id)}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-all ${
                  stageStatus === 'complete'
                    ? 'text-emerald-400'
                    : stageStatus === 'current'
                    ? 'text-cyan-400'
                    : 'text-slate-500'
                } hover:bg-slate-700/50`}
              >
                {stageStatus === 'complete' ? (
                  <Check className="w-5 h-5" />
                ) : stageStatus === 'current' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
                <span className={`text-sm font-medium ${
                  stageStatus === 'current' ? 'animate-pulse' : ''
                }`}>
                  {stage.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

