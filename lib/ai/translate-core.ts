import { z } from 'zod'
import type { AlignResult } from '@/lib/ingest/align'
import type { Cue } from '@/types/transcript'

/** Lines per model call — small enough that one answer stays well inside output limits. */
export const TRANSLATION_BATCH_SIZE = 40
/** Untranslated neighbours sent on each side so a sentence split across batches reads right. */
export const TRANSLATION_CONTEXT_LINES = 2

export interface TranslationBatch {
  /** Global cue positions and their English text, in order. */
  lines: { index: number; text: string }[]
  /** Context only — the model is told not to translate these. */
  before: string[]
  after: string[]
}

export function buildTranslationBatches(
  cues: readonly Cue[],
  size = TRANSLATION_BATCH_SIZE,
  context = TRANSLATION_CONTEXT_LINES,
): TranslationBatch[] {
  const batches: TranslationBatch[] = []

  for (let start = 0; start < cues.length; start += size) {
    const end = Math.min(start + size, cues.length)
    batches.push({
      lines: cues.slice(start, end).map((cue, offset) => ({ index: start + offset, text: cue.text })),
      before: cues.slice(Math.max(0, start - context), start).map((cue) => cue.text),
      after: cues.slice(end, end + context).map((cue) => cue.text),
    })
  }

  return batches
}

/**
 * Wire schema for one batch. Bare types and strict objects only — structured
 * outputs do not accept numeric or length constraints, so integer-ness and
 * range are checked in `mergeTranslations` instead.
 */
export const TranslationWireSchema = z.strictObject({
  lines: z.array(
    z.strictObject({
      index: z.number(),
      vi: z.string(),
    }),
  ),
})

export type TranslationWire = z.infer<typeof TranslationWireSchema>

/**
 * Places each batch's answers back onto the cues.
 *
 * An index is accepted only if it belongs to the batch that returned it: a
 * model that "helpfully" answers for a context line, or invents a number, must
 * not be able to write text under a line it was never asked to translate.
 * A batch that failed outright leaves its lines empty rather than guessed.
 */
export function mergeTranslations(
  cues: readonly Cue[],
  batches: readonly TranslationBatch[],
  outputs: readonly (TranslationWire | null)[],
): AlignResult {
  const texts: (string | null)[] = cues.map(() => null)

  batches.forEach((batch, position) => {
    const output = outputs[position]
    if (!output) return

    const allowed = new Set(batch.lines.map((line) => line.index))
    for (const entry of output.lines) {
      if (!Number.isInteger(entry.index) || !allowed.has(entry.index)) continue
      if (texts[entry.index] !== null) continue

      const vi = entry.vi.trim()
      if (vi) texts[entry.index] = vi
    }
  })

  const filled = texts.filter((text) => text !== null).length
  return { texts, coverage: cues.length === 0 ? 0 : filled / cues.length }
}

/**
 * Puts merged translations back onto the cues.
 *
 * Kept separate from the model call so it can run wherever the texts land —
 * the server when it waits for the translation, the browser when the
 * translation arrives after the page was already sent. A line the model left
 * empty keeps its cue untouched: `translation` stays absent rather than becoming
 * an empty string, so the UI never renders a blank line as if it were a
 * translation.
 */
export function applyTranslations(cues: readonly Cue[], texts: readonly (string | null)[]): Cue[] {
  return cues.map((cue, index) => {
    const text = texts[index]
    return text ? { ...cue, translation: text } : cue
  })
}
