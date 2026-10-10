'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { countLeftOutAtMigration } from '@/lib/study/srs'
import type { ReviewRecord } from '@/lib/study/srs-store'

const DISMISSED_KEY = 'abc:word-book-notice:v1'

/**
 * One-time explanation of the switch to a hand-picked word book.
 *
 * Before it, opening a deck enrolled every word on it. Words the learner never
 * reviewed were dropped from the schedule by that switch, and a review queue
 * that silently shrinks reads like lost data — so this says what happened and
 * how to get a word back, until the learner dismisses it.
 */
export function BookNotice({ records }: { records: readonly ReviewRecord[] | null }) {
  const t = useTranslations('wordBook.notice')
  const [dismissed, setDismissed] = useState(true)

  // Storage is read after mount; the server cannot see it.
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  const leftOut = records ? countLeftOutAtMigration(records) : 0
  if (dismissed || leftOut === 0) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      /* shown again next visit — harmless */
    }
  }

  return (
    <div role="status" className="rounded-card border border-accent-line bg-accent-soft p-4">
      <p className="font-medium text-accent-ink">{t('title')}</p>
      <p className="mt-1 text-sm leading-relaxed text-accent-ink/90 text-pretty">{t('body', { count: leftOut })}</p>
      <button
        type="button"
        onClick={dismiss}
        className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-accent-line px-3 text-sm font-medium text-accent-ink hover:bg-accent-soft"
      >
        {t('dismiss')}
      </button>
    </div>
  )
}
