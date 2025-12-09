'use client'

interface ProgressTimelineProps {
  status: string
  createdDate: string
  orderDate?: string | null
  confirmedDate?: string | null
  shippedDate?: string | null
  receivedDate?: string | null
  expectedDate?: string | null
  compact?: boolean
}

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const daysBetween = (date1: Date, date2: Date): number => {
  return Math.ceil((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24))
}

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ProgressTimeline({
  status,
  createdDate,
  orderDate,
  confirmedDate,
  shippedDate,
  receivedDate,
  expectedDate,
  compact = false,
}: ProgressTimelineProps) {
  // Use orderDate for display, but createdDate for calculations (if orderDate not set)
  const displayDate = orderDate || createdDate
  const created = new Date(displayDate)
  const expected = expectedDate ? new Date(expectedDate) : null
  const now = new Date()
  
  const totalDays = expected ? daysBetween(created, expected) : null
  const daysPassed = daysBetween(created, now)
  const daysUntilExpected = expected ? daysBetween(now, expected) : null
  const isOverdue = daysUntilExpected !== null && daysUntilExpected < 0 && status !== 'received'
  const daysOverdue = isOverdue ? Math.abs(daysUntilExpected!) : 0

  const statusOrder = ['draft', 'sent', 'confirmed', 'shipped', 'received']
  const currentStatusIndex = statusOrder.indexOf(status)

  // Calculate progress percentage
  let progressPercent = 0
  if (status === 'received') {
    progressPercent = 100
  } else if (isOverdue && totalDays) {
    const overdueExtra = Math.min(30, (daysOverdue / totalDays) * 100)
    progressPercent = 100 + overdueExtra
  } else if (status === 'shipped' && totalDays) {
    progressPercent = 75 + (daysPassed / totalDays) * 20
  } else if (status === 'confirmed' && totalDays) {
    progressPercent = Math.min(75, 20 + (daysPassed / totalDays) * 55)
  } else if (status === 'sent') {
    progressPercent = 15
  } else {
    progressPercent = 5
  }

  // Calculate weeks
  const weeksTotal = totalDays ? Math.ceil(totalDays / 7) : 0
  const weeksToShow = Math.min(weeksTotal, 6)

  if (compact) {
    // Build compact markers
    const compactMarkers: Array<{
      label: string
      position: number
      reached: boolean
      isWeek?: boolean
      isGoal?: boolean
    }> = [
      { label: 'Created', position: 0, reached: true }
    ]

    for (let w = 1; w <= weeksToShow; w++) {
      const weekPosition = (w / weeksTotal) * 85
      const weekDate = addDays(created, w * 7)
      const weekReached = weekDate <= now && currentStatusIndex >= 2
      compactMarkers.push({
        label: `W${w}`,
        position: weekPosition,
        reached: weekReached,
        isWeek: true
      })
    }

    compactMarkers.push({
      label: 'Goal',
      position: 85,
      reached: status === 'received',
      isGoal: true
    })

    return (
      <div className="pb-4">
        {/* Header row */}
        <div className="flex items-center justify-between text-xs mb-3">
          <span className="text-slate-400">Progress</span>
          {status === 'received' ? (
            <span className="text-emerald-400 font-medium">✓ Received</span>
          ) : isOverdue ? (
            <span className="text-red-400 font-medium">{daysOverdue}d overdue</span>
          ) : daysUntilExpected !== null ? (
            <span className="text-cyan-400 font-medium">Arriving in {daysUntilExpected}d</span>
          ) : (
            <span className="text-slate-400">In progress</span>
          )}
        </div>
        
        {/* Progress bar with markers */}
        <div className="relative h-10">
          {/* Background track */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-700 rounded-full" />
          
          {/* Progress fill */}
          <div 
            className="absolute top-0 left-0 h-1.5 bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(progressPercent, 85)}%` }}
          />
          
          {/* Overdue extension */}
          {isOverdue && (
            <div 
              className="absolute top-0 h-1.5 bg-gradient-to-r from-red-500 to-red-400 rounded-r-full transition-all duration-500"
              style={{ 
                left: '85%',
                width: `${Math.min(progressPercent - 85, 15)}%`
              }}
            />
          )}

          {/* Markers */}
          {compactMarkers.map((marker, i) => (
            <div 
              key={i}
              className="absolute flex flex-col items-center"
              style={{ 
                left: `${marker.position}%`,
                top: marker.isWeek ? '0px' : '-2px',
                transform: 'translateX(-50%)'
              }}
            >
              <div 
                className={`
                  rounded-full border-2 transition-all
                  ${marker.isWeek ? 'w-1.5 h-1.5' : marker.isGoal ? 'w-3 h-3' : 'w-2.5 h-2.5'}
                  ${marker.reached
                    ? marker.isGoal && isOverdue
                      ? 'bg-amber-400 border-amber-400 shadow-md shadow-amber-400/50'
                      : marker.isGoal
                        ? 'bg-emerald-400 border-emerald-400 shadow-md shadow-emerald-400/50'
                        : 'bg-cyan-400 border-cyan-400'
                    : 'bg-slate-800 border-slate-600'
                  }
                `}
              />
              <span className={`text-[9px] mt-2 whitespace-nowrap ${
                marker.reached ? 'text-slate-300' : 'text-slate-500'
              } ${marker.isGoal ? 'font-semibold' : ''}`}>
                {marker.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Full timeline view - build stages array
  const stages: Array<{
    key: string
    label: string
    date?: string | null
    reached: boolean
    position: number
    isWeek?: boolean
    isGoal?: boolean
  }> = [
    { key: 'created', label: 'Created', date: displayDate, reached: true, position: 2 },
    { key: 'confirmed', label: 'Confirmed', date: confirmedDate, reached: currentStatusIndex >= 2, position: 14 },
  ]

  // Add week markers between confirmed and shipped
  for (let w = 1; w <= weeksToShow; w++) {
    const weekPosition = 14 + (w / (weeksToShow + 1)) * 50
    const weekDate = addDays(created, w * 7)
    const weekReached = weekDate <= now && currentStatusIndex >= 2
    stages.push({ 
      key: `week${w}`, 
      label: `Week ${w}`, 
      date: weekDate.toISOString().split('T')[0], 
      reached: weekReached, 
      isWeek: true,
      position: weekPosition
    })
  }

  stages.push({ 
    key: 'shipped', 
    label: 'Shipped', 
    date: shippedDate, 
    reached: currentStatusIndex >= 3, 
    position: 70 
  })
  
  stages.push({ 
    key: 'goal', 
    label: 'Goal', 
    date: expectedDate, 
    reached: status === 'received', 
    isGoal: true, 
    position: 88 
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {totalDays !== null && (
          <span className="text-sm text-slate-400">{totalDays} days total</span>
        )}
        <div className="flex-1" />
        {status === 'received' ? (
          <span className="text-sm font-medium text-emerald-400">✓ Received</span>
        ) : isOverdue ? (
          <span className="text-sm font-medium text-red-400">{daysOverdue} days overdue</span>
        ) : daysUntilExpected !== null ? (
          <span className="text-sm font-medium text-cyan-400">{daysUntilExpected} days remaining</span>
        ) : (
          <span className="text-sm text-slate-400">In progress</span>
        )}
      </div>

      {/* Timeline container - fixed height */}
      <div className="relative h-16 mx-2">
        {/* Background line */}
        <div className="absolute top-2 left-0 right-0 h-1 bg-slate-700 rounded-full" />
        
        {/* Progress fill */}
        <div 
          className="absolute top-2 left-0 h-1 bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(progressPercent, 88)}%` }}
        />
        
        {/* Overdue extension past goal */}
        {isOverdue && (
          <div 
            className="absolute top-2 h-1 bg-gradient-to-r from-red-500 to-red-400 rounded-r-full transition-all duration-500"
            style={{ 
              left: '88%',
              width: `${Math.min(progressPercent - 88, 12)}%`
            }}
          />
        )}

        {/* Stage markers - all absolutely positioned */}
        {stages.map((stage) => (
          <div 
            key={stage.key}
            className="absolute flex flex-col items-center"
            style={{ 
              left: `${stage.position}%`,
              transform: 'translateX(-50%)'
            }}
          >
            {/* Dot */}
            <div
              className={`
                rounded-full border-2 transition-all
                ${stage.isWeek 
                  ? 'w-2 h-2 mt-1' 
                  : stage.isGoal 
                    ? 'w-4 h-4 -mt-0.5 border-[2.5px]' 
                    : 'w-3 h-3 mt-0.5'
                }
                ${stage.reached
                  ? stage.isGoal && isOverdue
                    ? 'bg-amber-400 border-amber-400 shadow-lg shadow-amber-400/50'
                    : stage.isGoal
                      ? 'bg-emerald-400 border-emerald-400 shadow-lg shadow-emerald-400/50'
                      : 'bg-cyan-400 border-cyan-400'
                  : 'bg-slate-800 border-slate-600'
                }
              `}
            />
            
            {/* Label */}
            <span className={`text-[10px] mt-2 whitespace-nowrap ${
              stage.isWeek ? 'text-slate-500' : stage.reached ? 'text-slate-200 font-medium' : 'text-slate-500'
            } ${stage.isGoal && !stage.isWeek ? 'font-semibold' : ''}`}>
              {stage.label}
            </span>
            
            {/* Date (only for key stages, not weeks) */}
            {stage.date && !stage.isWeek && (
              <span className="text-[9px] text-slate-500 whitespace-nowrap">
                {formatDate(stage.date)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
