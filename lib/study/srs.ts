import { createEmptyCard, fsrs, Rating, State, type Card as FsrsCard } from 'ts-fsrs'
import type { ReviewRecord, ReviewScheduling, ReviewSnapshot } from '@/lib/study/srs-store'

/**
 * Spaced-repetition engine on top of ts-fsrs.
 *
 * Every function takes `now` as an argument and touches no storage, so the
 * scheduling rules are testable with a fixed clock and the UI decides when to
 * persist.
 */

export type Scheduler = ReturnType<typeof fsrs>

/** The four buttons a learner presses. `Rating.Manual` is not a learner grade. */
export type SrsGrade = Rating.Again | Rating.Hard | Rating.Good | Rating.Easy

export const GRADES: readonly SrsGrade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]

/** New cards introduced per day before the queue stops offering more. */
export const DEFAULT_NEW_PER_DAY = 20

/**
 * Fuzz spreads reviews a little so a batch learned together does not all fall
 * due on the same day. Tests turn it off to keep intervals deterministic.
 */
export function createScheduler(options?: { enableFuzz?: boolean }): Scheduler {
  return fsrs({ enable_fuzz: options?.enableFuzz ?? true })
}

// --- (de)serialisation ------------------------------------------------------

export function toFsrsCard(scheduling: ReviewScheduling): FsrsCard {
  return {
    due: new Date(scheduling.due),
    stability: scheduling.stability,
    difficulty: scheduling.difficulty,
    elapsed_days: scheduling.elapsed_days,
    scheduled_days: scheduling.scheduled_days,
    learning_steps: scheduling.learning_steps,
    reps: scheduling.reps,
    lapses: scheduling.lapses,
    state: scheduling.state as State,
    ...(scheduling.last_review ? { last_review: new Date(scheduling.last_review) } : {}),
  }
}

export function fromFsrsCard(card: FsrsCard): ReviewScheduling {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  }
}

// --- enrolment --------------------------------------------------------------

export interface EnrollInput {
  id: string
  deckId: string
  term: string
  snapshot: ReviewSnapshot
}

/**
 * Structural equality that ignores key order and keys whose value is undefined.
 *
 * Snapshots now carry arrays of senses. Comparing with `===` would call every
 * reopened deck "changed", and because saving refreshes the records the deck
 * enrols from, that would be a write loop. Key order matters too: a record
 * parsed back out of storage does not keep the order the component built.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => deepEqual(value, b[index]))
  }

  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const keysOf = (record: Record<string, unknown>) =>
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
    const leftKeys = keysOf(left)
    const rightKeys = keysOf(right)
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]))
    )
  }

  return false
}

function sameSnapshot(a: ReviewSnapshot, b: ReviewSnapshot): boolean {
  return deepEqual(a, b)
}

// --- word book --------------------------------------------------------------

/**
 * Whether a card is in the learner's word book — the only cards that get
 * reviewed.
 *
 * Records from before the word book carry no flag: back then, opening a deck
 * enrolled every card on it. Those the learner actually reviewed stay in; the
 * rest were never chosen and stay out, scheduling kept, until saved.
 */
export function isInBook(record: ReviewRecord): boolean {
  return record.inBook ?? record.firstReviewedAt !== null
}

export function bookRecords(records: readonly ReviewRecord[]): ReviewRecord[] {
  return records.filter(isInBook)
}

/**
 * Records left out of the word book by the switch to choosing words by hand,
 * for the one-time notice that tells the learner where those words went.
 */
export function countLeftOutAtMigration(records: readonly ReviewRecord[]): number {
  return records.filter((record) => record.inBook === undefined && record.firstReviewedAt === null).length
}

/**
 * Saves cards to the word book: new ones join the schedule, ones taken out
 * earlier come back with their progress. Also refreshes content, like
 * `refreshSnapshots`. Returns only the records that actually changed.
 *
 * NEVER touches scheduling. Saving a word again must not reset weeks of
 * progress.
 */
export function enroll(
  existing: readonly ReviewRecord[],
  cards: readonly EnrollInput[],
  now: Date,
): ReviewRecord[] {
  const byId = new Map(existing.map((record) => [record.id, record]))
  const changed: ReviewRecord[] = []

  for (const card of cards) {
    const current = byId.get(card.id)

    if (!current) {
      changed.push({
        id: card.id,
        deckId: card.deckId,
        term: card.term,
        snapshot: card.snapshot,
        scheduling: fromFsrsCard(createEmptyCard(now)),
        addedAt: now.toISOString(),
        firstReviewedAt: null,
        inBook: true,
      })
      continue
    }

    if (current.inBook !== true || !sameSnapshot(current.snapshot, card.snapshot)) {
      changed.push({ ...current, snapshot: card.snapshot, inBook: true })
    }
  }

  return changed
}

