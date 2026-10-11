'use client'

import type { CardNote, NotesStore } from '@/lib/study/notes-store'
import type { QuizAttempt } from '@/lib/study/quiz-store'
import type { ReviewRecord, ReviewStore } from '@/lib/study/srs-store'

/**
 * The account stores, loaded on first use. A visitor who never signs in never
 * downloads them — or the Server Action references behind them — and a page
 * that only might show account data does not pay for it up front.
 */
let loading: Promise<typeof import('@/lib/study/remote-stores')> | null = null
const remote = () => (loading ??= import('@/lib/study/remote-stores'))

export function lazyRemoteReviewStore(): ReviewStore {
  return {
    list: async () => new (await remote()).RemoteReviewStore().list(),
    get: async (id: string) => new (await remote()).RemoteReviewStore().get(id),
    putMany: async (records: readonly ReviewRecord[]) => new (await remote()).RemoteReviewStore().putMany(records),
  }
}

export function lazyRemoteNotesStore(): NotesStore & { putMany(notes: readonly CardNote[]): Promise<void> } {
  return {
    list: async () => new (await remote()).RemoteNotesStore().list(),
    get: async (id: string) => new (await remote()).RemoteNotesStore().get(id),
    put: async (note: CardNote) => new (await remote()).RemoteNotesStore().put(note),
    putMany: async (notes: readonly CardNote[]) => new (await remote()).RemoteNotesStore().putMany(notes),
    remove: async (id: string) => new (await remote()).RemoteNotesStore().remove(id),
  }
}

export const lazyRemoteQuizHistory = {
  list: async (): Promise<QuizAttempt[]> => (await remote()).remoteQuizHistory.list(),
  add: async (attempts: readonly QuizAttempt[]): Promise<void> => (await remote()).remoteQuizHistory.add(attempts),
}
