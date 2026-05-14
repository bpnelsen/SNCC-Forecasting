'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'sncc-theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'light'
    setTheme(stored)
    applyTheme(stored)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    applyTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-fg-dim text-xs
                 transition-colors hover:text-fg hover:bg-border/50"
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {theme === 'light'
        ? <><Moon className="w-3.5 h-3.5" /> Dark</>
        : <><Sun className="w-3.5 h-3.5" /> Light</>}
    </button>
  )
}
