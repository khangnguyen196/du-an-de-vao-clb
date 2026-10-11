'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { browserNotesStore, NOTES_STORAGE_KEY, type CardNote, type NotesStore } from '@/lib/study/notes-store'
import { lazyRemoteNotesStore } from '@/lib/study/lazy-remote'
import { STUDY_CHANGED_EVENT } from '@/lib/study/sync-events'
import { sourceKey, useStudySource } from '@/lib/study/use-study-source'

export interface NotesState {
  /** `null` until storage has been read after mount. */
  notes: ReadonlyMap<string, CardNote> | null
  /** Rejects when the note breaks the rules or does not reach the account. */
  save: (note: CardNote) => Promise<void>
  remove: (id: string) => Promise<void>
}

/**
 * Learner notes for client components, from the browser or from the account
 * once signed in. Read after mount (the server has no storage); kept in step
 * with other tabs through the `storage` event, and with other devices by
 * re-reading the account when the tab comes back into view.
 */
export function useNotes(): NotesState {
  const source = useStudySource()
  const key = sourceKey(source)
  const store = useMemo<NotesStore | null>(
    () => (key === 'loading' ? null : key === 'local' ? browserNotesStore() : lazyRemoteNotesStore()),
    [key],
  )
  const remote = key.startsWith('account:')
  const [notes, setNotes] = useState<ReadonlyMap<string, CardNote> | null>(null)

  const refresh = useCallback(async () => {
    if (!store) return
    try {
      const list = await store.list()
      setNotes(new Map(list.map((note) => [note.id, note])))
    } catch {
      setNotes((current) => current ?? new Map())
    }
  }, [store])

  useEffect(() => {
    setNotes(null)
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
      if (event.key === NOTES_STORAGE_KEY) void refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh, remote, store])

  const save = useCallback(
    async (note: CardNote) => {
      if (!store) return
      await store.put(note)
      await refresh()
    },
    [refresh, store],
  )

  const remove = useCallback(
    async (id: string) => {
      if (!store) return
      await store.remove(id)
      await refresh()
    },
    [refresh, store],
  )

  return { notes, save, remove }
}
