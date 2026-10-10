'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { browserNotesStore, NOTES_STORAGE_KEY, type CardNote } from '@/lib/study/notes-store'

export interface NotesState {
  /** `null` until storage has been read after mount. */
  notes: ReadonlyMap<string, CardNote> | null
  save: (note: CardNote) => Promise<void>
  remove: (id: string) => Promise<void>
}

/**
 * Learner notes for client components. Read after mount (the server has no
 * storage), and kept in step with other open tabs through the `storage` event.
 */
export function useNotes(): NotesState {
  const store = useMemo(() => browserNotesStore(), [])
  const [notes, setNotes] = useState<ReadonlyMap<string, CardNote> | null>(null)

  const refresh = useCallback(async () => {
    const list = await store.list()
    setNotes(new Map(list.map((note) => [note.id, note])))
  }, [store])

  useEffect(() => {
    void refresh()
    const onStorage = (event: StorageEvent) => {
      if (event.key === NOTES_STORAGE_KEY) void refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  const save = useCallback(
    async (note: CardNote) => {
      await store.put(note)
      await refresh()
    },
    [refresh, store],
  )

  const remove = useCallback(
    async (id: string) => {
      await store.remove(id)
      await refresh()
    },
    [refresh, store],
  )

  return { notes, save, remove }
}
