import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { fingerprintCues } from '@/lib/ingest/translation-store'
import type { Cue, CueMark } from '@/types/transcript'

/**
 * When each word of a talk starts, measured by aligning a local Whisper run to
 * TED's transcript (`npm run align`). Lets the playing line light up word by
 * word instead of phrase by phrase.
 *
 * Only numbers — character offsets and milliseconds — so nothing of TED's text
 * is copied into the file. Tied to the exact cues it was made for by the same
 * fingerprint as stored translations: if TED edits the transcript, the file is
 * ignored and the line falls back to phrase marks.
 */
export const WORD_TIMING_DIR = join('data', 'word-timings', 'ted')

/** Below this share of words matched, the alignment is not trusted (wrong audio, wrong talk). */
export const MIN_MATCHED_SHARE = 0.6

const MarkTuple = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])

export const StoredWordTimingsSchema = z.strictObject({
  version: z.literal(1),
  slug: z.string().min(1),
  lang: z.string().min(1),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  cueCount: z.number().int().nonnegative(),
  engine: z.literal('faster-whisper'),
  model: z.string().min(1),
  matchedShare: z.number().min(MIN_MATCHED_SHARE).max(1),
  wordCount: z.number().int().nonnegative(),
  /** Per cue: `[offset, startMs]` for each word, or null for a cue without words. */
  cues: z.array(z.array(MarkTuple).nullable()),
  createdAt: z.iso.datetime(),
})

export type StoredWordTimings = z.infer<typeof StoredWordTimingsSchema>

export function wordTimingsPath(slug: string, lang: string, root = process.cwd()): string {
  return join(root, WORD_TIMING_DIR, `${slug}.${lang}.json`)
}

export function toStoredMarks(marks: readonly (CueMark[] | null)[]): StoredWordTimings['cues'] {
  return marks.map((list) => (list ? list.map((mark): [number, number] => [mark.offset, mark.startMs]) : null))
}

/** Offsets inside the text and both offsets and times never going backwards. */
function marksFit(text: string, marks: readonly (readonly [number, number])[]): boolean {
  return marks.every(
    ([offset, startMs], index) =>
      offset < text.length && (index === 0 || (offset > marks[index - 1]![0] && startMs >= marks[index - 1]![1])),
  )
}

/**
 * The cues with word marks applied, or null when there is no usable file.
 * Missing, malformed, made for other cues, or with marks that do not fit the
 * text — all count as absent; the cues keep their phrase marks.
 */
export function applyStoredWordTimings(slug: string, lang: string, cues: readonly Cue[], root = process.cwd()): Cue[] | null {
  const path = wordTimingsPath(slug, lang, root)
  if (!existsSync(path)) return null

  let stored: StoredWordTimings
  try {
    const result = StoredWordTimingsSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    if (!result.success) {
      console.warn(`[word-timings] ignoring malformed ${path}:`, result.error.issues[0]?.message)
      return null
    }
    stored = result.data
  } catch (error) {
    console.warn(`[word-timings] could not read ${path}:`, (error as Error).message)
    return null
  }

  if (stored.cueCount !== cues.length || stored.cues.length !== cues.length || stored.fingerprint !== fingerprintCues(cues)) {
    console.warn(`[word-timings] ignoring ${path}: made for a different version of the transcript`)
    return null
  }
  if (!stored.cues.every((marks, index) => !marks || marksFit(cues[index]!.text, marks))) {
    console.warn(`[word-timings] ignoring ${path}: marks do not fit the text`)
    return null
  }

  return cues.map((cue, index) => {
    const marks = stored.cues[index]
    if (!marks || marks.length === 0) return cue
    return { ...cue, marks: marks.map(([offset, startMs]) => ({ offset, startMs })), markUnit: 'word' as const }
  })
}

export function writeStoredWordTimings(stored: StoredWordTimings, root = process.cwd()): string {
  const valid = StoredWordTimingsSchema.parse(stored)
  const path = wordTimingsPath(valid.slug, valid.lang, root)
  mkdirSync(dirname(path), { recursive: true })
  // Compact: thousands of number pairs read better as data than as 9 000 lines.
  writeFileSync(path, `${JSON.stringify(valid)}\n`, 'utf8')
  return path
}
