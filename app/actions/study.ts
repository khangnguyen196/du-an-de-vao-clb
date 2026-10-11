'use server'

import { z } from 'zod'
import { requireUserId } from '@/lib/auth/session'
import {
  deleteCardNote,
  insertQuizAttempts,
  listCardNotes,
  listQuizAttempts,
  listReviewCards,
  upsertCardNotes,
  upsertReviewCards,
} from '@/lib/db/queries/study'
import { toAppError, type ErrorCode } from '@/lib/errors'
import { CardNoteSchema, validateNote, type CardNote } from '@/lib/study/notes-store'
import { QuizAttemptSchema, type QuizAttempt } from '@/lib/study/quiz-store'
import { ReviewRecordSchema, type ReviewRecord } from '@/lib/study/srs-store'

/**
 * The signed-in learner's study data. The browser never talks to the database:
 * every call lands here, is validated, and runs as the user the session proves
 * — whatever id or data the caller sends, it can only touch its own rows.
 */

export type StudyResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode }

/** Generous for one deck or one upload chunk, small enough to stay far below the 1 MB action body limit. */
const MAX_BATCH = 300

const Records = z.array(ReviewRecordSchema).max(MAX_BATCH)
const Notes = z.array(CardNoteSchema).max(MAX_BATCH)
const Attempts = z.array(QuizAttemptSchema).max(MAX_BATCH)
const CardId = z.string().min(1).max(300)

async function run<T>(label: string, work: (userId: string) => Promise<T>): Promise<StudyResult<T>> {
  try {
    return { ok: true, data: await work(await requireUserId()) }
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code !== 'UNAUTHENTICATED') console.error(`[study] ${label} failed:`, appError.message)
    return { ok: false, code: appError.code }
  }
}

function invalid(): StudyResult<never> {
  return { ok: false, code: 'INVALID_INPUT' }
}

export async function loadReviewRecords(): Promise<StudyResult<ReviewRecord[]>> {
  return run('load cards', (userId) => listReviewCards(userId))
}

export async function saveReviewRecords(input: unknown): Promise<StudyResult<null>> {
  const parsed = Records.safeParse(input)
  if (!parsed.success) return invalid()
  return run('save cards', async (userId) => {
    await upsertReviewCards(userId, parsed.data)
    return null
  })
}

export async function loadNotes(): Promise<StudyResult<CardNote[]>> {
  return run('load notes', (userId) => listCardNotes(userId))
}

export async function saveNotes(input: unknown): Promise<StudyResult<null>> {
  const parsed = Notes.safeParse(input)
  // The same rules the editor enforces: a meaning without its example never gets stored.
  if (!parsed.success || parsed.data.some((note) => !validateNote(note.senses).ok)) return invalid()
  return run('save notes', async (userId) => {
    await upsertCardNotes(userId, parsed.data)
    return null
  })
}

export async function removeNote(input: unknown): Promise<StudyResult<null>> {
  const parsed = CardId.safeParse(input)
  if (!parsed.success) return invalid()
  return run('remove note', async (userId) => {
    await deleteCardNote(userId, parsed.data)
    return null
  })
}

export async function loadQuizAttempts(): Promise<StudyResult<QuizAttempt[]>> {
  return run('load quizzes', (userId) => listQuizAttempts(userId))
}

export async function saveQuizAttempts(input: unknown): Promise<StudyResult<null>> {
  const parsed = Attempts.safeParse(input)
  if (!parsed.success) return invalid()
  return run('save quizzes', async (userId) => {
    await insertQuizAttempts(userId, parsed.data)
    return null
  })
}
