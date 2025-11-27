'use client'

import Link from 'next/link'
import MainLayout from '@/components/layout/MainLayout'
import { Card, CardContent } from '@/components/ui/Card'
import { 
  Settings, 
  Package, 
  Bell, 
  Users, 
  Shield, 
  Database,
  ChevronRight
} from 'lucide-react'

const SETTINGS_SECTIONS = [
  {
    id: 'amazon',
    name: 'Amazon SP-API',
    description: 'Connect and manage your Amazon seller account',
    icon: '📦',
    href: '/settings/amazon',
    status: 'Configure',
  },
  {
    id: 'transparency',
    name: 'Transparency API',
    description: 'Amazon Transparency codes for product labels',
    icon: '🔐',
    href: '/settings/transparency',
    status: 'Configure',
  },
  {
    id: 'display',
    name: 'Display Options',
    description: 'Customize how products and data are shown',
    icon: '🖥️',
    href: '/settings/display',
    status: 'Configure',
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Configure alerts and notification preferences',
    icon: Bell,
    href: '/settings/notifications',
    status: 'Coming soon',
    disabled: true,
  },
  {
    id: 'users',
    name: 'Team & Users',
    description: 'Manage team members and permissions',
    icon: Users,
    href: '/settings/users',
    status: 'Coming soon',
    disabled: true,
  },
  {
    id: 'business',
    name: 'Business Profile',
    description: 'Your business settings and preferences',
    icon: Settings,
    href: '/settings/business',
    status: 'Coming soon',
    disabled: true,
  },
  {
    id: 'data',
    name: 'Data & Backup',
    description: 'Export data and manage backups',
    icon: Database,
    href: '/settings/data',
    status: 'Coming soon',
    disabled: true,
  },
]

export default function SettingsPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 mt-1">Manage your account and integrations</p>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = typeof section.icon === 'string' ? null : section.icon
            const content = (
              <Card hover={!section.disabled} className={section.disabled ? 'opacity-60' : ''}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                      {Icon ? (
                        <Icon className="w-6 h-6 text-slate-400" />
                      ) : (
                        <span className="text-2xl">{section.icon}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{section.name}</h3>
                        {section.disabled && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-400">
                            {section.status}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 mt-1">{section.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500" />
                  </div>
                </CardContent>
              </Card>
            )

            if (section.disabled) {
              return <div key={section.id}>{content}</div>
            }

            return (
              <Link key={section.id} href={section.href}>
                {content}
              </Link>
            )
          })}
        </div>

        {/* Database Info */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <Database className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Database Status</h3>
                <p className="text-sm text-slate-400 mt-1">PostgreSQL • Connected</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-sm text-emerald-400">Online</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