/**
 * Picks up improved content — Vietnamese meanings arriving once an API key is
 * configured — for cards that already have a record, saved or not. Creates
 * nothing: opening a deck no longer puts its words in the word book.
 */
export function refreshSnapshots(existing: readonly ReviewRecord[], cards: readonly EnrollInput[]): ReviewRecord[] {
  const byId = new Map(existing.map((record) => [record.id, record]))
  const changed: ReviewRecord[] = []

  for (const card of cards) {
    const current = byId.get(card.id)
    if (current && !sameSnapshot(current.snapshot, card.snapshot)) {
      changed.push({ ...current, snapshot: card.snapshot })
    }
  }

  return changed
}

/**
 * Takes a card out of the word book. Its scheduling stays, so saving the word
 * again resumes rather than restarts it.
 */
export function removeFromBook(record: ReviewRecord): ReviewRecord {
  return { ...record, inBook: false }
}

// --- grading ----------------------------------------------------------------

export function grade(record: ReviewRecord, rating: SrsGrade, now: Date, scheduler: Scheduler): ReviewRecord {
  const { card } = scheduler.next(toFsrsCard(record.scheduling), now, rating)
  return {
    ...record,
    scheduling: fromFsrsCard(card),
    firstReviewedAt: record.firstReviewedAt ?? now.toISOString(),
  }
}

/** When the card would next be due for each of the four buttons. */
export function previewDue(record: ReviewRecord, now: Date, scheduler: Scheduler): Record<SrsGrade, Date> {
  const card = toFsrsCard(record.scheduling)
  const result = {} as Record<SrsGrade, Date>
  for (const rating of GRADES) result[rating] = scheduler.next(card, now, rating).card.due
  return result
}

export type IntervalUnit = 'minute' | 'hour' | 'day' | 'month' | 'year'

/**
 * A duration rounded the way a button label wants it ("10 minutes", "3 days").
 * Returns a unit key rather than text so the component can translate it.
 */
export function intervalParts(ms: number): { value: number; unit: IntervalUnit } {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return { value: minutes, unit: 'minute' }

  const hours = Math.round(minutes / 60)
  if (hours < 24) return { value: hours, unit: 'hour' }

  const days = Math.round(hours / 24)
  if (days < 30) return { value: days, unit: 'day' }

  const months = Math.round(days / 30)
  if (months < 12) return { value: months, unit: 'month' }

  return { value: Math.round((days / 365) * 10) / 10, unit: 'year' }
}

// --- queue ------------------------------------------------------------------

export interface QueueOptions {
  newPerDay?: number
  /** Start of the learner's current day. Defaults to local midnight of `now`. */
  dayStart?: Date
}

export interface ReviewQueue {
  /** Already-studied cards whose due time has passed, most overdue first. */
  due: ReviewRecord[]
  /** Never-studied cards still allowed today, in the order they were met. */
  fresh: ReviewRecord[]
  counts: {
    due: number
    /** New cards not yet started, including those beyond today's cap. */
    newTotal: number
    newIntroducedToday: number
    newRemainingToday: number
  }
  /** Earliest future due time, so the UI can say "next card in 8 minutes". */
  nextDueAt: Date | null
}

export function localDayStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function buildQueue(records: readonly ReviewRecord[], now: Date, options?: QueueOptions): ReviewQueue {
  const newPerDay = options?.newPerDay ?? DEFAULT_NEW_PER_DAY
  const dayStart = options?.dayStart ?? localDayStart(now)
  const nowMs = now.getTime()

  const due: ReviewRecord[] = []
  const unstarted: ReviewRecord[] = []
  let introducedToday = 0
  let nextDueMs = Number.POSITIVE_INFINITY

  for (const record of records) {
    if (record.firstReviewedAt && Date.parse(record.firstReviewedAt) >= dayStart.getTime()) {
      introducedToday += 1
    }

    if (record.scheduling.state === State.New) {
      unstarted.push(record)
      continue
    }

    const dueMs = Date.parse(record.scheduling.due)
    if (dueMs <= nowMs) due.push(record)
    else nextDueMs = Math.min(nextDueMs, dueMs)
  }

  due.sort((a, b) => Date.parse(a.scheduling.due) - Date.parse(b.scheduling.due))

  // Transcript order within a talk, talks in the order they were added.
  unstarted.sort(
    (a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt) || a.snapshot.startMs - b.snapshot.startMs,
  )

  const remaining = Math.max(0, newPerDay - introducedToday)

  return {
    due,
    fresh: unstarted.slice(0, remaining),
    counts: {
      due: due.length,
      newTotal: unstarted.length,
      newIntroducedToday: introducedToday,
      newRemainingToday: remaining,
    },
    nextDueAt: Number.isFinite(nextDueMs) ? new Date(nextDueMs) : null,
  }
}
