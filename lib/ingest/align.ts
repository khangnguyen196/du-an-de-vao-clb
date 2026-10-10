import { findActiveCueIndex } from '@/lib/cues'
import { cleanCaptionText } from '@/lib/ingest/normalize'
import type { Cue } from '@/types/transcript'

/** A translated subtitle fragment with its own timing. */
export interface TimedText {
  startMs: number
  endMs: number
  text: string
}

export interface AlignResult {
  /** One entry per cue, in cue order. `null` where nothing was assigned. */
  texts: (string | null)[]
  /** Share of cues that received text, 0–1. */
  coverage: number
}

/**
 * A fragment that runs on for longer than this is treated as this long when
 * finding its midpoint. The last fragment of a talk has no "next start" to end
 * it, and an unbounded end would drag its midpoint far past the words.
 */
const MAX_FRAGMENT_MS = 8000

/**
 * Attaches translated subtitle fragments to the cues they belong to.
 *
 * TED's Vietnamese track is not cut the same way as the English one — different
 * number of fragments, start times that never line up exactly, drifting by
 * roughly half a second typically and up to about two and a half seconds. Index
 * matching therefore produces nonsense. Our cues, however, are whole sentences
 * several seconds long, so each fragment is assigned to the cue that contains
 * its time midpoint. That tolerates the drift for fragments in the middle of a
 * sentence; a fragment straddling a sentence boundary can still land one line
 * early or late, which is the known cost of this approach.
 *
 * Fragments are never split or rewritten, only moved as a whole and joined
 * with a space, so the translation shown is still the translator's own wording.
 */
export function alignTranslation(cues: readonly Cue[], fragments: readonly TimedText[]): AlignResult {
  const buckets: string[][] = cues.map(() => [])
  if (cues.length === 0) return { texts: [], coverage: 0 }

  const ordered = [...fragments].sort((a, b) => a.startMs - b.startMs)

  for (const fragment of ordered) {
    const text = cleanCaptionText(fragment.text)
    if (text.length === 0) continue

    const end = Math.min(Math.max(fragment.endMs, fragment.startMs), fragment.startMs + MAX_FRAGMENT_MS)
    const midpoint = (fragment.startMs + end) / 2

    let index = findActiveCueIndex(cues, midpoint)
    if (index === -1) index = 0

    // In a silence between two cues, the midpoint belongs to whichever is nearer.
    const cue = cues[index]
    const next = cues[index + 1]
    if (cue && next && midpoint > cue.endMs && next.startMs - midpoint < midpoint - cue.endMs) {
      index += 1
    }

    buckets[index]?.push(text)
  }

  const texts = buckets.map((parts) => (parts.length > 0 ? parts.join(' ') : null))
  const filled = texts.filter((text) => text !== null).length

  return { texts, coverage: filled / cues.length }
}
