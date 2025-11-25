'use client'

import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { 
  BarChart3, 
  Download, 
  FileText, 
  TrendingUp, 
  Package, 
  DollarSign,
  Calendar
} from 'lucide-react'

const REPORTS = [
  {
    id: 'profit-loss',
    name: 'Profit & Loss',
    description: 'Revenue, costs, and profit breakdown',
    icon: DollarSign,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
  },
  {
    id: 'inventory',
    name: 'Inventory Report',
    description: 'Stock levels, velocity, and forecasting',
    icon: Package,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
  },
  {
    id: 'sales',
    name: 'Sales Report',
    description: 'Orders, units sold, and trends',
    icon: TrendingUp,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  {
    id: 'sku-performance',
    name: 'SKU Performance',
    description: 'Product-level performance metrics',
    icon: BarChart3,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
  },
]

export default function ReportsPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Reports</h1>
            <p className="text-slate-400 mt-1">Generate and export business reports</p>
          </div>
          <div className="flex items-center gap-3">
            <select className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500">
              <option>Last 30 Days</option>
              <option>Last 7 Days</option>
              <option>Last 90 Days</option>
              <option>This Year</option>
            </select>
          </div>
        </div>

        {/* Report Types */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {REPORTS.map((report) => {
            const Icon = report.icon
            return (
              <Card key={report.id} hover>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 ${report.bgColor} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-6 h-6 ${report.color}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white">{report.name}</h3>
                      <p className="text-sm text-slate-400 mt-1">{report.description}</p>
                      <div className="flex items-center gap-3 mt-4">
                        <Button variant="outline" size="sm">
                          <FileText className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="w-4 h-4 mr-1" />
                          Export
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Scheduled Reports */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Scheduled Reports</CardTitle>
                <CardDescription>Automated report generation</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Calendar className="w-4 h-4 mr-2" />
                Schedule Report
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No scheduled reports</p>
              <p className="text-sm text-slate-500 mt-1">Set up automatic report generation</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
