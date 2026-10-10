'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  matchCount: number
  focusedMatch: number
  onStep: (direction: 1 | -1) => void
}

export function SearchBar({ value, onChange, matchCount, focusedMatch, onStep }: SearchBarProps) {
  const t = useTranslations('watch')
  const hasQuery = value.trim().length > 0

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-faint">
        <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2m0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12" />
      </svg>

      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          onStep(event.shiftKey ? -1 : 1)
        }}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        className="min-h-11 min-w-0 flex-1 bg-transparent text-ink placeholder:text-faint focus:outline-none"
      />

      {hasQuery ? (
        <div className="flex shrink-0 items-center gap-1">
          <span className="font-mono text-xs whitespace-nowrap text-muted tabular-nums">
            {matchCount === 0
              ? t('searchEmpty')
              : t('searchResults', { current: focusedMatch + 1, total: matchCount })}
          </span>

          {(['prev', 'next'] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              disabled={matchCount === 0}
              onClick={() => onStep(direction === 'next' ? 1 : -1)}
              aria-label={direction === 'next' ? t('nextMatch') : t('prevMatch')}
              className={cn(
                'grid size-11 shrink-0 place-items-center rounded-lg text-muted',
                'hover:bg-raised hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent',
              )}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className={cn('size-4 fill-current', direction === 'prev' && 'rotate-180')}
              >
                <path d="M12 16.5 5.5 10l1.4-1.4 5.1 5.1 5.1-5.1L18.5 10z" />
              </svg>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
