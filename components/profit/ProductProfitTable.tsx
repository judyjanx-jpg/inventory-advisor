// components/profit/ProductProfitTable.tsx
'use client'

import { ProductProfit, GroupByType } from '@/types/profit'
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react'
import { useState } from 'react'

interface ProductProfitTableProps {
  products: ProductProfit[]
  loading: boolean
  visibleColumns: string[]
  groupBy: GroupByType
}

const allColumns = [
  { key: 'unitsSold', label: 'Units sold', align: 'right' },
  { key: 'refunds', label: 'Refunds', align: 'right' },
  { key: 'sales', label: 'Sales', align: 'right' },
  { key: 'adSpend', label: 'Ads', align: 'right' },
  { key: 'cogs', label: 'Cost of goods', align: 'right' },
  { key: 'netProfit', label: 'Net profit', align: 'right' },
  { key: 'roi', label: 'ROI', align: 'right' },
  { key: 'realAcos', label: 'Real ACOS', align: 'right' },
]

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
  if (value === null) return '-'
  return `${value.toFixed(2)}%`
}

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <>
      {[...Array(8)].map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-slate-700/50">
          <td className="px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-700 rounded-lg"></div>
              <div>
                <div className="h-4 bg-slate-700 rounded w-28 mb-2"></div>
                <div className="h-3 bg-slate-700 rounded w-48"></div>
              </div>
            </div>
          </td>
          {[...Array(columns)].map((_, j) => (
            <td key={j} className="px-4 py-4">
              <div className="h-4 bg-slate-700 rounded w-16 ml-auto"></div>
            </td>
          ))}
          <td className="px-4 py-4">
            <div className="h-4 bg-slate-700 rounded w-12"></div>
          </td>
        </tr>
      ))}
    </>
  )
}

