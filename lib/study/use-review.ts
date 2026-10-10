'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createScheduler, type Scheduler } from '@/lib/study/srs'
import { browserReviewStore, REVIEW_STORAGE_KEY, type ReviewRecord } from '@/lib/study/srs-store'

export interface ReviewRecordsState {
  /** `null` until the store has been read after mount. */
  records: ReviewRecord[] | null
  scheduler: Scheduler
  save: (changed: readonly ReviewRecord[]) => Promise<void>
}

/**
 * Review progress for client components.
 *
 * Storage is read after mount, never during render: the server has no
 * localStorage and reading it early would break hydration. Another tab writing
 * progress fires a `storage` event, so two open tabs cannot silently overwrite
 * each other's reviews with a stale copy.
 */
export function useReviewRecords(): ReviewRecordsState {
  const store = useMemo(() => browserReviewStore(), [])
  const scheduler = useMemo(() => createScheduler(), [])
  const [records, setRecords] = useState<ReviewRecord[] | null>(null)

  const refresh = useCallback(async () => {
    setRecords(await store.list())
  }, [store])

  useEffect(() => {
    void refresh()

    const onStorage = (event: StorageEvent) => {
      if (event.key === REVIEW_STORAGE_KEY) void refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  const save = useCallback(
    async (changed: readonly ReviewRecord[]) => {
      if (changed.length === 0) return
      await store.putMany(changed)
      await refresh()
    },
    [refresh, store],
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
