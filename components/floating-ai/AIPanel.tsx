'use client'

import { createPortal } from 'react-dom'
import { X, Sparkles } from 'lucide-react'
import AIChat from './AIChat'
import { useEffect, useState } from 'react'

interface AIPanelProps {
  onClose: () => void
  position: { bottom: number; right: number }
}

export default function AIPanel({ onClose, position }: AIPanelProps) {
  const [mounted, setMounted] = useState(false)
  const [panelPosition, setPanelPosition] = useState<{ bottom: number; right?: number; left?: number }>({
    bottom: position.bottom
  })

  useEffect(() => {
    setMounted(true)
    // Close on Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  useEffect(() => {
    // Calculate orb's center position
    const orbSize = 60
    const orbLeft = window.innerWidth - position.right - orbSize
    const orbCenterX = orbLeft + orbSize / 2
    const isOnLeft = orbCenterX < window.innerWidth / 2
    
    const panelWidth = 400
    const padding = 24
    const gap = 20 // Gap between orb and panel

    if (isOnLeft) {
      // Orb is on left, open panel to the right of orb
      const panelLeft = orbLeft + orbSize + gap
      // Make sure panel doesn't go off screen
      const constrainedLeft = Math.min(panelLeft, window.innerWidth - panelWidth - padding)
      setPanelPosition({
        bottom: position.bottom,
        left: Math.max(padding, constrainedLeft)
      })
    } else {
      // Orb is on right, open panel to the left of orb
      const panelRight = position.right + orbSize + gap
      // Make sure panel doesn't go off screen
      const constrainedRight = Math.min(panelRight, window.innerWidth - panelWidth - padding)
      setPanelPosition({
        bottom: position.bottom,
        right: Math.max(padding, constrainedRight)
      })
    }
  }, [position])

  const panelContent = (
    <div
      className="fixed z-[9999] w-[400px] max-w-[calc(100vw-48px)] h-[500px] max-h-[calc(100vh-48px)] animate-[panelOpen_0.3s_ease-out]"
      style={{
        bottom: `${panelPosition.bottom}px`,
        ...(panelPosition.left !== undefined ? { left: `${panelPosition.left}px` } : {}),
        ...(panelPosition.right !== undefined ? { right: `${panelPosition.right}px` } : {})
      }}
    >
      <div className="w-full h-full bg-[var(--secondary)]/85 backdrop-blur-xl border border-indigo-500/30 rounded-3xl shadow-[0_0_40px_rgba(99,102,241,0.15),inset_0_0_60px_rgba(139,92,246,0.05)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-indigo-500/20">
          <div className="flex items-center gap-2 text-white text-base font-semibold">
            <Sparkles className="w-5 h-5 text-purple-400" />
            How can I help?
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 border-none text-white/70 cursor-pointer flex items-center justify-center transition-all duration-200 hover:bg-white/20 hover:text-white"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <AIChat />
        </div>
      </div>
    </div>
  )

  if (!mounted) return null

  return createPortal(panelContent, document.body)
}

