'use client'

import React from 'react'
import { Truck, ShoppingCart, AlertTriangle } from 'lucide-react'
import { ForecastItem } from '@/types/forecasting'

interface DashboardHeaderProps {
  items: ForecastItem[]
  fbaTargetDays: number
}

export default function DashboardHeader({ items, fbaTargetDays }: DashboardHeaderProps) {
  // Calculate Ship Today: Total units to send to FBA for items that need replenishment today
  const shipToday = items
    .filter(item => {
      const fbaDaysOfSupply = item.velocity30d > 0
        ? (item.fbaAvailable + item.fbaInbound) / item.velocity30d
        : 999
      return fbaDaysOfSupply < 14 && item.warehouseAvailable > 0
    })
    .reduce((sum, item) => {
      const idealFbaStock = Math.ceil(fbaTargetDays * item.velocity30d)
      const currentFbaTotal = item.fbaAvailable + item.fbaInbound
      const replenishmentNeeded = Math.max(0, idealFbaStock - currentFbaTotal)
      const canSend = Math.min(replenishmentNeeded, item.warehouseAvailable)
      return sum + canSend
    }, 0)

  // Calculate Order Today: Total units to order for items with urgent purchase dates
  const orderToday = items
    .filter(item => item.daysToPurchase !== undefined && item.daysToPurchase <= 0)
    .reduce((sum, item) => sum + item.recommendedOrderQty, 0)

  // Calculate Out of Stock: SKUs with zero FBA + zero warehouse inventory
  const outOfStock = items.filter(item =>
    item.fbaAvailable === 0 && item.fbaInbound === 0 && item.warehouseAvailable === 0
  ).length

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {/* Ship Today */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Truck className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Ship Today</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">
              {shipToday.toLocaleString()} <span className="text-sm font-normal text-gray-400">units</span>
            </p>
          </div>
        </div>
      </div>

      {/* Order Today */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/20">
            <ShoppingCart className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Order Today</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">
              {orderToday.toLocaleString()} <span className="text-sm font-normal text-gray-400">units</span>
            </p>
          </div>
        </div>
      </div>

      {/* Out of Stock */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${outOfStock > 0 ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
            <AlertTriangle className={`w-5 h-5 ${outOfStock > 0 ? 'text-red-400' : 'text-green-400'}`} />
          </div>
          <div>
            <p className="text-sm text-gray-400">Out of Stock</p>
            <p className={`text-2xl font-bold ${outOfStock > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {outOfStock} <span className="text-sm font-normal text-gray-400">SKUs</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
