'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { bookRecords, buildQueue } from '@/lib/study/srs'
import { useNow, useReviewRecords } from '@/lib/study/use-review'
import { cn } from '@/lib/utils'

/**
 * Header link to the word book, with how many cards are waiting today.
 *
 * The count comes from browser storage, so it appears after mount; the link
 * itself is there from the first paint and works without it.
 */
export function WordBookLink({
  compact = false,
  from,
}: {
  compact?: boolean
  /** In-app path the word book's back link should return to, e.g. the talk being read. */
  from?: string
}) {
  const t = useTranslations('nav')
  const { records } = useReviewRecords()
  const now = useNow(60_000)

  const waiting = useMemo(() => {
    if (!records) return 0
    const queue = buildQueue(bookRecords(records), now)
    return queue.due.length + queue.fresh.length
  }, [records, now])

  return (
    <Link
      href={from ? `/words?from=${encodeURIComponent(from)}` : '/words'}
      aria-label={compact ? t('wordBook') : undefined}
      className={cn(
        'relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line text-sm font-medium hover:border-accent-line hover:text-accent-ink',
        compact ? 'min-w-11 justify-center px-2 sm:px-3' : 'px-3',
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
        <path d="M6 3h11a2 2 0 0 1 2 2v14a1 1 0 0 1-1 1H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Zm0 2v10.2c.3-.1.6-.2 1-.2h10V5H6Zm1 12a1 1 0 1 0 0 2h10v-2H7Z" />
      </svg>
      <span className={cn(compact && 'hidden sm:inline')}>{t('wordBook')}</span>
      {waiting > 0 ? (
        <span className="rounded-full bg-accent px-1.5 font-mono text-xs leading-5 text-canvas tabular-nums">
          {waiting > 99 ? '99+' : waiting}
        </span>
      ) : null}
    </Link>
  )
}
