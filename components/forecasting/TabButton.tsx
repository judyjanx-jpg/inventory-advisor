'use client'

import React from 'react'

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
  color: string
}

export default function TabButton({ active, onClick, icon, label, count, color }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${
        active ? `${color} text-[var(--foreground)]` : 'bg-[var(--card)] text-gray-400 hover:bg-[var(--secondary)]'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
          active ? 'bg-white/20' : 'bg-red-500/20 text-red-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}
