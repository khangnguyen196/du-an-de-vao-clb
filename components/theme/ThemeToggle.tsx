'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { applyTheme, currentTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * Switches between the light and dark palettes. Until the reader presses it,
 * the page follows the system setting — and keeps following it if the system
 * changes while the page is open.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('theme')
  // Unknown on the server: the icon appears once the client knows the theme.
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(currentTheme())
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => setTheme(currentTheme())
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next)
        setTheme(next)
      }}
      aria-label={t(next === 'dark' ? 'toDark' : 'toLight')}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5 fill-current', theme === null && 'opacity-0')}>
        {theme === 'dark' ? (
          // Sun: pressing it brings the light theme.
          <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5a1 1 0 0 1 1 1v1.5a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 17.5a1 1 0 0 1 1 1V22a1 1 0 1 1-2 0v-1.5a1 1 0 0 1 1-1ZM2 12a1 1 0 0 1 1-1h1.5a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1Zm17.5 0a1 1 0 0 1 1-1H22a1 1 0 1 1 0 2h-1.5a1 1 0 0 1-1-1ZM4.9 4.9a1 1 0 0 1 1.4 0l1.1 1.1A1 1 0 0 1 6 7.4L4.9 6.3a1 1 0 0 1 0-1.4Zm11.7 11.7a1 1 0 0 1 1.4 0l1.1 1.1a1 1 0 1 1-1.4 1.4l-1.1-1.1a1 1 0 0 1 0-1.4ZM19.1 4.9a1 1 0 0 1 0 1.4L18 7.4A1 1 0 0 1 16.6 6l1.1-1.1a1 1 0 0 1 1.4 0ZM7.4 16.6a1 1 0 0 1 0 1.4l-1.1 1.1a1 1 0 1 1-1.4-1.4L6 16.6a1 1 0 0 1 1.4 0Z" />
        ) : (
          // Moon: pressing it brings the dark theme.
          <path d="M20.7 14.1A8.5 8.5 0 0 1 9.9 3.3a.7.7 0 0 0-.9-.9A10 10 0 1 0 21.6 15a.7.7 0 0 0-.9-.9Z" />
        )}
      </svg>
    </button>
  )
}
