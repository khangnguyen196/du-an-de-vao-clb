import { NOTE_LIMITS, type CardNote, type NoteSense } from '@/lib/study/notes-store'
import type { VocabSense } from '@/types/study'

export type SenseOrigin = 'note' | 'model'

/** A meaning as shown on a card, tagged with who wrote it. */
export interface DisplaySense extends VocabSense {
  origin: SenseOrigin
}

function fromNote(sense: NoteSense): DisplaySense {
  return {
    meaningVi: sense.meaningVi,
    partOfSpeech: sense.partOfSpeech,
    // The learner does not classify their own meanings as common or not.
    isCommon: false,
    inTranscript: sense.inTranscript,
    example: sense.example,
    origin: 'note',
  }
}

export interface MergedCardContent {
  senses: DisplaySense[]
  hasAnyMeaning: boolean
  /** True when the learner picked the in-transcript meaning themselves. */
  noteDecidesInTranscript: boolean
}

/**
 * What the back of a card shows: the learner's own meanings first, then the
 * model's.
 *
 * When the learner has marked a meaning as the one used in the talk, that
 * decision wins — the model's "in this talk" tag is removed rather than showing
 * two conflicting tags.
 */
export function mergeCardContent(
  card: { senses?: readonly VocabSense[] },
  note: CardNote | null | undefined,
): MergedCardContent {
  const own = (note?.senses ?? []).map(fromNote)
  const noteDecidesInTranscript = own.some((sense) => sense.inTranscript)

  const model = (card.senses ?? []).map<DisplaySense>((sense) => ({
    ...sense,
    inTranscript: noteDecidesInTranscript ? false : sense.inTranscript,
    origin: 'model',
  }))

  const senses = [...own, ...model]
  return { senses, hasAnyMeaning: senses.length > 0, noteDecidesInTranscript }
}

/**
 * "Use as the meaning in this talk" on a model meaning.
 *
 * The sense is COPIED into the learner's note rather than referenced by index:
 * the model's senses are regenerated on every load, so an index would point at
 * a different meaning next time. If the note already holds the same meaning, it
 * is marked instead of duplicated.
 *
 * Returns null when the note is already full, so the caller can say so instead
 * of silently pushing out something the learner wrote.
 */
export function adoptAsInTranscript(
  note: CardNote | null | undefined,
  id: string,
  sense: VocabSense,
  now: Date,
): CardNote | null {
  const cleared = (note?.senses ?? []).map((existing) => ({ ...existing, inTranscript: false }))
  const key = sense.meaningVi.trim().toLowerCase()
  const match = cleared.findIndex((existing) => existing.meaningVi.trim().toLowerCase() === key)

  if (match >= 0) {
    cleared[match] = { ...cleared[match]!, inTranscript: true }
  } else {
    if (cleared.length >= NOTE_LIMITS.senses) return null
    cleared.unshift({
      meaningVi: sense.meaningVi,
      partOfSpeech: sense.partOfSpeech,
      inTranscript: true,
      example: { en: sense.example.en, vi: sense.example.vi },
    })
  }

  return { id, senses: cleared, updatedAt: now.toISOString() }
}
