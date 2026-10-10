import { z } from 'zod'

/**
 * Persistence for spaced-repetition progress.
 *
 * Every card stores a snapshot of its content next to its scheduling state, so
 * the review queue can mix cards from many talks without refetching each talk.
 * The store never schedules anything itself — that is `lib/study/srs.ts`.
 */

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'not an ISO date')

/** Scheduling state as ts-fsrs defines `Card`, with dates kept as ISO strings. */
const SchedulingSchema = z.object({
  due: isoDate,
  stability: z.number().finite(),
  difficulty: z.number().finite(),
  elapsed_days: z.number().finite(),
  scheduled_days: z.number().finite(),
  learning_steps: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  /** 0 New · 1 Learning · 2 Review · 3 Relearning */
  state: z.number().int().min(0).max(3),
  last_review: isoDate.nullable(),
})

const SenseSnapshotSchema = z.object({
  meaningVi: z.string(),
  partOfSpeech: z.string(),
  isCommon: z.boolean(),
  inTranscript: z.boolean(),
  example: z.object({ en: z.string(), vi: z.string() }),
})

const SnapshotSchema = z.object({
  display: z.string(),
  ipa: z.string(),
  partOfSpeech: z.string(),
  meaningVi: z.string(),
  context: z.string(),
  /**
   * Optional so records saved before quizzes existed still load; they pick it
   * up the next time their deck is opened.
   */
  contextMatch: z.object({ start: z.number().int().nonnegative(), length: z.number().int().positive() }).optional(),
  startMs: z.number().finite(),
  cueIdx: z.number().int().nonnegative(),
  sourceTitle: z.string(),
  /** In-app path back to the talk the card came from. */
  sourcePath: z.string(),
  /**
   * Optional so records saved before senses existed still load. They pick up
   * senses the next time their deck is opened.
   */
  senses: z.array(SenseSnapshotSchema).optional(),
  singleCommonSense: z.boolean().optional(),
})

export const ReviewRecordSchema = z.object({
  /** `ted:<slug>:<term>` — one card per term per talk. */
  id: z.string().min(1),
  deckId: z.string().min(1),
  term: z.string().min(1),
  snapshot: SnapshotSchema,
  scheduling: SchedulingSchema,
  addedAt: isoDate,
  /** When the card left "new" — drives the daily new-card cap. */
  firstReviewedAt: isoDate.nullable(),
  /**
   * Whether the learner keeps this word in their word book, and so reviews it.
   * `false` hides the card but keeps its scheduling, so saving it again picks
   * up where it left off. Absent on records from before the word book existed,
   * when opening a deck enrolled every card — see `isInBook` in `srs.ts`.
   */
  inBook: z.boolean().optional(),
})

export type ReviewRecord = z.infer<typeof ReviewRecordSchema>
export type ReviewSnapshot = z.infer<typeof SnapshotSchema>
export type ReviewScheduling = z.infer<typeof SchedulingSchema>

/**
 * Async on purpose even though localStorage is synchronous: the M2 replacement
 * is a network call, and swapping it in must not ripple through every caller.
 */
export interface ReviewStore {
  list(): Promise<ReviewRecord[]>
  get(id: string): Promise<ReviewRecord | null>
  /** Inserts or replaces whole records. */
  putMany(records: readonly ReviewRecord[]): Promise<void>
}

/** The slice of the Web Storage API the store needs — easy to fake in tests. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export const REVIEW_STORAGE_KEY = 'abc:srs:v1'

const StoredFileSchema = z.object({
  version: z.literal(1),
  records: z.array(z.unknown()),
})

export interface LocalReviewStoreOptions {
  /** Called with how many stored records were unreadable and dropped. */
  onCorrupt?: (dropped: number) => void
}

/**
 * Reads are forgiving, writes are strict. A single corrupt record — an old
 * shape, a hand-edited value — is dropped on its own instead of taking the
 * whole review queue down with it. A storage that throws (private window,
 * blocked site data) behaves as an empty store rather than crashing the page.
 */
export class LocalReviewStore implements ReviewStore {
  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly options: LocalReviewStoreOptions = {},
  ) {}

  private readAll(): Map<string, ReviewRecord> {
    const records = new Map<string, ReviewRecord>()
    if (!this.storage) return records

    let raw: string | null
    try {
      raw = this.storage.getItem(REVIEW_STORAGE_KEY)
    } catch {
      return records
    }
    if (!raw) return records

    let file: z.infer<typeof StoredFileSchema>
    try {
      file = StoredFileSchema.parse(JSON.parse(raw))
    } catch {
      this.options.onCorrupt?.(1)
      return records
    }

    let dropped = 0
    for (const candidate of file.records) {
      const parsed = ReviewRecordSchema.safeParse(candidate)
      if (parsed.success) records.set(parsed.data.id, parsed.data)
      else dropped += 1
    }
    if (dropped > 0) this.options.onCorrupt?.(dropped)

    return records
  }

  private writeAll(records: Map<string, ReviewRecord>): void {
    if (!this.storage) return
    const file = { version: 1 as const, records: [...records.values()] }
    try {
      this.storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(file))
    } catch {
      // Quota exceeded or storage blocked: progress is not remembered, but the
      // session in front of the learner keeps working.
    }
  }

  async list(): Promise<ReviewRecord[]> {
    return [...this.readAll().values()]
  }

  async get(id: string): Promise<ReviewRecord | null> {
    return this.readAll().get(id) ?? null
  }

  async putMany(records: readonly ReviewRecord[]): Promise<void> {
    if (records.length === 0) return
    const all = this.readAll()
    for (const record of records) all.set(record.id, ReviewRecordSchema.parse(record))
    this.writeAll(all)
  }
}

/** The browser store, or an inert one where storage is unavailable. */
export function browserReviewStore(options?: LocalReviewStoreOptions): ReviewStore {
  let storage: KeyValueStorage | null = null
  try {
    storage = typeof window === 'undefined' ? null : window.localStorage
  } catch {
    storage = null
  }
  return new LocalReviewStore(storage, options)
}
