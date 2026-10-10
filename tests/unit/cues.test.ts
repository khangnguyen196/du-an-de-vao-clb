import { describe, expect, it } from 'vitest'
import { findActiveCueIndex, searchCues } from '@/lib/cues'
import type { Cue } from '@/types/transcript'

const cues: Cue[] = [
  { idx: 0, startMs: 0, endMs: 2000, text: 'The first line about vulnerability' },
  { idx: 1, startMs: 2000, endMs: 5000, text: 'A second line about shame' },
  { idx: 2, startMs: 5000, endMs: 9000, text: 'A third line about Vulnerability again' },
  { idx: 3, startMs: 9000, endMs: 12_000, text: 'A fourth line about courage' },
]

describe('findActiveCueIndex', () => {
  it('returns -1 before the first cue starts', () => {
    expect(findActiveCueIndex(cues, -1)).toBe(-1)
  })

  it('matches a cue exactly on its start', () => {
    expect(findActiveCueIndex(cues, 0)).toBe(0)
    expect(findActiveCueIndex(cues, 2000)).toBe(1)
    expect(findActiveCueIndex(cues, 9000)).toBe(3)
  })

  it('matches a position inside a cue', () => {
    expect(findActiveCueIndex(cues, 3500)).toBe(1)
    expect(findActiveCueIndex(cues, 8999)).toBe(2)
  })

  it('stays on the last cue past the end', () => {
    expect(findActiveCueIndex(cues, 999_999)).toBe(3)
  })

  it('handles an empty transcript', () => {
    expect(findActiveCueIndex([], 1000)).toBe(-1)
  })

  it('agrees with a linear scan across a large transcript', () => {
    const many: Cue[] = Array.from({ length: 3000 }, (_, i) => ({
      idx: i,
      startMs: i * 4000,
      endMs: i * 4000 + 4000,
      text: `line ${i}`,
    }))

    const linear = (positionMs: number) => {
      let found = -1
      for (const cue of many) {
        if (cue.startMs <= positionMs) found = cue.idx
        else break
      }
      return found
    }

    for (const position of [-5, 0, 1, 3999, 4000, 1_234_567, 11_999_999, 99_999_999]) {
      expect(findActiveCueIndex(many, position)).toBe(linear(position))
    }
  })
})

describe('searchCues', () => {
  it('is case-insensitive and returns indices in playback order', () => {
    expect(searchCues(cues, 'vulnerability')).toEqual([0, 2])
  })

  it('returns nothing for a blank query', () => {
    expect(searchCues(cues, '   ')).toEqual([])
  })

  it('returns nothing when there is no match', () => {
    expect(searchCues(cues, 'zebra')).toEqual([])
  })
})
