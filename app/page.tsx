import Link from 'next/link'
import { Sparkles, Package, BarChart3, MessageSquare, ArrowRight, Zap, Globe, TrendingUp } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-cyan-500/20 rounded-full blur-3xl opacity-20" />
        
        <div className="relative max-w-6xl mx-auto px-6 py-24">
          <div className="text-center">
            {/* Logo */}
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl mb-8 shadow-lg shadow-cyan-500/25">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Inventory{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Advisor
              </span>
            </h1>
            
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12">
              AI-Powered Inventory Management for Amazon FBA Sellers. 
              Optimize stock levels, automate reorders, and maximize profits.
            </p>
            
            <div className="flex items-center justify-center gap-4">
              <Link 
                href="/dashboard" 
                className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-500/25 transition-all"
              >
                Go to Dashboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link 
                href="/setup" 
                className="inline-flex items-center px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl border border-slate-700 transition-all"
              >
                Setup Wizard
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Products */}
          <Link href="/products" className="group">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 hover:border-cyan-500/50 transition-all hover:shadow-lg hover:shadow-cyan-500/5">
              <div className="w-14 h-14 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Package className="w-7 h-7 text-cyan-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">Products</h2>
              <p className="text-slate-400 mb-4">
                Manage your product catalog with multi-channel SKU mapping and supplier tracking.
              </p>
              <span className="text-cyan-400 flex items-center text-sm font-medium group-hover:gap-2 transition-all">
                View Products <ArrowRight className="w-4 h-4 ml-1" />
              </span>
            </div>
          </Link>
          
          {/* Dashboard */}
          <Link href="/dashboard" className="group">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 hover:border-emerald-500/50 transition-all hover:shadow-lg hover:shadow-emerald-500/5">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">Dashboard</h2>
              <p className="text-slate-400 mb-4">
                Real-time profit tracking, inventory insights, and business performance metrics.
              </p>
              <span className="text-emerald-400 flex items-center text-sm font-medium group-hover:gap-2 transition-all">
                View Dashboard <ArrowRight className="w-4 h-4 ml-1" />
              </span>
            </div>
          </Link>
          
          {/* AI Advisor */}
          <Link href="/advisor" className="group">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 hover:border-purple-500/50 transition-all hover:shadow-lg hover:shadow-purple-500/5">
              <div className="w-14 h-14 bg-purple-500/20 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-7 h-7 text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">AI Advisor</h2>
              <p className="text-slate-400 mb-4">
                Get intelligent recommendations, automate workflows, and optimize your operations.
              </p>
              <span className="text-purple-400 flex items-center text-sm font-medium group-hover:gap-2 transition-all">
                Chat with Advisor <ArrowRight className="w-4 h-4 ml-1" />
              </span>
            </div>
          </Link>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="max-w-6xl mx-auto px-6 py-16 border-t border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="text-center">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Globe className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Multi-Channel</h3>
            <p className="text-slate-400 text-sm">
              Track inventory across Amazon US, UK, CA, and more from one dashboard.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Smart Forecasting</h3>
            <p className="text-slate-400 text-sm">
              AI-powered demand forecasting with seasonality and trend analysis.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Automation</h3>
            <p className="text-slate-400 text-sm">
              Automate PO creation, reorder alerts, and inventory workflows.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-slate-500 text-sm">
          <p>Inventory Advisor • Built for Amazon FBA Sellers</p>
        </div>
      </footer>
    </main>
  )
}
