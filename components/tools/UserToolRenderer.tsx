'use client'

import DataCardTool from './DataCardTool'
import NotepadTool from './NotepadTool'
import ChartTool from './ChartTool'
import QuickActionTool from './QuickActionTool'
import FilteredListTool from './FilteredListTool'
import GrowthTrackerTool from './GrowthTrackerTool'

interface UserTool {
  id: number
  toolType: string
  title: string
  config: any
  size: string
  isActive: boolean
}

interface UserToolRendererProps {
  tool: UserTool
}

export default function UserToolRenderer({ tool }: UserToolRendererProps) {
  switch (tool.toolType) {
    case 'data_card':
      return <DataCardTool tool={tool} />
    case 'notepad':
      return <NotepadTool tool={tool} />
    case 'chart':
      return <ChartTool tool={tool} />
    case 'quick_action':
      return <QuickActionTool tool={tool} />
    case 'filtered_list':
      return <FilteredListTool tool={tool} />
    case 'growth_tracker':
      return <GrowthTrackerTool tool={tool} />
    default:
      return (
        <div className="p-4 bg-[var(--muted)]/30 rounded-xl border border-[var(--border)]">
          <p className="text-[var(--muted-foreground)] text-sm">
            Unknown tool type: {tool.toolType}
          </p>
        </div>
      )
  }
}

