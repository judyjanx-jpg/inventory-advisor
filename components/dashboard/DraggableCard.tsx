'use client'

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ChevronUp, ChevronDown, Minimize2 } from 'lucide-react'

interface DraggableCardProps {
  id: string
  children: ReactNode
  height?: number | null
  isCollapsed?: boolean
  onHeightChange?: (height: number | null) => void
  onCollapsedChange?: (collapsed: boolean) => void
}

export default function DraggableCard({ 
  id, 
  children, 
  height,
  isCollapsed = false,
  onHeightChange,
  onCollapsedChange
}: DraggableCardProps) {
  const [currentHeight, setCurrentHeight] = useState<number | null>(height || null)
  const cardRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)

  // Sync height prop with state
  useEffect(() => {
    if (height !== undefined) {
      setCurrentHeight(height)
    }
  }, [height])

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isResizingRef.current ? 'none' : transition,
    opacity: isDragging ? 0.5 : 1,
    height: isCollapsed ? '52px' : (currentHeight ? `${currentHeight}px` : 'auto'),
    minHeight: isCollapsed ? '52px' : '150px',
  }

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isResizingRef.current = true
    startY.current = e.clientY
    startHeight.current = cardRef.current?.offsetHeight || 300
    
    const handleMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      const deltaY = e.clientY - startY.current
      const newHeight = Math.max(150, startHeight.current + deltaY)
      setCurrentHeight(newHeight)
    }

    const handleUp = () => {
      isResizingRef.current = false
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      
      // Save the height
      if (cardRef.current) {
        const finalHeight = cardRef.current.offsetHeight
        onHeightChange?.(finalHeight)
      }
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }, [onHeightChange])

  const toggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCollapsedChange?.(!isCollapsed)
  }

  const resetHeight = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentHeight(null)
    onHeightChange?.(null)
  }

  return (
    <div 
      ref={(node) => {
        setNodeRef(node)
        ;(cardRef as any).current = node
      }}
      style={style}
      className={`relative group ${isDragging ? 'z-50' : ''}`}
    >
      {/* Drag Handle - Top Center */}
      <div 
        {...attributes}
        {...listeners}
        className="absolute top-0 left-1/2 -translate-x-1/2 h-6 px-4 flex items-center justify-center cursor-grab active:cursor-grabbing z-20 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] shadow-sm">
          <GripVertical className="w-3 h-3 text-[var(--muted-foreground)]" />
          <span className="text-[10px] text-[var(--muted-foreground)]">drag</span>
        </div>
      </div>

      {/* Control Buttons - Top Right */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <button
          onClick={toggleCollapse}
          className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        {currentHeight && !isCollapsed && (
          <button
            onClick={resetHeight}
            className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="Reset to auto height"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Card Content */}
      <div className={`h-full overflow-hidden ${isCollapsed ? 'pointer-events-none' : ''}`}>
        {children}
      </div>

      {/* Resize Handle - Bottom */}
      {!isCollapsed && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute -bottom-1 left-0 right-0 h-4 cursor-ns-resize flex items-center justify-center z-20 group/resize"
        >
          <div className="w-16 h-1.5 rounded-full bg-[var(--border)] group-hover/resize:bg-[var(--primary)] transition-colors opacity-0 group-hover:opacity-100" />
        </div>
      )}
    </div>
  )
}
