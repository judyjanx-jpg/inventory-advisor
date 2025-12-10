'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  // Load theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme
    if (stored && (stored === 'dark' || stored === 'light')) {
      setThemeState(stored)
    }
    setMounted(true)
  }, [])

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return
    
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(theme)
    root.setAttribute('data-theme', theme)
    
    // Update meta theme-color for mobile browsers
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0f172a' : '#f8fafc')
    }
  }, [theme, mounted])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: newTheme }))
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  // Prevent flash of wrong theme
  if (!mounted) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

