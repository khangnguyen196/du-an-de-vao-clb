import { z } from 'zod'
import type { KeyValueStorage } from '@/lib/study/srs-store'

/**
 * Learner-written notes on a flashcard: their own meanings and examples, and
 * which meaning the speaker actually used.
 *
 * Kept apart from review records on purpose. A record's snapshot is refreshed
 * by `enroll()` every time a deck is opened; notes stored there would be at the
 * mercy of that refresh. Notes share the card id (`ted:<slug>:<term>`), so the
 * review page finds them by `record.id`.
 */

export const NOTE_LIMITS = {
  meaning: 200,
  partOfSpeech: 40,
  example: 300,
  senses: 6,
} as const

export interface NoteSense {
  meaningVi: string
  /** Optional — an empty string when the learner leaves it out. */
  partOfSpeech: string
  /** The meaning used in the talk. At most one per note. */
  inTranscript: boolean
  /** Required: every meaning the learner writes carries its own example. */
  example: { en: string; vi: string }
}

export interface CardNote {
  id: string
  senses: NoteSense[]
  updatedAt: string
}

export type NoteSenseField = 'meaningVi' | 'partOfSpeech' | 'exampleEn' | 'exampleVi'

export type NoteIssue =
  | {
      scope: 'sense'
      senseIndex: number
      field: NoteSenseField
      code: 'required' | 'too-long'
      max?: number
    }
  | { scope: 'note'; code: 'empty' | 'too-many' | 'multiple-in-transcript' }

export type NoteValidation = { ok: true; senses: NoteSense[] } | { ok: false; issues: NoteIssue[] }

/**
 * The note rules, in one place, for both the form and the store — so what the
 * form accepts is exactly what the store will write.
 *
 * Agreed with the learner: no minimum number of meanings (one is fine), but
 * every meaning needs an example sentence AND its Vietnamese translation.
 * Whitespace does not count as content.
 */
export function validateNote(senses: readonly NoteSense[]): NoteValidation {
  const issues: NoteIssue[] = []

  const normalized: NoteSense[] = senses.map((sense) => ({
    meaningVi: sense.meaningVi.trim(),
    partOfSpeech: sense.partOfSpeech.trim(),
    inTranscript: sense.inTranscript,
    example: { en: sense.example.en.trim(), vi: sense.example.vi.trim() },
  }))

  if (normalized.length === 0) issues.push({ scope: 'note', code: 'empty' })
  if (normalized.length > NOTE_LIMITS.senses) issues.push({ scope: 'note', code: 'too-many' })
  if (normalized.filter((sense) => sense.inTranscript).length > 1) {
    issues.push({ scope: 'note', code: 'multiple-in-transcript' })
  }

  normalized.forEach((sense, senseIndex) => {
    const check = (field: NoteSenseField, value: string, required: boolean, max: number) => {
      if (required && value.length === 0) issues.push({ scope: 'sense', senseIndex, field, code: 'required' })
      else if (value.length > max) issues.push({ scope: 'sense', senseIndex, field, code: 'too-long', max })
    }
    check('meaningVi', sense.meaningVi, true, NOTE_LIMITS.meaning)
    check('partOfSpeech', sense.partOfSpeech, false, NOTE_LIMITS.partOfSpeech)
    check('exampleEn', sense.example.en, true, NOTE_LIMITS.example)
    check('exampleVi', sense.example.vi, true, NOTE_LIMITS.example)
  })

  return issues.length > 0 ? { ok: false, issues } : { ok: true, senses: normalized }
}

export class NoteValidationError extends Error {
  constructor(readonly issues: NoteIssue[]) {
    super('The note breaks the note rules')
    this.name = 'NoteValidationError'
  }
}

// --- persistence ------------------------------------------------------------

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'not an ISO date')

const StoredNoteSchema = z.object({
  id: z.string().min(1),
  updatedAt: isoDate,
  senses: z.array(
    z.object({
      meaningVi: z.string(),
      partOfSpeech: z.string(),
      inTranscript: z.boolean(),
      example: z.object({ en: z.string(), vi: z.string() }),
    }),
  ),
})

const StoredFileSchema = z.object({
  version: z.literal(1),
  notes: z.array(z.unknown()),
})

export const NOTES_STORAGE_KEY = 'abc:notes:v1'

/** Async so the M2 Supabase implementation can drop in without touching callers. */
export interface NotesStore {
  list(): Promise<CardNote[]>
  get(id: string): Promise<CardNote | null>
  /** Throws `NoteValidationError` when the note breaks the rules. */
  put(note: CardNote): Promise<void>
  remove(id: string): Promise<void>
}

export interface LocalNotesStoreOptions {
  onCorrupt?: (dropped: number) => void
}

/**
 * Same stance as `LocalReviewStore`: reads are forgiving (a bad record is
 * dropped alone, a throwing storage reads as empty), writes are strict.
 */
export class LocalNotesStore implements NotesStore {
  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly options: LocalNotesStoreOptions = {},
  ) {}

  private readAll(): Map<string, CardNote> {
    const notes = new Map<string, CardNote>()
    if (!this.storage) return notes

    let raw: string | null
    try {
      raw = this.storage.getItem(NOTES_STORAGE_KEY)
    } catch {
      return notes
    }
    if (!raw) return notes

    let file: z.infer<typeof StoredFileSchema>
    try {
      file = StoredFileSchema.parse(JSON.parse(raw))
    } catch {
      this.options.onCorrupt?.(1)
      return notes
    }

    let dropped = 0
    for (const candidate of file.notes) {
      const parsed = StoredNoteSchema.safeParse(candidate)
      const valid = parsed.success ? validateNote(parsed.data.senses) : null
      if (parsed.success && valid?.ok) notes.set(parsed.data.id, { ...parsed.data, senses: valid.senses })
      else dropped += 1
    }
    if (dropped > 0) this.options.onCorrupt?.(dropped)

    return notes
  }

  private writeAll(notes: Map<string, CardNote>): void {
    if (!this.storage) return
    try {
      this.storage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ version: 1, notes: [...notes.values()] }))
    } catch {
      // Quota or blocked storage: the note is not remembered, the page keeps working.
    }
  }

  async list(): Promise<CardNote[]> {
    return [...this.readAll().values()]
  }

  async get(id: string): Promise<CardNote | null> {
    return this.readAll().get(id) ?? null
  }

  async put(note: CardNote): Promise<void> {
    const parsed = StoredNoteSchema.parse(note)
    const valid = validateNote(parsed.senses)
    if (!valid.ok) throw new NoteValidationError(valid.issues)

    const all = this.readAll()
    all.set(parsed.id, { ...parsed, senses: valid.senses })
    this.writeAll(all)
  }

  async remove(id: string): Promise<void> {
    const all = this.readAll()
    if (!all.delete(id)) return
    this.writeAll(all)
  }
}

export function browserNotesStore(options?: LocalNotesStoreOptions): NotesStore {
  let storage: KeyValueStorage | null = null
  try {
    storage = typeof window === 'undefined' ? null : window.localStorage
  } catch {
    storage = null
  }
  return new LocalNotesStore(storage, options)
}
