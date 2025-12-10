'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ChevronUp, ChevronDown, Maximize2, Minimize2 } from 'lucide-react'

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
  const [isResizing, setIsResizing] = useState(false)
  const [currentHeight, setCurrentHeight] = useState<number | null>(height || null)
  const cardRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const startHeight = useRef(0)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    height: isCollapsed ? '48px' : (currentHeight ? `${currentHeight}px` : 'auto'),
    minHeight: isCollapsed ? '48px' : '120px',
    overflow: isCollapsed ? 'hidden' : 'visible',
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startY.current = e.clientY
    startHeight.current = cardRef.current?.offsetHeight || 300
    
    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
  }

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing) return
    const deltaY = e.clientY - startY.current
    const newHeight = Math.max(120, startHeight.current + deltaY)
    setCurrentHeight(newHeight)
  }

  const handleResizeEnd = () => {
    setIsResizing(false)
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', handleResizeEnd)
    
    if (onHeightChange && currentHeight) {
      onHeightChange(currentHeight)
    }
  }

  const toggleCollapse = () => {
    const newCollapsed = !isCollapsed
    onCollapsedChange?.(newCollapsed)
  }

  const resetHeight = () => {
    setCurrentHeight(null)
    onHeightChange?.(null)
  }

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [])

  return (
    <div 
      ref={(node) => {
        setNodeRef(node)
        if (node) (cardRef as any).current = node
      }}
      style={style}
      className={`relative group ${isDragging ? 'z-50' : ''} ${isResizing ? 'select-none' : ''}`}
    >
      {/* Drag Handle - Top Bar */}
      <div 
        {...attributes}
        {...listeners}
        className="absolute top-0 left-0 right-0 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--muted)]/80 backdrop-blur-sm">
          <GripVertical className="w-4 h-4 text-[var(--muted-foreground)]" />
          <span className="text-xs text-[var(--muted-foreground)]">Drag to move</span>
        </div>
      </div>

      {/* Control Buttons - Top Right */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={toggleCollapse}
          className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        {currentHeight && (
          <button
            onClick={resetHeight}
            className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            title="Reset size"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Card Content */}
      <div className={`h-full ${isCollapsed ? 'overflow-hidden' : ''}`}>
        {children}
      </div>

      {/* Resize Handle - Bottom */}
      {!isCollapsed && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="w-12 h-1 rounded-full bg-[var(--muted-foreground)]/50 hover:bg-[var(--primary)]" />
        </div>
      )}
    </div>
  )
}