function ProductRow({ 
  product, 
  visibleColumns,
  isExpanded,
  onToggle
}: { 
  product: ProductProfit
  visibleColumns: string[]
  isExpanded: boolean
  onToggle: () => void
}) {
  const getCellValue = (key: string): React.ReactNode => {
    switch (key) {
      case 'unitsSold':
        return <span className="font-medium">{formatNumber(product.unitsSold)}</span>
      case 'refunds':
        return product.refunds > 0 ? (
          <span className="text-red-400 font-medium">{product.refunds}</span>
        ) : <span className="text-slate-500">-</span>
      case 'sales':
        return <span className="font-medium">{formatCurrency(product.sales)}</span>
      case 'adSpend':
        return product.adSpend > 0 ? (
          <span className="text-red-400">-{formatCurrency(product.adSpend)}</span>
        ) : <span className="text-slate-500">-</span>
      case 'cogs':
        return product.cogsTotal > 0 ? (
          <span className="text-red-400">-{formatCurrency(product.cogsTotal)}</span>
        ) : (
          <span className="text-yellow-500 text-xs">Not set</span>
        )
      case 'amazonFees':
        return <span className="text-red-400">-{formatCurrency(product.amazonFees)}</span>
      case 'netProfit':
        return (
          <span className={`font-semibold ${product.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(product.netProfit)}
          </span>
        )
      case 'roi':
        return (
          <span className={product.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatPercent(product.roi)}
          </span>
        )
      case 'realAcos':
        if (product.realAcos === null) return <span className="text-slate-500">-</span>
        return (
          <span className={product.realAcos < 100 ? 'text-emerald-400' : 'text-red-400'}>
            {formatPercent(product.realAcos)}
          </span>
        )
      case 'sessions':
        return product.sessions > 0 ? formatNumber(product.sessions) : <span className="text-slate-500">-</span>
      case 'unitSessionPct':
        return product.unitSessionPct > 0 ? formatPercent(product.unitSessionPct) : <span className="text-slate-500">-</span>
      case 'bsr':
        if (!product.bsr) return <span className="text-slate-500">-</span>
        return (
          <div className="flex items-center justify-end gap-1">
            {product.bsrChange !== undefined && (
              product.bsrChange < 0 ? (
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              ) : product.bsrChange > 0 ? (
                <TrendingDown className="w-3 h-3 text-red-400" />
              ) : null
            )}
            {formatNumber(product.bsr)}
          </div>
        )
      default:
        return <span className="text-slate-500">-</span>
    }
  }

  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors group">
      {/* Product Info */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <button 
            onClick={onToggle}
            className="text-slate-500 hover:text-white transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {product.imageUrl ? (
            <img 
              src={product.imageUrl} 
              alt={product.title}
              className="w-12 h-12 object-cover rounded-lg bg-slate-700"
            />
          ) : (
            <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center text-slate-500 text-xs">
              No img
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* Show internal name (displayName) if set, otherwise Amazon SKU */}
              <p className="font-medium text-white">{product.displayName || product.sku}</p>
              {product.asin && (
                <a
                  href={`https://www.amazon.com/dp/${product.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {/* Always show Amazon product title as subtitle */}
            <p className="text-sm text-slate-400 truncate max-w-[300px]">{product.title}</p>
          </div>
        </div>
      </td>

      {/* Dynamic Columns */}
      {visibleColumns.map((colKey) => (
        <td key={colKey} className="px-4 py-3 text-right text-sm">
          {getCellValue(colKey)}
        </td>
      ))}

      {/* More Link */}
      <td className="px-4 py-3">
        <button className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
          More
        </button>
      </td>
    </tr>
  )
}

export function ProductProfitTable({ 
  products, 
  loading, 
  visibleColumns,
  groupBy 
}: ProductProfitTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const visibleColumnDefs = allColumns.filter(col => visibleColumns.includes(col.key))

  // Calculate totals
  const totals = products.reduce((acc, p) => ({
    unitsSold: acc.unitsSold + p.unitsSold,
    refunds: acc.refunds + p.refunds,
    sales: acc.sales + p.sales,
    adSpend: acc.adSpend + p.adSpend,
    cogsTotal: acc.cogsTotal + p.cogsTotal,
    netProfit: acc.netProfit + p.netProfit,
  }), { unitsSold: 0, refunds: 0, sales: 0, adSpend: 0, cogsTotal: 0, netProfit: 0 })

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Parent / Product
            </th>
            {visibleColumnDefs.map((col) => (
              <th 
                key={col.key}
                className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Info
            </th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton columns={visibleColumns.length} />
          ) : products.length === 0 ? (
            <tr>
              <td 
                colSpan={visibleColumns.length + 2} 
                className="px-4 py-16 text-center"
              >
                <div className="text-slate-500">
                  <p className="text-lg mb-1">No data for this period</p>
                  <p className="text-sm">Try selecting a different time period</p>
                </div>
              </td>
            </tr>
          ) : (
            <>
              {products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  visibleColumns={visibleColumns}
                  isExpanded={expandedRows.has(product.id)}
                  onToggle={() => toggleRow(product.id)}
                />
              ))}
              {/* Totals Row */}
              <tr className="bg-slate-700/50 border-t-2 border-slate-600 font-semibold">
                <td className="px-4 py-3 text-white">
                  Total ({products.length} products)
                </td>
                {visibleColumns.map((colKey) => (
                  <td key={colKey} className="px-4 py-3 text-right text-sm">
                    {colKey === 'unitsSold' && formatNumber(totals.unitsSold)}
                    {colKey === 'refunds' && (totals.refunds > 0 ? <span className="text-red-400">{totals.refunds}</span> : '-')}
                    {colKey === 'sales' && formatCurrency(totals.sales)}
                    {colKey === 'adSpend' && (totals.adSpend > 0 ? <span className="text-red-400">-{formatCurrency(totals.adSpend)}</span> : '-')}
                    {colKey === 'cogs' && (totals.cogsTotal > 0 ? <span className="text-red-400">-{formatCurrency(totals.cogsTotal)}</span> : '-')}
                    {colKey === 'netProfit' && (
                      <span className={totals.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatCurrency(totals.netProfit)}
                      </span>
                    )}
                    {colKey === 'roi' && '-'}
                    {colKey === 'realAcos' && '-'}
                  </td>
                ))}
                <td className="px-4 py-3"></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
