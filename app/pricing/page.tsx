'use client'

import MainLayout from '@/components/layout/MainLayout'
import { Card } from '@/components/ui/Card'
import { DollarSign, TrendingUp, AlertTriangle, Target, RefreshCw } from 'lucide-react'

export default function PricingPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Pricing</h1>
          <p className="text-[var(--muted-foreground)] mt-1">
            Manage and optimize your product pricing strategies
          </p>
        </div>

        {/* Coming Soon Card */}
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-2xl flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Pricing Tool Coming Soon</h2>
            <p className="text-[var(--muted-foreground)] max-w-md">
              This tool will help you manage pricing strategies, track competitor prices, 
              and optimize your margins across all products.
            </p>
          </div>
        </Card>

        {/* Planned Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Price Trends</p>
                <p className="text-xs text-[var(--muted-foreground)]">Track historical pricing</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Price Alerts</p>
                <p className="text-xs text-[var(--muted-foreground)]">Competitor monitoring</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Margin Goals</p>
                <p className="text-xs text-[var(--muted-foreground)]">Set profit targets</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Auto-Repricing</p>
                <p className="text-xs text-[var(--muted-foreground)]">Dynamic adjustments</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

