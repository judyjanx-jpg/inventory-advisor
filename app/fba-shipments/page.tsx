'use client'

import MainLayout from '@/components/layout/MainLayout'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Truck, Plus, Package, Clock, CheckCircle } from 'lucide-react'

export default function FbaShipmentsPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">FBA Shipments</h1>
            <p className="text-slate-400 mt-1">Manage shipments to Amazon fulfillment centers</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Shipment
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Package className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">0</p>
                  <p className="text-sm text-slate-400">Working</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Truck className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">0</p>
                  <p className="text-sm text-slate-400">In Transit</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">0</p>
                  <p className="text-sm text-slate-400">Receiving</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">0</p>
                  <p className="text-sm text-slate-400">Closed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Empty State */}
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Truck className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-lg text-slate-400">No FBA shipments yet</p>
              <p className="text-sm text-slate-500 mt-1">Create a shipment to send inventory to Amazon FBA</p>
              <Button className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Create Shipment
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
