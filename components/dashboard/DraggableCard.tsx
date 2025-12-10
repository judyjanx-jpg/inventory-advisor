'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ChevronUp, ChevronDown, Minimize2, EyeOff } from 'lucide-react'

interface DraggableCardProps {
  id: string
  children: ReactNode
  height?: number | null
  isCollapsed?: boolean
  onHeightChange?: (height: number | null) => void
  onCollapsedChange?: (collapsed: boolean) => void
  onHide?: () => void
}

export default function DraggableCard({ 
  id, 
  children, 
  height,
  isCollapsed = false,
  onHeightChange,
  onCollapsedChange,
  onHide
}: DraggableCardProps) {
  const [currentHeight, setCurrentHeight] = useState<number | null>(height ?? null)
  const [isResizing, setIsResizing] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  
  // Store values in refs to avoid stale closures
  const resizeDataRef = useRef({
    startY: 0,
    startHeight: 0,
    isResizing: false,
    latestHeight: height ?? null as number | null
  })

  // Sync height prop with state on mount
  useEffect(() => {
    if (height !== undefined) {
      setCurrentHeight(height)
      resizeDataRef.current.latestHeight = height
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

  // Set up global mouse event listeners
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!resizeDataRef.current.isResizing) return
      
      const deltaY = e.clientY - resizeDataRef.current.startY
      const newHeight = Math.max(150, resizeDataRef.current.startHeight + deltaY)
      
      // Update the DOM directly for immediate feedback
      if (cardRef.current) {
        cardRef.current.style.height = `${newHeight}px`
      }
      resizeDataRef.current.latestHeight = newHeight
    }

    const handleGlobalMouseUp = () => {
      if (!resizeDataRef.current.isResizing) return
      
      resizeDataRef.current.isResizing = false
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      
      // Update React state and save
      const finalHeight = resizeDataRef.current.latestHeight
      setCurrentHeight(finalHeight)
      onHeightChange?.(finalHeight)
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [onHeightChange])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const startHeight = cardRef.current?.offsetHeight || 300
    
    resizeDataRef.current = {
      startY: e.clientY,
      startHeight: startHeight,
      isResizing: true,
      latestHeight: startHeight
    }
    
    setIsResizing(true)
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  const toggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCollapsedChange?.(!isCollapsed)
  }

  const resetHeight = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentHeight(null)
    resizeDataRef.current.latestHeight = null
    if (cardRef.current) {
      cardRef.current.style.height = 'auto'
    }
    onHeightChange?.(null)
  }

  const handleHide = (e: React.MouseEvent) => {
    e.stopPropagation()
    onHide?.()
  }

  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isResizing ? 'none' : transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const cardStyle: React.CSSProperties = {
    height: isCollapsed ? '52px' : (currentHeight ? `${currentHeight}px` : 'auto'),
    minHeight: isCollapsed ? '52px' : '150px',
  }

  return (
    <div 
      ref={setNodeRef}
      style={wrapperStyle}
      className={`${isDragging ? 'z-50' : ''}`}
    >
      {/* This is the actual card container with background */}
      <div
        ref={cardRef}
        style={cardStyle}
        className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
      >
        {/* Drag Handle - Top Center */}
        <div 
          {...attributes}
          {...listeners}
          className="absolute top-0 left-1/2 -translate-x-1/2 h-6 px-4 flex items-center justify-center cursor-grab active:cursor-grabbing z-30 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--muted)] border border-[var(--border)] shadow-sm">
            <GripVertical className="w-3 h-3 text-[var(--muted-foreground)]" />
            <span className="text-[10px] text-[var(--muted-foreground)]">drag</span>
          </div>
        </div>

        {/* Control Buttons - Top Right */}
        <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
          {onHide && (
            <button
              onClick={handleHide}
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-[var(--muted-foreground)] hover:text-red-400 transition-colors"
              title="Hide card"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          )}
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

        {/* Card Content - Children rendered inside, fills height */}
        <div 
          className={`h-full ${isCollapsed ? 'pointer-events-none overflow-hidden' : 'overflow-auto'}`}
        >
          <div className="h-full [&>*]:border-0 [&>*]:rounded-none [&>*]:bg-transparent [&>*]:h-full">
            {children}
          </div>
        </div>

        {/* Resize Handle - Bottom */}
        {!isCollapsed && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute bottom-0 left-0 right-0 h-6 cursor-ns-resize flex items-center justify-center z-40"
            style={{ 
              background: 'linear-gradient(to top, var(--card), transparent)',
            }}
          >
            <div 
              className={`w-24 h-2 rounded-full transition-all ${
                isResizing 
                  ? 'bg-blue-500 scale-110' 
                  : 'bg-gray-500 hover:bg-blue-500'
              }`} 
            />
          </div>
        )}
      </div>
    </div>
  )
}
