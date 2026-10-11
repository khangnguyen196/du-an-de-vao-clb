import type { CardNote } from '@/lib/study/notes-store'
import type { QuizAttempt } from '@/lib/study/quiz-store'
import type { ReviewRecord } from '@/lib/study/srs-store'

/**
 * Deciding what of this browser's study data should go into an account.
 *
 * Pure, so the rules are tested rather than trusted. The guiding rule: never
 * let an upload undo progress. A card already in the account wins unless the
 * browser's copy has seen more reviews — whichever copy was studied further is
 * the one the learner would expect to keep.
 */

function lastReviewMs(record: ReviewRecord): number {
  return record.scheduling.last_review ? Date.parse(record.scheduling.last_review) : 0
}

/** True when `local` holds progress `remote` does not: more reviews, or the same count reviewed later. */
export function localIsAhead(local: ReviewRecord, remote: ReviewRecord): boolean {
  if (local.scheduling.reps !== remote.scheduling.reps) return local.scheduling.reps > remote.scheduling.reps
  if (lastReviewMs(local) !== lastReviewMs(remote)) return lastReviewMs(local) > lastReviewMs(remote)
  // Same progress: only a word-book choice could differ, and the account's stands.
  return false
}

export interface ImportPlan {
  records: ReviewRecord[]
  notes: CardNote[]
  attempts: QuizAttempt[]
}

export function planImport(
  local: { records: readonly ReviewRecord[]; notes: readonly CardNote[]; attempts: readonly QuizAttempt[] },
  remote: { records: readonly ReviewRecord[]; notes: readonly CardNote[]; attempts: readonly QuizAttempt[] },
): ImportPlan {
  const remoteRecords = new Map(remote.records.map((record) => [record.id, record]))
  const records = local.records.filter((record) => {
    const existing = remoteRecords.get(record.id)
    return !existing || localIsAhead(record, existing)
  })

  // A learner's own meanings: the more recently edited version is the one they meant.
  const remoteNotes = new Map(remote.notes.map((note) => [note.id, note]))
  const notes = local.notes.filter((note) => {
    const existing = remoteNotes.get(note.id)
    return !existing || Date.parse(note.updatedAt) > Date.parse(existing.updatedAt)
  })

  // Attempts are history, not state: add the ones the account has not seen.
  const seen = new Set(remote.attempts.map((attempt) => `${attempt.scope}@${attempt.at}`))
  const attempts = local.attempts.filter((attempt) => !seen.has(`${attempt.scope}@${attempt.at}`))

  return { records, notes, attempts }
}

export function isEmptyPlan(plan: ImportPlan): boolean {
  return plan.records.length === 0 && plan.notes.length === 0 && plan.attempts.length === 0
}

/** Splits an upload so no single Server Action body gets near Next's 1 MB limit. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size))
  return out
}
