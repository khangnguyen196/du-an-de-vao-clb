import type { Cue, CueMark } from '@/types/transcript'

/**
 * Binary search for the cue playing at `positionMs` — or, given a cue's marks,
 * the word or phrase being spoken inside it.
 *
 * A two-hour talk can hold 3000+ cues and this runs on every animation frame,
 * so a linear `.find()` here would burn the frame budget. Items are assumed
 * sorted by `startMs`, which `normalizeCues` and the word aligner guarantee.
 *
 * Returns the index of the last item that starts at or before `positionMs`,
 * or -1 when playback sits before the first one.
 */
export function findActiveCueIndex(cues: readonly { startMs: number }[], positionMs: number): number {
  let low = 0
  let high = cues.length - 1
  let result = -1

  while (low <= high) {
    const mid = (low + high) >> 1
    const cue = cues[mid]
    if (!cue) break

    if (cue.startMs <= positionMs) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result
}

/**
 * A cue's text cut at its marks, one piece per mark. Any text before the first
 * mark (an opening quote) stays with the first piece, so the pieces always
 * join back to exactly `text` — the line is cut, never rebuilt.
 */
export function splitAtMarks(text: string, marks: readonly CueMark[]): string[] {
  return marks.map((mark, index) => {
    const from = index === 0 ? 0 : mark.offset
    const to = marks[index + 1]?.offset ?? text.length
    return text.slice(from, to)
  })
}

/**
 * Plain-text search over cues. Returns matching indices in playback order.
 *
 * Translations are only searched when they are on screen. Matching hidden text
 * would mark a line as a hit while nothing visible in it matches the query.
 */
export function searchCues(
  cues: readonly Cue[],
  query: string,
  options?: { includeTranslation?: boolean },
): number[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return []

  const matches: number[] = []
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i]
    if (!cue) continue

    const inText = cue.text.toLowerCase().includes(needle)
    const inTranslation =
      options?.includeTranslation === true && (cue.translation?.toLowerCase().includes(needle) ?? false)

    if (inText || inTranslation) matches.push(i)
  }
  return matches
}
