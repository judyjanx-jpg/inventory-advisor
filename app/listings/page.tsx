'use client'

import MainLayout from '@/components/layout/MainLayout'
import { Card } from '@/components/ui/Card'
import { Store, Image, FileText, Search, Star, AlertCircle } from 'lucide-react'

export default function ListingsPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Listings</h1>
          <p className="text-[var(--muted-foreground)] mt-1">
            Manage and optimize your Amazon product listings
          </p>
        </div>

        {/* Coming Soon Card */}
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500/20 to-amber-500/20 rounded-2xl flex items-center justify-center">
              <Store className="w-8 h-8 text-orange-400" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Listings Tool Coming Soon</h2>
            <p className="text-[var(--muted-foreground)] max-w-md">
              This tool will help you manage your Amazon listings, optimize content, 
              track listing health, and improve search rankings.
            </p>
          </div>
        </Card>

        {/* Planned Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Content Optimization</p>
                <p className="text-xs text-[var(--muted-foreground)]">Titles, bullets, descriptions</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Image className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Image Management</p>
                <p className="text-xs text-[var(--muted-foreground)]">Product photos & A+ content</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <Search className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">SEO Keywords</p>
                <p className="text-xs text-[var(--muted-foreground)]">Search term optimization</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Review Tracking</p>
                <p className="text-xs text-[var(--muted-foreground)]">Ratings & feedback</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Listing Health</p>
                <p className="text-xs text-[var(--muted-foreground)]">Suppressed & issues</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <Store className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">Buy Box Status</p>
                <p className="text-xs text-[var(--muted-foreground)]">Win rate tracking</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </MainLayout>
  )
}

