import type { Cue } from '@/types/transcript'

/**
 * Binary search for the cue playing at `positionMs`.
 *
 * A two-hour talk can hold 3000+ cues and this runs on every animation frame,
 * so a linear `.find()` here would burn the frame budget. Cues are assumed
 * sorted by `startMs`, which `normalizeCues` guarantees.
 *
 * Returns the index of the last cue that starts at or before `positionMs`,
 * or -1 when playback sits before the first cue.
 */
export function findActiveCueIndex(cues: readonly Cue[], positionMs: number): number {
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
