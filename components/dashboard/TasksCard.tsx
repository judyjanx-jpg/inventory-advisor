'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { 
  ClipboardList, 
  ShoppingCart, 
  PackageX, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mail,
  Truck,
  Package
} from 'lucide-react'
import Link from 'next/link'

interface TaskItem {
  sku?: string
  title?: string
  quantity?: number
  poNumber?: string
  supplier?: string
  supplierEmail?: string
  daysLate?: number
}

interface TasksData {
  itemsToOrder: { count: number; nextDate: string | null; items: TaskItem[] }
  itemsToShip: { count: number; nextDate: string | null; items: TaskItem[] }
  outOfStock: { count: number; items: TaskItem[] }
  lateShipments: { count: number; items: TaskItem[] }
}

interface TasksCardProps {
  tasks?: TasksData
  onRefresh?: () => void
}

export default function TasksCard({ tasks, onRefresh }: TasksCardProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const formatNextDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const today = new Date()
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'tomorrow'
    
    return `by ${date.toLocaleDateString('en-US', { weekday: 'long' })}`
  }

  const openEmailClient = (email: string, poNumber: string) => {
    const subject = encodeURIComponent(`Following up on PO #${poNumber}`)
    const body = encodeURIComponent(`Hi,\n\nI wanted to follow up on Purchase Order #${poNumber}.\n\nCould you please provide an update on the expected delivery date?\n\nThank you!`)
    window.open(`mailto:${email}?subject=${subject}&body=${body}`)
  }

  const taskSections = [
    {
      id: 'order',
      icon: ShoppingCart,
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      label: tasks?.itemsToOrder?.count 
        ? `${tasks.itemsToOrder.count} item${tasks.itemsToOrder.count > 1 ? 's' : ''} to order`
        : 'No items to order',
      sublabel: tasks?.itemsToOrder?.nextDate 
        ? formatNextDate(tasks.itemsToOrder.nextDate)
        : null,
      count: tasks?.itemsToOrder?.count || 0,
      items: tasks?.itemsToOrder?.items || [],
      action: { label: 'View All', href: '/purchase-orders' }
    },
    {
      id: 'ship',
      icon: Truck,
      iconBg: 'bg-purple-500/20',
      iconColor: 'text-purple-400',
      label: tasks?.itemsToShip?.count
        ? `${tasks.itemsToShip.count} item${tasks.itemsToShip.count > 1 ? 's' : ''} to ship`
        : 'No items to ship',
      sublabel: tasks?.itemsToShip?.nextDate
        ? formatNextDate(tasks.itemsToShip.nextDate)
        : null,
      count: tasks?.itemsToShip?.count || 0,
      items: tasks?.itemsToShip?.items || [],
      action: { label: 'View All', href: '/fba-shipments' }
    },
    {
      id: 'outOfStock',
      icon: PackageX,
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-400',
      label: tasks?.outOfStock?.count
        ? `${tasks.outOfStock.count} item${tasks.outOfStock.count > 1 ? 's' : ''} out of stock`
        : 'All items in stock',
      sublabel: tasks?.outOfStock?.count ? 'needs attention' : null,
      count: tasks?.outOfStock?.count || 0,
      items: tasks?.outOfStock?.items || [],
      action: { label: 'View All', href: '/inventory?filter=outOfStock' }
    },
    {
      id: 'late',
      icon: AlertTriangle,
      iconBg: 'bg-orange-500/20',
      iconColor: 'text-orange-400',
      label: tasks?.lateShipments?.count
        ? `${tasks.lateShipments.count} late shipment${tasks.lateShipments.count > 1 ? 's' : ''}`
        : 'No late shipments',
      sublabel: null,
      count: tasks?.lateShipments?.count || 0,
      items: tasks?.lateShipments?.items || [],
      action: { label: 'View All', href: '/purchase-orders?filter=late' },
      showEmail: true
    }
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[var(--primary)]" />
          Today's Tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {taskSections.map((section) => {
          const Icon = section.icon
          const isExpanded = expandedSection === section.id
          const hasItems = section.count > 0

          return (
            <div key={section.id}>
              {/* Task Row */}
              <button
                onClick={() => hasItems && toggleSection(section.id)}
                disabled={!hasItems}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                  hasItems 
                    ? 'hover:bg-[var(--hover-bg)] cursor-pointer' 
                    : 'opacity-60 cursor-default'
                }`}
              >
                <div className={`w-10 h-10 ${section.iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${section.iconColor}`} />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-[var(--foreground)]">
                    {section.label}
                  </div>
                  {section.sublabel && (
                    <div className="text-sm text-[var(--muted-foreground)]">
                      {section.sublabel}
                    </div>
                  )}
                </div>
                {hasItems && (
                  isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-[var(--muted-foreground)]" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" />
                  )
                )}
              </button>

              {/* Expanded Items */}
              {isExpanded && section.items.length > 0 && (
                <div className="ml-13 pl-3 border-l-2 border-[var(--border)] mt-2 mb-3 space-y-2">
                  {section.items.slice(0, 5).map((item, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between p-2 rounded-lg bg-[var(--muted)]/30"
                    >
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-[var(--muted-foreground)]" />
                        <span className="text-sm font-medium text-[var(--foreground)]">
                          {item.sku || item.poNumber}
                        </span>
                        {item.supplier && (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            • {item.supplier}
                          </span>
                        )}
                        {item.daysLate && (
                          <span className="text-xs text-orange-400">
                            • {item.daysLate} day{item.daysLate > 1 ? 's' : ''} late
                          </span>
                        )}
                      </div>
                      {section.showEmail && item.supplierEmail && item.poNumber && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openEmailClient(item.supplierEmail!, item.poNumber!)
                          }}
                          className="p-1.5 rounded-lg hover:bg-[var(--primary)]/20 text-[var(--primary)] transition-colors"
                          title="Send follow-up email"
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {section.items.length > 5 && (
                    <Link 
                      href={section.action.href}
                      className="flex items-center gap-1 text-sm text-[var(--primary)] hover:underline p-2"
                    >
                      View all {section.items.length} items
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

