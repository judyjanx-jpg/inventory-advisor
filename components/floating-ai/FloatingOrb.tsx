'use client'

import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import AIPanel from './AIPanel'

interface FloatingOrbProps {
  position?: { bottom: number; right: number }
}

export default function FloatingOrb({ position = { bottom: 24, right: 24 } }: FloatingOrbProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [orbPosition, setOrbPosition] = useState(position)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Load saved position from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ai-orb-position')
    if (saved) {
      try {
        setOrbPosition(JSON.parse(saved))
      } catch (e) {
        // Invalid saved position, use default
      }
    }
  }, [])

  // Save position to localStorage
  const savePosition = (pos: { bottom: number; right: number }) => {
    localStorage.setItem('ai-orb-position', JSON.stringify(pos))
    setOrbPosition(pos)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isOpen) return // Don't drag when panel is open
    setIsDragging(true)
    // Calculate offset from mouse position to orb's current position
    const currentLeft = window.innerWidth - orbPosition.right - 60 // Convert right to left
    const currentTop = window.innerHeight - orbPosition.bottom - 60 // Convert bottom to top
    setDragStart({
      x: e.clientX - currentLeft,
      y: e.clientY - currentTop
    })
    e.preventDefault()
    e.stopPropagation()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return

    // Calculate new position based on mouse position minus offset
    const newLeft = e.clientX - dragStart.x
    const newTop = e.clientY - dragStart.y

    // Constrain to viewport (keep orb fully visible)
    const orbSize = 60
    const constrainedLeft = Math.max(0, Math.min(newLeft, window.innerWidth - orbSize))
    const constrainedTop = Math.max(0, Math.min(newTop, window.innerHeight - orbSize))

    // Convert to bottom/right positioning for storage
    const newRight = window.innerWidth - constrainedLeft - orbSize
    const newBottom = window.innerHeight - constrainedTop - orbSize

    savePosition({
      right: newRight,
      bottom: newBottom
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragStart])

  return (
    <>
      {/* The Orb */}
      {!isOpen && (
        <div
          className="fixed w-[60px] h-[60px] rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-500 flex items-center justify-center z-[9998] transition-all duration-200 hover:scale-110 select-none"
          style={{
            bottom: `${orbPosition.bottom}px`,
            right: `${orbPosition.right}px`,
            cursor: isDragging ? 'grabbing' : 'grab',
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.4), 0 0 40px rgba(139, 92, 246, 0.2), inset 0 0 20px rgba(255, 255, 255, 0.1)',
            animation: 'float 3s ease-in-out infinite, pulse-glow 2s ease-in-out infinite'
          }}
          onMouseDown={handleMouseDown}
          onClick={() => setIsOpen(true)}
          title="AI Assistant"
        >
          <div 
            className="absolute -inset-[10px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
              animation: 'glow 2s ease-in-out infinite'
            }}
          />
          <Sparkles className="w-7 h-7 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.5)] z-10" />
        </div>
      )}

      {/* The Panel (rendered via portal) */}
      {isOpen && (
        <AIPanel
          onClose={() => setIsOpen(false)}
          position={orbPosition}
        />
      )}
    </>
  )
}

