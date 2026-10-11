'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { browserNotesStore } from '@/lib/study/notes-store'
import { readAttempts } from '@/lib/study/quiz-store'
import {
  lazyRemoteNotesStore,
  lazyRemoteQuizHistory as remoteQuizHistory,
  lazyRemoteReviewStore,
} from '@/lib/study/lazy-remote'
import { STUDY_CHANGED_EVENT, SYNC_ERROR_EVENT, type SyncErrorDetail } from '@/lib/study/sync-events'
import { browserReviewStore } from '@/lib/study/srs-store'
import { isEmptyPlan, planImport, type ImportPlan } from '@/lib/study/sync'
import { useStudySource } from '@/lib/study/use-study-source'

const importedKey = (userId: string) => `abc:imported:v1:${userId}`
const LATER_KEY = 'abc:import-later'

function readFlag(storage: () => Storage, key: string): boolean {
  try {
    return storage().getItem(key) !== null
  } catch {
    return false
  }
}

function writeFlag(storage: () => Storage, key: string): void {
  try {
    storage().setItem(key, new Date().toISOString())
  } catch {
    /* not remembered; the offer comes back next visit */
  }
}

/**
 * The account side of study data, in one place on every page:
 *
 * - right after signing in, offers to bring this browser's word book, notes
 *   and quiz history into the account — asked, never done silently, and never
 *   overwriting progress the account already has (`planImport`);
 * - when progress fails to reach the account, says so, instead of letting the
 *   learner believe a review was saved.
 */
export function AccountSync() {
  const t = useTranslations('sync')
  const source = useStudySource()
  const userId = source.kind === 'account' ? source.userId : null

  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [importing, setImporting] = useState(false)
  const [syncError, setSyncError] = useState<SyncErrorDetail['code'] | null>(null)

  useEffect(() => {
    setPlan(null)
    if (!userId || readFlag(() => window.localStorage, importedKey(userId)) || readFlag(() => window.sessionStorage, LATER_KEY)) {
      return
    }

    let active = true
    void (async () => {
      const local = {
        records: await browserReviewStore().list(),
        notes: await browserNotesStore().list(),
        attempts: readAttempts(),
      }
      if (local.records.length + local.notes.length + local.attempts.length === 0) return
      try {
        const remote = {
          records: await lazyRemoteReviewStore().list(),
          notes: await lazyRemoteNotesStore().list(),
          attempts: await remoteQuizHistory.list(),
        }
        const next = planImport(local, remote)
        if (!active) return
        if (isEmptyPlan(next)) writeFlag(() => window.localStorage, importedKey(userId))
        else setPlan(next)
      } catch {
        /* the sync notice already says the account is unreachable */
      }
    })()
    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    const onError = (event: Event) => setSyncError((event as CustomEvent<SyncErrorDetail>).detail.code)
    window.addEventListener(SYNC_ERROR_EVENT, onError)
    return () => window.removeEventListener(SYNC_ERROR_EVENT, onError)
  }, [])

  const runImport = useCallback(async () => {
    if (!plan || !userId) return
    setImporting(true)
    try {
      await lazyRemoteReviewStore().putMany(plan.records)
      await lazyRemoteNotesStore().putMany(plan.notes)
      await remoteQuizHistory.add(plan.attempts)
      writeFlag(() => window.localStorage, importedKey(userId))
      setPlan(null)
      // Every list on the page re-reads the account.
      window.dispatchEvent(new Event(STUDY_CHANGED_EVENT))
    } catch {
      /* announced; the offer stays so it can be tried again */
    } finally {
      setImporting(false)
    }
  }, [plan, userId])

  if (!plan && !syncError) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
      role="region"
      aria-label={t('regionLabel')}
    >
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-4 shadow-[0_24px_60px_-20px_rgb(17_24_39/0.45)]">
        {syncError ? (
          <div role="alert" className="flex items-start gap-3">
            <p className="flex-1 text-sm leading-relaxed text-pretty">
              {syncError === 'UNAUTHENTICATED' ? t('errorSession') : t('errorGeneric')}
            </p>
            <button
              type="button"
              onClick={() => setSyncError(null)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-medium hover:bg-raised"
            >
              {t('dismiss')}
            </button>
          </div>
        ) : plan ? (
          <div>
            <p className="font-semibold">{t('importTitle')}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted text-pretty">
              {t('importBody', { words: plan.records.length, notes: plan.notes.length, quizzes: plan.attempts.length })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={importing}
                onClick={() => void runImport()}
                className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-canvas disabled:opacity-50"
              >
                {importing ? t('importing') : t('importAction')}
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => {
                  writeFlag(() => window.sessionStorage, LATER_KEY)
                  setPlan(null)
                }}
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium hover:border-accent-line"
              >
                {t('later')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
