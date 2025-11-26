'use client'

import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, StatCard } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { 
  TrendingUp, 
  DollarSign, 
  Percent, 
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from 'lucide-react'

export default function ProfitsPage() {
  // Mock data - would come from API
  const stats = {
    revenue: 125000,
    profit: 45000,
    margin: 36,
    fees: 18750,
    cogs: 61250,
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Profits</h1>
            <p className="text-slate-400 mt-1">Track profitability and margins</p>
          </div>
          <div className="flex items-center gap-3">
            <select className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500">
              <option>Last 30 Days</option>
              <option>Last 7 Days</option>
              <option>Last 90 Days</option>
              <option>This Year</option>
            </select>
            <Button variant="outline">
              <Calendar className="w-4 h-4 mr-2" />
              Custom Range
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Revenue"
            value={formatCurrency(stats.revenue)}
            change="+12.5% from last period"
            changeType="positive"
            icon={<DollarSign className="w-6 h-6 text-emerald-400" />}
            iconBg="bg-emerald-500/20"
          />
          <StatCard
            title="Net Profit"
            value={formatCurrency(stats.profit)}
            change="+8.3% from last period"
            changeType="positive"
            icon={<TrendingUp className="w-6 h-6 text-cyan-400" />}
            iconBg="bg-cyan-500/20"
          />
          <StatCard
            title="Profit Margin"
            value={`${stats.margin}%`}
            change="Industry avg: 30%"
            changeType="neutral"
            icon={<Percent className="w-6 h-6 text-blue-400" />}
            iconBg="bg-blue-500/20"
          />
          <StatCard
            title="Amazon Fees"
            value={formatCurrency(stats.fees)}
            change="15% of revenue"
            changeType="neutral"
            icon={<ArrowDownRight className="w-6 h-6 text-red-400" />}
            iconBg="bg-red-500/20"
          />
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profit Breakdown</CardTitle>
              <CardDescription>Where your money goes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Revenue</span>
                  <span className="text-white font-semibold">{formatCurrency(stats.revenue)}</span>
                </div>
                <div className="flex items-center justify-between text-red-400">
                  <span>− COGS</span>
                  <span>{formatCurrency(stats.cogs)}</span>
                </div>
                <div className="flex items-center justify-between text-red-400">
                  <span>− Amazon Fees</span>
                  <span>{formatCurrency(stats.fees)}</span>
                </div>
                <div className="border-t border-slate-700 pt-4 flex items-center justify-between">
                  <span className="text-white font-semibold">Net Profit</span>
                  <span className="text-emerald-400 font-bold text-xl">{formatCurrency(stats.profit)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Profitable Products</CardTitle>
              <CardDescription>Best performing SKUs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Connect Amazon to see profit data</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.href = '/settings/amazon'}>
                  Connect Amazon
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}
