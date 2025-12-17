'use client'

import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { ReactNode, useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showCloseButton?: boolean
}

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
}: ModalProps) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-0 sm:p-4">
        <div
          className={cn(
            "relative bg-slate-800 border-slate-700/50 shadow-2xl transform transition-all w-full",
            // Mobile: full screen for lg+ sizes, otherwise rounded with padding
            "min-h-screen sm:min-h-0",
            "border-0 sm:border rounded-none sm:rounded-xl",
            // Desktop sizes
            size === 'sm' && "sm:max-w-sm",
            size === 'md' && "sm:max-w-md",
            size === 'lg' && "sm:max-w-lg",
            size === 'xl' && "sm:max-w-2xl",
            size === 'full' && "sm:max-w-4xl",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-start justify-between p-4 sm:p-6 border-b border-slate-700/50 sticky top-0 bg-slate-800 z-10">
              <div className="min-w-0 flex-1 pr-2">
                {title && <h3 className="text-base sm:text-lg font-semibold text-white truncate">{title}</h3>}
                {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
              </div>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="p-2 -mr-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors touch-manipulation flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-4 sm:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// Modal Footer component for action buttons
interface ModalFooterProps {
  children: ReactNode
  className?: string
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={cn(
      "flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-4 sm:pt-6 mt-4 sm:mt-6 border-t border-slate-700/50",
      className
    )}>
      {children}
    </div>
  )
}
