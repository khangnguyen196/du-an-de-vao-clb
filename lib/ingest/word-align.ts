import type { Cue, CueMark } from '@/types/transcript'

/**
 * Lining up two word sequences: TED's transcript (the text we show, never
 * changed) and what Whisper heard (with a time on every word). Whisper's
 * words only lend their times; the words on screen stay TED's.
 */

/** Comparison key for one written word: lower case, letters/digits/apostrophes only. */
export function wordKey(word: string): string {
  return word
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']/g, '')
    .replace(/^'+|'+$/g, '')
}

export interface Alignment {
  /** Edit distance between the two sequences (substitutions + deletions + insertions). */
  distance: number
  /** For each reference position, the hypothesis position it matched exactly, or -1. */
  matchOf: Int32Array
}

/**
 * Minimum edit distance alignment, then a walk back that keeps only exact
 * matches. Quadratic: a 20-minute talk is ~3 000 words a side, ~9 M cells.
 */
export function alignSequences(reference: readonly string[], hypothesis: readonly string[]): Alignment {
  const n = reference.length
  const m = hypothesis.length
  const width = m + 1
  const cost = new Uint32Array((n + 1) * width)
  for (let j = 0; j <= m; j += 1) cost[j] = j
  for (let i = 1; i <= n; i += 1) {
    cost[i * width] = i
    const ref = reference[i - 1]
    for (let j = 1; j <= m; j += 1) {
      const substitute = cost[(i - 1) * width + j - 1]! + (ref === hypothesis[j - 1] ? 0 : 1)
      const remove = cost[(i - 1) * width + j]! + 1
      const insert = cost[i * width + j - 1]! + 1
      cost[i * width + j] = Math.min(substitute, remove, insert)
    }
  }

  const matchOf = new Int32Array(n).fill(-1)
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    const here = cost[i * width + j]!
    const same = reference[i - 1] === hypothesis[j - 1]
    if (here === cost[(i - 1) * width + j - 1]! + (same ? 0 : 1)) {
      if (same) matchOf[i - 1] = j - 1
      i -= 1
      j -= 1
    } else if (here === cost[(i - 1) * width + j]! + 1) {
      i -= 1
    } else {
      j -= 1
    }
  }

  return { distance: cost[n * width + m]!, matchOf }
}

export interface TimedWord {
  startMs: number
  text: string
}

export interface WordMarksResult {
  /** One entry per cue: its word marks, or null when the cue has no words. */
  marks: (CueMark[] | null)[]
  /** Share of the transcript's words that Whisper heard exactly, 0–1. */
  matchedShare: number
  wordCount: number
}

/**
 * Word-level marks for every cue: each word of TED's text gets the start time
 * of the Whisper word it matched. A word Whisper heard differently (a name, a
 * number written out) takes a time interpolated between the nearest matched
 * words on either side — a few hundred milliseconds of span, never a guess
 * across a line. Times are kept non-decreasing.
 *
 * Offsets point into `cue.text` as it is, so the text on screen is cut, not
 * rebuilt.
 */
export function buildWordMarks(cues: readonly Pick<Cue, 'text' | 'startMs' | 'endMs'>[], heard: readonly TimedWord[]): WordMarksResult {
  const words: { cue: number; offset: number; key: string }[] = []
  cues.forEach((cue, cueIndex) => {
    for (const match of cue.text.matchAll(/\S+/g)) {
      const key = wordKey(match[0])
      // Punctuation on its own ("--") rides with the word before it.
      if (key.length > 0) words.push({ cue: cueIndex, offset: match.index, key })
    }
  })

  const heardKeys = heard.map((word) => wordKey(word.text))
  const { matchOf } = alignSequences(
    words.map((word) => word.key),
    heardKeys,
  )

  // Matched words take Whisper's time; the rest are filled in below.
  const times: (number | null)[] = words.map((_, index) => {
    const at = matchOf[index]!
    return at >= 0 ? heard[at]!.startMs : null
  })

  let matched = 0
  for (const time of times) if (time !== null) matched += 1

  for (let index = 0; index < times.length; index += 1) {
    if (times[index] !== null) continue
    let before = index - 1
    while (before >= 0 && times[before] === null) before -= 1
    let after = index + 1
    while (after < times.length && times[after] === null) after += 1

    // The run [index, after) is spread evenly between its two anchors; with no
    // matched word on a side, the cue's own start or end stands in.
    const cue = cues[words[index]!.cue]!
    const low = before >= 0 ? times[before]! : cue.startMs
    const high = after < times.length ? times[after]! : Math.max(low, cue.endMs)
    for (let fill = index; fill < after; fill += 1) {
      times[fill] = Math.round(low + ((high - low) * (fill - before)) / (after - before))
    }
    index = after - 1
  }

  // Never step backwards: a mismatched alignment must not light words out of order.
  for (let index = 1; index < times.length; index += 1) {
    if (times[index]! < times[index - 1]!) times[index] = times[index - 1]!
  }

  const marks: (CueMark[] | null)[] = cues.map(() => null)
  words.forEach((word, index) => {
    const list = (marks[word.cue] ??= [])
    list.push({ offset: word.offset, startMs: times[index]! })
  })

  return { marks, matchedShare: words.length === 0 ? 0 : matched / words.length, wordCount: words.length }
}
