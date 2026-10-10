import { z } from 'zod'
import type { KeyValueStorage } from '@/lib/study/srs-store'

/**
 * Quiz history, kept in the browser until `quiz_attempts` lands with accounts.
 * Only results are kept — never the questions, which are rebuilt every time.
 */

export const QUIZ_STORAGE_KEY = 'abc:quiz:v1'

/** Enough to show "last time" and a trend; old attempts drop off the end. */
export const MAX_ATTEMPTS = 50

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'not an ISO date')

export const QuizAttemptSchema = z.object({
  /** `ted:<slug>` for one talk's words, `book` for the word book. */
  scope: z.string().min(1),
  at: isoDate,
  total: z.number().int().positive(),
  correct: z.number().int().nonnegative(),
  /** Item ids answered wrong, for "retry the ones I missed". */
  wrongIds: z.array(z.string()),
})

export type QuizAttempt = z.infer<typeof QuizAttemptSchema>

const FileSchema = z.object({ version: z.literal(1), attempts: z.array(z.unknown()) })

function storage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Forgiving: a corrupt entry is dropped on its own, a blocked storage reads as empty. */
export function readAttempts(store: KeyValueStorage | null = storage()): QuizAttempt[] {
  if (!store) return []
  try {
    const raw = store.getItem(QUIZ_STORAGE_KEY)
    if (!raw) return []
    const file = FileSchema.parse(JSON.parse(raw))
    return file.attempts.flatMap((entry) => {
      const parsed = QuizAttemptSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

/** Newest first, capped. A failed write loses history, never the quiz in front of the learner. */
export function recordAttempt(attempt: QuizAttempt, store: KeyValueStorage | null = storage()): void {
  if (!store) return
  const attempts = [QuizAttemptSchema.parse(attempt), ...readAttempts(store)].slice(0, MAX_ATTEMPTS)
  try {
    store.setItem(QUIZ_STORAGE_KEY, JSON.stringify({ version: 1, attempts }))
  } catch {
    /* quota or blocked storage */
  }
}

export function lastAttempt(scope: string, store: KeyValueStorage | null = storage()): QuizAttempt | null {
  return readAttempts(store).find((attempt) => attempt.scope === scope) ?? null
}
