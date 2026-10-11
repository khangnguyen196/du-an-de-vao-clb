'use client'

import {
  loadNotes,
  loadQuizAttempts,
  loadReviewRecords,
  removeNote,
  saveNotes,
  saveQuizAttempts,
  saveReviewRecords,
  type StudyResult,
} from '@/app/actions/study'
import { AppError } from '@/lib/errors'
import { validateNote, NoteValidationError, type CardNote, type NotesStore } from '@/lib/study/notes-store'
import type { QuizAttempt } from '@/lib/study/quiz-store'
import type { ReviewRecord, ReviewStore } from '@/lib/study/srs-store'
import { SYNC_ERROR_EVENT, type SyncErrorDetail } from '@/lib/study/sync-events'
import { chunk } from '@/lib/study/sync'

/**
 * The account-backed twins of the browser stores, same interfaces, so the
 * hooks swap one for the other and no component knows which it has.
 *
 * A failure is thrown (the hooks catch it) and also announced on `window`, so
 * one small notice can tell the learner their progress did not reach the
 * account — instead of every component growing its own error state.
 */

const UPLOAD_CHUNK = 200

async function unwrap<T>(call: Promise<StudyResult<T>>): Promise<T> {
  let result: StudyResult<T>
  try {
    result = await call
  } catch (cause) {
    // Network down, server restarting: the action never answered.
    result = { ok: false, code: 'UPSTREAM_FAILED' }
    console.warn('[sync] request failed:', (cause as Error).message)
  }
  if (result.ok) return result.data
  window.dispatchEvent(new CustomEvent<SyncErrorDetail>(SYNC_ERROR_EVENT, { detail: { code: result.code } }))
  throw new AppError(result.code, 'Study data did not reach the account')
}

/**
 * Several components on one page read the cards at mount (header badge, word
 * book…). They share one request instead of each asking the server.
 */
let pendingCards: Promise<ReviewRecord[]> | null = null

export class RemoteReviewStore implements ReviewStore {
  async list(): Promise<ReviewRecord[]> {
    pendingCards ??= unwrap(loadReviewRecords()).finally(() => {
      pendingCards = null
    })
    return pendingCards
  }

  async get(id: string): Promise<ReviewRecord | null> {
    return (await this.list()).find((record) => record.id === id) ?? null
  }

  async putMany(records: readonly ReviewRecord[]): Promise<void> {
    for (const part of chunk(records, UPLOAD_CHUNK)) await unwrap(saveReviewRecords(part))
  }
}

export class RemoteNotesStore implements NotesStore {
  async list(): Promise<CardNote[]> {
    return unwrap(loadNotes())
  }

  async get(id: string): Promise<CardNote | null> {
    return (await this.list()).find((note) => note.id === id) ?? null
  }

  async put(note: CardNote): Promise<void> {
    // Checked here too, so the editor shows the same field errors it does offline.
    const validation = validateNote(note.senses)
    if (!validation.ok) throw new NoteValidationError(validation.issues)
    await unwrap(saveNotes([{ ...note, senses: validation.senses }]))
  }

  async putMany(notes: readonly CardNote[]): Promise<void> {
    for (const part of chunk(notes, UPLOAD_CHUNK)) await unwrap(saveNotes(part))
  }

  async remove(id: string): Promise<void> {
    await unwrap(removeNote(id))
  }
}

export const remoteQuizHistory = {
  list: (): Promise<QuizAttempt[]> => unwrap(loadQuizAttempts()),
  add: async (attempts: readonly QuizAttempt[]): Promise<void> => {
    for (const part of chunk(attempts, UPLOAD_CHUNK)) await unwrap(saveQuizAttempts(part))
  },
}
