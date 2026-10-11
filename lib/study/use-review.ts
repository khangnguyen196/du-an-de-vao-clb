'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { lazyRemoteReviewStore } from '@/lib/study/lazy-remote'
import { createScheduler, type Scheduler } from '@/lib/study/srs'
import { browserReviewStore, REVIEW_STORAGE_KEY, type ReviewRecord, type ReviewStore } from '@/lib/study/srs-store'
import { STUDY_CHANGED_EVENT } from '@/lib/study/sync-events'
import { sourceKey, useStudySource } from '@/lib/study/use-study-source'

export interface ReviewRecordsState {
  /** `null` until the store has been read after mount. */
  records: ReviewRecord[] | null
  scheduler: Scheduler
  save: (changed: readonly ReviewRecord[]) => Promise<void>
}

/** `changed` laid over `current`, replacing records by id and adding new ones. */
function mergeRecords(current: readonly ReviewRecord[], changed: readonly ReviewRecord[]): ReviewRecord[] {
  const byId = new Map(current.map((record) => [record.id, record]))
  for (const record of changed) byId.set(record.id, record)
  return [...byId.values()]
}

/**
 * Review progress for client components — from the browser, or from the
 * account once signed in. Callers cannot tell which.
 *
 * Read after mount, never during render: the server has no localStorage and
 * reading it early would break hydration. Another tab writing progress fires a
 * `storage` event; for the account, coming back to the tab re-reads it, which
 * is how a review done on the phone shows up on the laptop.
 *
 * Saving to the account updates the screen first and the server after: a grade
 * must not wait on the network. A failed save is announced by the store and
 * the screen keeps the learner's progress rather than snapping back.
 */
export function useReviewRecords(): ReviewRecordsState {
  const source = useStudySource()
  const key = sourceKey(source)
  const store = useMemo<ReviewStore | null>(
    () => (key === 'loading' ? null : key === 'local' ? browserReviewStore() : lazyRemoteReviewStore()),
    [key],
  )
  const remote = key.startsWith('account:')
  const scheduler = useMemo(() => createScheduler(), [])
  const [records, setRecords] = useState<ReviewRecord[] | null>(null)

  const refresh = useCallback(async () => {
    if (!store) return
    try {
      setRecords(await store.list())
    } catch {
      // Announced by the store. Never leave the page spinning on a failed first read.
      setRecords((current) => current ?? [])
    }
  }, [store])

  useEffect(() => {
    // A different source (signed in or out) must never show the previous one's cards.
    setRecords(null)
    if (!store) return
    void refresh()

    if (remote) {
      const onVisible = () => {
        if (document.visibilityState === 'visible') void refresh()
      }
      const onChanged = () => void refresh()
      document.addEventListener('visibilitychange', onVisible)
      window.addEventListener(STUDY_CHANGED_EVENT, onChanged)
      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        window.removeEventListener(STUDY_CHANGED_EVENT, onChanged)
      }
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === REVIEW_STORAGE_KEY) void refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh, remote, store])

  const save = useCallback(
    async (changed: readonly ReviewRecord[]) => {
      if (!store || changed.length === 0) return
      if (!remote) {
        await store.putMany(changed)
        await refresh()
        return
      }
      setRecords((current) => mergeRecords(current ?? [], changed))
      try {
        await store.putMany(changed)
      } catch {
        /* announced by the store; the screen keeps the progress */
      }
    },
    [refresh, remote, store],
  )

  return { records, scheduler, save }
}

/**
 * The current time, re-read on an interval. Learning cards fall due minutes
 * after they are graded; without a ticking clock they would never come back
 * until the page was reloaded.
 */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}
