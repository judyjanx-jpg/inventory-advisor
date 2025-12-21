// components/profit/PeriodDetailsModal.tsx
'use client'

import { useState } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import { PeriodData } from '@/types/profit'

interface PeriodDetailsModalProps {
  data: PeriodData
  isOpen: boolean
  onClose: () => void
}

function formatCurrency(value: number): string {
  const absValue = Math.abs(value)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(absValue)
  return value < 0 ? `-${formatted}` : formatted
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '-'
  return `${value.toFixed(2)}%`
}

interface ExpandableRowProps {
  label: string
  value: string | number
  valueColor?: string
  children?: React.ReactNode
  defaultExpanded?: boolean
}

function ExpandableRow({ label, value, valueColor = 'text-[var(--foreground)]', children, defaultExpanded = false }: ExpandableRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const hasChildren = Boolean(children)
  
  const displayValue = typeof value === 'number' ? formatCurrency(value) : value

  return (
    <div>
      <div 
        className={`flex justify-between items-center py-1.5 ${hasChildren ? 'cursor-pointer hover:bg-[var(--muted)]/30' : ''}`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <span className="text-[var(--foreground)] flex items-center gap-1">
          {hasChildren && (
            expanded ? <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" /> : <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" />
          )}
          {!hasChildren && <span className="w-4" />}
          {label}
        </span>
        <span className={valueColor}>{displayValue}</span>
      </div>
      {expanded && children && (
        <div className="ml-5 border-l border-[var(--border)] pl-3">
          {children}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, valueColor = 'text-[var(--foreground)]' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-[var(--muted-foreground)] text-sm">{label}</span>
      <span className={`text-sm ${valueColor}`}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-[var(--border)] my-2" />
}

export function PeriodDetailsModal({ data, isOpen, onClose }: PeriodDetailsModalProps) {
  if (!isOpen) return null

  const getPeriodTitle = () => {
    switch (data.period) {
      case 'today': return 'Today'
      case 'yesterday': return 'Yesterday'
      case 'mtd': return 'Month to date'
      case 'forecast': return 'This month (forecast)'
      case 'lastMonth': return 'Last month'
      default: return data.period
    }
  }

  // Calculate derived values
  const refundRate = data.units > 0 ? (data.refundCount / data.units) * 100 : 0
  const avgOrderValue = data.orders > 0 ? data.sales / data.orders : 0

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      
      {/* Modal */}
      <div className="absolute top-0 left-0 z-50 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl w-[340px] max-h-[600px] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[var(--card)] border-b border-[var(--border)] px-4 py-3 flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-[var(--foreground)] text-lg">{getPeriodTitle()}</h3>
            <p className="text-sm text-[var(--muted-foreground)]">{data.dateRange}</p>
          </div>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-3 text-sm">
          {/* Sales Section */}
          <ExpandableRow label="Sales" value={data.sales}>
            <DetailRow label="Organic" value="-" />
            <DetailRow label="Sponsored Products (same day)" value="-" />
            <DetailRow label="Sponsored Display (same day)" value="-" />
          </ExpandableRow>

          {/* Units Section */}
          <ExpandableRow label="Units" value={formatNumber(data.units)}>
            <DetailRow label="Organic" value="-" />
            <DetailRow label="Sponsored Products (same day)" value="-" />
            <DetailRow label="Sponsored Display (same day)" value="-" />
          </ExpandableRow>

          {/* Promo */}
          <ExpandableRow label="Promo" value={formatCurrency(data.promos || 0)} />

          <Divider />

          {/* Advertising Cost */}
          <ExpandableRow 
            label="Advertising cost" 
            value={formatCurrency(-data.adCost)}
            valueColor="text-red-400"
          >
            <DetailRow 
              label="Sponsored Products" 
              value={data.adCostSP ? formatCurrency(-data.adCostSP) : '-'} 
              valueColor={data.adCostSP ? 'text-red-400' : 'text-[var(--muted-foreground)]'} 
            />
            <DetailRow 
              label="Sponsored Brands" 
              value={data.adCostSB ? formatCurrency(-data.adCostSB) : '-'} 
              valueColor={data.adCostSB ? 'text-red-400' : 'text-[var(--muted-foreground)]'} 
            />
            <DetailRow 
              label="Sponsored Display" 
              value={data.adCostSD ? formatCurrency(-data.adCostSD) : '-'} 
              valueColor={data.adCostSD ? 'text-red-400' : 'text-[var(--muted-foreground)]'} 
            />
          </ExpandableRow>

          {/* Refund Cost */}
          <ExpandableRow 
            label="Refund cost" 
            value={formatCurrency(-data.refunds)}
            valueColor="text-red-400"
          >
            <DetailRow label="Refunded amount" value="-" valueColor="text-red-400" />
            <DetailRow label="Refund commission" value="-" valueColor="text-red-400" />
            <DetailRow label="Promotion" value="-" />
            <DetailRow label="Value of returned items" value="-" />
            <DetailRow label="Refunded referral fee" value="-" />
          </ExpandableRow>

          {/* Amazon Fees */}
          <ExpandableRow 
            label="Amazon fees" 
            value={formatCurrency(-data.amazonFees)}
            valueColor="text-red-400"
          >
            <DetailRow label="Referral fee" value="-" valueColor="text-red-400" />
            <DetailRow label="FBA per unit fulfilment fee" value="-" valueColor="text-red-400" />
            <DetailRow label="Compensated clawback" value="-" valueColor="text-red-400" />
            <DetailRow label="Inbound transportation" value="-" valueColor="text-red-400" />
            <DetailRow label="Warehouse lost" value="-" />
            <DetailRow label="Free replacement refund items" value="-" />
            <DetailRow label="Missing from inbound" value="-" />
            <DetailRow label="Reversal reimbursement" value="-" />
          </ExpandableRow>

          {/* Cost of Goods */}
          <ExpandableRow 
            label="Cost of goods" 
            value={formatCurrency(-data.cogs)}
            valueColor="text-red-400"
          >
            <DetailRow label="Cost of goods sold" value={formatCurrency(-data.cogs)} valueColor="text-red-400" />
            <DetailRow label="Lost/damaged by Amazon" value="-" />
          </ExpandableRow>

          <Divider />

          {/* Gross Profit */}
          <div className="flex justify-between items-center py-1.5">
            <span className="text-[var(--foreground)] font-medium">Gross profit</span>
            <span className={data.grossProfit >= 0 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
              {formatCurrency(data.grossProfit)}
            </span>
          </div>

          {/* Indirect Expenses */}
          <div className="flex justify-between items-center py-1.5">
            <span className="text-[var(--foreground)]">Indirect expenses</span>
            <span className="text-[var(--foreground)]">{formatCurrency(0)}</span>
          </div>

          <Divider />

          {/* Net Profit */}
          <div className="flex justify-between items-center py-2">
            <span className="text-[var(--foreground)] font-semibold">Net profit</span>
            <span className={`font-bold text-lg ${data.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(data.netProfit)}
            </span>
          </div>

          {/* Estimated Payout */}
          <div className="flex justify-between items-center py-1.5">
            <span className="text-[var(--foreground)]">Estimated payout</span>
            <span className="text-[var(--foreground)]">{formatCurrency(data.estPayout)}</span>
          </div>

          <Divider />

          {/* Metrics Section */}
          <div className="space-y-1 py-1">
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--muted-foreground)]">Real ACOS</span>
              <span className={data.realAcos && data.realAcos < 100 ? 'text-emerald-400' : 'text-[var(--foreground)]'}>
                {formatPercent(data.realAcos)}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--muted-foreground)]">% Refunds</span>
              <span className={refundRate > 5 ? 'text-red-400' : 'text-[var(--foreground)]'}>
                {formatPercent(refundRate)}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--muted-foreground)]">Sellable returns</span>
              <span className="text-[var(--foreground)]">-</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--muted-foreground)]">Margin</span>
              <span className={data.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {formatPercent(data.margin)}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--muted-foreground)]">ROI</span>
              <span className={data.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {formatPercent(data.roi)}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--muted-foreground)]">Active subscriptions (SnS)</span>
              <span className="text-[var(--foreground)]">-</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--muted-foreground)]">Sessions</span>
              <span className="text-[var(--foreground)]">-</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[var(--muted-foreground)]">Unit session percentage</span>
              <span className="text-[var(--foreground)]">-</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
