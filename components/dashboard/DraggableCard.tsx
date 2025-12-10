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
  const [currentHeight, setCurrentHeight] = useState<number | null>(height ?? null)
  const [isDraggingResize, setIsDraggingResize] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)

  // Sync height prop with state
  useEffect(() => {
    if (height !== undefined && height !== currentHeight) {
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

  // Handle resize mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const deltaY = e.clientY - startYRef.current
    const newHeight = Math.max(150, startHeightRef.current + deltaY)
    setCurrentHeight(newHeight)
  }, [])

  // Handle resize mouse up
  const handleMouseUp = useCallback(() => {
    setIsDraggingResize(false)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    
    // Save the final height
    if (cardRef.current && onHeightChange) {
      onHeightChange(currentHeight)
    }
  }, [currentHeight, onHeightChange, handleMouseMove])

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    setIsDraggingResize(true)
    startYRef.current = e.clientY
    startHeightRef.current = cardRef.current?.offsetHeight || 300
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }, [handleMouseMove, handleMouseUp])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const toggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCollapsedChange?.(!isCollapsed)
  }

  const resetHeight = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentHeight(null)
    onHeightChange?.(null)
  }

  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDraggingResize ? 'none' : transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const cardStyle: React.CSSProperties = {
    height: isCollapsed ? '52px' : (currentHeight ? `${currentHeight}px` : 'auto'),
    minHeight: isCollapsed ? '52px' : '150px',
    overflow: 'hidden',
  }

  return (
    <div 
      ref={setNodeRef}
      style={wrapperStyle}
      className={`relative ${isDragging ? 'z-50' : ''}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className="relative group"
      >
        {/* Drag Handle - Top Center */}
        <div 
          {...attributes}
          {...listeners}
          className="absolute top-0 left-1/2 -translate-x-1/2 h-6 px-4 flex items-center justify-center cursor-grab active:cursor-grabbing z-30 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] shadow-sm">
            <GripVertical className="w-3 h-3 text-[var(--muted-foreground)]" />
            <span className="text-[10px] text-[var(--muted-foreground)]">drag</span>
          </div>
        </div>

        {/* Control Buttons - Top Right */}
        <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
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
        <div className={`h-full ${isCollapsed ? 'pointer-events-none' : 'overflow-auto'}`}>
          {children}
        </div>

        {/* Resize Handle - Bottom */}
        {!isCollapsed && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute bottom-0 left-0 right-0 h-5 cursor-ns-resize flex items-center justify-center z-30"
            style={{ background: 'transparent' }}
          >
            <div 
              className={`w-20 h-1.5 rounded-full transition-all ${
                isDraggingResize 
                  ? 'bg-[var(--primary)] scale-110' 
                  : 'bg-[var(--border)] group-hover:bg-[var(--primary)]'
              }`} 
            />
          </div>
        )}
      </div>
    </div>
  )
}
