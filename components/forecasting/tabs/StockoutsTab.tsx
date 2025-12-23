'use client'

import React from 'react'
import { Check, Brain } from 'lucide-react'
import { StockoutEvent } from '@/types/forecasting'

interface StockoutsTabProps {
  stockouts: StockoutEvent[]
  onRefresh: () => void
}

export default function StockoutsTab({ stockouts, onRefresh }: StockoutsTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-gray-400">Total Stockouts (90d)</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{stockouts.length}</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-gray-400">Days Lost</p>
          <p className="text-2xl font-bold text-orange-400 mt-1">{stockouts.reduce((sum, s) => sum + s.daysOutOfStock, 0)}</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-gray-400">Est. Lost Sales</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">${stockouts.reduce((sum, s) => sum + s.estimatedLostSales, 0).toLocaleString()}</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-gray-400">Unresolved</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{stockouts.filter(s => !s.resolved).length}</p>
        </div>
      </div>

      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
        <h3 className="text-lg font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-cyan-500" />
          Root Cause Analysis
        </h3>

        {stockouts.length === 0 ? (
          <div className="text-center py-8">
            <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-400">No stockouts in the last 90 days!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {stockouts.map((stockout) => (
              <div key={stockout.id} className={`p-4 rounded-lg border ${stockout.resolved ? 'bg-[var(--background)]/50 border-[var(--border)]' : 'bg-red-900/10 border-red-500/30'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-[var(--foreground)]">{stockout.sku}</h4>
                    <p className="text-xs text-gray-500">{stockout.title?.substring(0, 50)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">{new Date(stockout.stockoutDate).toLocaleDateString()}</p>
                    <p className="text-sm text-red-400">{stockout.daysOutOfStock} days out of stock</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Root Cause</p>
                    <p className="text-sm text-orange-400 mt-1">{stockout.rootCause}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Prevention Action</p>
                    <p className="text-sm text-cyan-400 mt-1">{stockout.preventionAction}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-yellow-400">Est. lost sales: ${stockout.estimatedLostSales.toLocaleString()}</p>
                  {!stockout.resolved && <button className="text-sm text-cyan-400 hover:text-cyan-300">Mark as Resolved</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
