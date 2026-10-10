import { z } from 'zod'
import type { RawSegment } from '@/lib/ingest/normalize'
import { alignSequences } from '@/lib/ingest/word-align'
import type { Cue } from '@/types/transcript'

/**
 * What `scripts/whisper/transcribe.py` prints: every recognised word with its
 * own start and end, already in milliseconds (the Python side converts, so no
 * seconds ever reach this codebase).
 *
 * Words rather than Whisper's segments because a segment boundary is wherever
 * the model paused decoding, often mid-sentence, and its start time drifts.
 * Word times come from the model's alignment and land on the spoken word.
 */
export const WhisperOutputSchema = z.strictObject({
  engine: z.literal('faster-whisper'),
  engineVersion: z.string().min(1),
  model: z.string().min(1),
  language: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  words: z.array(
    z.strictObject({
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      text: z.string(),
    }),
  ),
})

export type WhisperOutput = z.infer<typeof WhisperOutputSchema>
export type WhisperWord = WhisperOutput['words'][number]

/** A pause this long between two words ends a fragment even mid-sentence. */
const PAUSE_BREAK_MS = 1_000
/** Keeps a fragment from running on when the model leaves out punctuation. */
const MAX_FRAGMENT_WORDS = 40

function endsSentence(word: string): boolean {
  return /[.!?…]["')\]]?$/.test(word.trim())
}

/**
 * Words → sentence-sized fragments for `normalizeCues`, which merges fragments
 * but never splits one. Breaking at every sentence end here is what lets a cue
 * start exactly where its sentence starts; the normaliser then joins short
 * sentences back together under the same rules as TED's own transcripts.
 *
 * Whisper puts the space before each word into the word itself (" world"), so
 * words are concatenated as given and only the whitespace is tidied.
 */
export function wordsToSegments(words: readonly WhisperWord[]): RawSegment[] {
  const segments: RawSegment[] = []
  let current: WhisperWord[] = []

  const flush = () => {
    const first = current[0]
    const last = current[current.length - 1]
    if (first && last) {
      const text = current
        .map((word) => word.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      if (text.length > 0) segments.push({ startMs: first.startMs, endMs: Math.max(last.endMs, first.startMs), text })
    }
    current = []
  }

  words.forEach((word, index) => {
    if (word.text.trim().length === 0) return
    current.push(word)
    const next = words[index + 1]
    if (
      !next ||
      endsSentence(word.text) ||
      next.startMs - word.endMs >= PAUSE_BREAK_MS ||
      current.length >= MAX_FRAGMENT_WORDS
    ) {
      flush()
    }
  })
  flush()

  return segments
}

// --- Measuring against a reference transcript ---------------------------------

/** Lower-case word tokens with punctuation stripped, for comparison only. */
export function comparableTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && token !== "'")
}

export interface WhisperAccuracy {
  /** Word error rate against the reference: (substitutions + deletions + insertions) / reference words. */
  wordErrorRate: number
  referenceWords: number
  /** Reference cues whose first word was matched to a recognised word. */
  measuredCues: number
  totalCues: number
  /**
   * Recognised start of each matched cue's first word minus the reference cue
   * start, in ms. Positive = Whisper places the line later than TED does.
   */
  startOffsetsMs: number[]
}

/**
 * How far a Whisper transcript is from TED's own for the same talk: a word
 * error rate from an edit-distance alignment, and — through the same alignment
 * — how far apart the two put the start of each line. That second number is
 * what the reader feels: it is how early or late a line lights up.
 */
export function measureAgainstReference(reference: readonly Cue[], words: readonly WhisperWord[]): WhisperAccuracy {
  const refTokens: { token: string; cue: number; firstOfCue: boolean }[] = []
  reference.forEach((cue, cueIndex) => {
    comparableTokens(cue.text).forEach((token, position) => {
      refTokens.push({ token, cue: cueIndex, firstOfCue: position === 0 })
    })
  })

  const hypTokens: { token: string; startMs: number }[] = []
  for (const word of words) {
    for (const token of comparableTokens(word.text)) hypTokens.push({ token, startMs: word.startMs })
  }

  const n = refTokens.length
  const { distance, matchOf } = alignSequences(
    refTokens.map((ref) => ref.token),
    hypTokens.map((hyp) => hyp.token),
  )

  const startOffsetsMs: number[] = []
  refTokens.forEach((ref, index) => {
    const at = matchOf[index]!
    const cue = reference[ref.cue]
    if (ref.firstOfCue && at >= 0 && cue) startOffsetsMs.push(hypTokens[at]!.startMs - cue.startMs)
  })

  return {
    wordErrorRate: n === 0 ? 0 : distance / n,
    referenceWords: n,
    measuredCues: startOffsetsMs.length,
    totalCues: reference.length,
    startOffsetsMs,
  }
}

/** Value below which the given share of `values` falls (nearest rank). */
export function percentile(values: readonly number[], share: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(share * sorted.length) - 1))
  return sorted[rank]!
}
