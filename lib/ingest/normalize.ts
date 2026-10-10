import type { Cue } from '@/types/transcript'

/** What every ingest source (captions, Whisper, manual) hands to the normalizer. */
export interface RawSegment {
  startMs: number
  endMs: number
  text: string
  speaker?: string
}

export interface NormalizeOptions {
  /** Flush once the buffer reaches this many characters, even mid-sentence. */
  maxChars?: number
  /** Flush once the buffer spans this long, even mid-sentence. */
  maxDurationMs?: number
  /** A silence longer than this is treated as a hard break. */
  maxGapMs?: number
  /** Don't end a cue below this length — avoids one-word orphans. */
  minChars?: number
}

const DEFAULTS: Required<NormalizeOptions> = {
  maxChars: 220,
  maxDurationMs: 12_000,
  maxGapMs: 2_000,
  minChars: 40,
}

/**
 * Bracketed sound events, in both notations: TED writes "(Laughter)" while
 * caption tracks tend to write "[Laughter]". Only a bracket whose ENTIRE
 * contents is a known sound event matches, so a genuine parenthetical aside in
 * the speech is left alone.
 *
 * Missing these does not merely leave litter in the transcript — they leak
 * into the vocabulary extractor, where "laughter" becomes the top flashcard.
 */
const NOISE_TAG =
  /[[(]\s*(music|applause|laughter|laughs|laughing|cheering|cheers|silence|inaudible|crosstalk|foreign|blank_audio|video|audio|sound effects?|nhạc|âm nhạc|tiếng nhạc|cười|cười lớn|tiếng cười|vỗ tay|tiếng vỗ tay)\s*[\])]/gi

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => HTML_ENTITIES[match] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
}

/**
 * Entity decoding, stage-direction removal and whitespace collapse for one
 * caption fragment. Shared by the normalizer and the translation aligner so
 * both tracks of a talk are cleaned by exactly the same rules.
 */
export function cleanCaptionText(text: string): string {
  return decodeEntities(text)
    .replace(NOISE_TAG, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sentence-final punctuation across latin + CJK + Vietnamese usage. */
function endsSentence(text: string): boolean {
  return /[.!?…。！？]["')\]]?$/.test(text)
}

/**
 * Caption tracks arrive as fragments — often 3-5 words each, split mid-sentence
 * to fit two lines on screen. Reading those one per row is miserable, so we
 * merge fragments back into sentences.
 *
 * The merged cue keeps the ORIGINAL start of its first fragment and the end of
 * its last, so seeking stays frame-accurate against the source.
 */
export function normalizeCues(segments: readonly RawSegment[], options?: NormalizeOptions): Cue[] {
  const config = { ...DEFAULTS, ...options }
  const cues: Cue[] = []

  let buffer: string[] = []
  let startMs = 0
  let endMs = 0
  let speaker: string | undefined
  let length = 0

  const flush = () => {
    if (buffer.length === 0) return
    const text = buffer.join(' ').replace(/\s+/g, ' ').trim()
    if (text.length > 0) {
      cues.push({ idx: cues.length, startMs, endMs, text, ...(speaker ? { speaker } : {}) })
    }
    buffer = []
    length = 0
    speaker = undefined
  }

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    if (!segment) continue

    const text = cleanCaptionText(segment.text)
    if (text.length === 0) continue

    // A new speaker always starts a new cue.
    if (buffer.length > 0 && segment.speaker !== speaker) flush()

    if (buffer.length === 0) {
      startMs = segment.startMs
      speaker = segment.speaker
    }

    buffer.push(text)
    endMs = Math.max(segment.endMs, segment.startMs)
    length += text.length + 1

    const next = segments[i + 1]
    const gapMs = next ? next.startMs - endMs : Number.POSITIVE_INFINITY
    const spanMs = endMs - startMs

    const shouldFlush =
      !next ||
      gapMs >= config.maxGapMs ||
      length >= config.maxChars ||
      spanMs >= config.maxDurationMs ||
      (endsSentence(text) && length >= config.minChars)

    if (shouldFlush) flush()
  }

  flush()

  // Captions occasionally overlap; keep the timeline monotonic so binary
  // search over startMs stays correct.
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i]
    const next = cues[i + 1]
    if (cue && next && cue.endMs > next.startMs) cue.endMs = next.startMs
    if (cue && cue.endMs <= cue.startMs) cue.endMs = cue.startMs + 1000
  }

  return cues
}
