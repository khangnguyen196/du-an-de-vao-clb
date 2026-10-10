import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findActiveCueIndex, splitAtMarks } from '@/lib/cues'
import { normalizeCues } from '@/lib/ingest/normalize'
import { fingerprintCues } from '@/lib/ingest/translation-store'
import { alignSequences, buildWordMarks, wordKey } from '@/lib/ingest/word-align'
import {
  applyStoredWordTimings,
  toStoredMarks,
  writeStoredWordTimings,
  type StoredWordTimings,
} from '@/lib/ingest/word-timing-store'
import type { Cue } from '@/types/transcript'

const seg = (startMs: number, endMs: number, text: string) => ({ startMs, endMs, text })

describe('phrase marks from TED fragments', () => {
  it('records where each merged fragment starts, by offset into the final text', () => {
    const [cue] = normalizeCues(
      [seg(0, 5000, 'A few years ago,\nI felt like I was stuck in a rut,'), seg(5000, 7000, 'so I decided to follow.')],
      { marks: true },
    )
    expect(cue?.text).toBe('A few years ago, I felt like I was stuck in a rut, so I decided to follow.')
    expect(cue?.marks).toEqual([
      { offset: 0, startMs: 0 },
      { offset: 'A few years ago, I felt like I was stuck in a rut, '.length, startMs: 5000 },
    ])
    expect(cue?.markUnit).toBe('phrase')
    expect(cue?.text.slice(cue.marks![1]!.offset)).toBe('so I decided to follow.')
  })

  it('adds no marks to a single-fragment cue, nor unless asked', () => {
    expect(normalizeCues([seg(0, 2000, 'One whole sentence.')], { marks: true })[0]?.marks).toBeUndefined()
    expect(normalizeCues([seg(0, 1000, 'Part one'), seg(1000, 2000, 'and two.')])[0]?.marks).toBeUndefined()
  })

  it('skips a fragment that was only a sound tag without shifting later offsets', () => {
    const [cue] = normalizeCues([seg(0, 1000, 'So here we are'), seg(1000, 2000, '(Laughter)'), seg(2000, 3000, 'at last.')], {
      marks: true,
    })
    expect(cue?.text).toBe('So here we are at last.')
    expect(cue?.marks?.map((mark) => cue.text.slice(mark.offset))).toEqual(['So here we are at last.', 'at last.'])
  })
})

describe('splitAtMarks / findActiveCueIndex over marks', () => {
  const text = '"Hello there, friends."'
  const marks = [
    { offset: 1, startMs: 1000 },
    { offset: 7, startMs: 1300 },
    { offset: 14, startMs: 1600 },
  ]

  it('cuts the line without losing or adding a character', () => {
    const pieces = splitAtMarks(text, marks)
    expect(pieces).toEqual(['"Hello ', 'there, ', 'friends."'])
    expect(pieces.join('')).toBe(text)
  })

  it('finds the piece being spoken', () => {
    expect(findActiveCueIndex(marks, 900)).toBe(-1)
    expect(findActiveCueIndex(marks, 1300)).toBe(1)
    expect(findActiveCueIndex(marks, 9000)).toBe(2)
  })
})

describe('word alignment', () => {
  it('normalises written words for comparison', () => {
    expect(wordKey('“Hello,')).toBe('hello')
    expect(wordKey("It's")).toBe("it's")
    expect(wordKey('—')).toBe('')
  })

  it('aligns exact matches through an insertion and a substitution', () => {
    const { distance, matchOf } = alignSequences(['a', 'b', 'c', 'd'], ['a', 'x', 'b', 'q', 'd'])
    expect(distance).toBe(2)
    expect([...matchOf]).toEqual([0, 2, -1, 4])
  })

  const cues: Pick<Cue, 'text' | 'startMs' | 'endMs'>[] = [
    { text: 'Hello there, friends.', startMs: 1000, endMs: 3000 },
    { text: 'It is 30 days -- really.', startMs: 3000, endMs: 6000 },
  ]
  const heard = [
    { startMs: 1100, text: ' Hello' },
    { startMs: 1400, text: ' there,' },
    { startMs: 1700, text: ' friends.' },
    { startMs: 3200, text: ' It' },
    { startMs: 3400, text: ' is' },
    { startMs: 3600, text: ' thirty' },
    { startMs: 3900, text: ' days,' },
    { startMs: 4400, text: ' really.' },
  ]

  it('gives each of TED’s words the time Whisper heard it at, by offset into TED’s text', () => {
    const result = buildWordMarks(cues, heard)
    expect(result.marks[0]).toEqual([
      { offset: 0, startMs: 1100 },
      { offset: 6, startMs: 1400 },
      { offset: 13, startMs: 1700 },
    ])
    // "30" was heard as "thirty": timed between its neighbours. "--" is not a word.
    expect(result.marks[1]).toEqual([
      { offset: 0, startMs: 3200 },
      { offset: 3, startMs: 3400 },
      { offset: 6, startMs: 3650 },
      { offset: 9, startMs: 3900 },
      { offset: 17, startMs: 4400 },
    ])
    expect(result.wordCount).toBe(8)
    expect(result.matchedShare).toBeCloseTo(7 / 8)
  })

  it('never lets times run backwards', () => {
    const scrambled = [
      { startMs: 2000, text: 'Hello' },
      { startMs: 1000, text: 'there' },
    ]
    const result = buildWordMarks([{ text: 'Hello there', startMs: 0, endMs: 3000 }], scrambled)
    const times = result.marks[0]!.map((mark) => mark.startMs)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('times words before the first match from the cue start', () => {
    const result = buildWordMarks([{ text: 'Um so hello', startMs: 1000, endMs: 4000 }], [{ startMs: 3000, text: 'hello' }])
    expect(result.marks[0]).toEqual([
      { offset: 0, startMs: 1667 },
      { offset: 3, startMs: 2333 },
      { offset: 6, startMs: 3000 },
    ])
  })
})

describe('word timing store', () => {
  let root: string
  const cues: Cue[] = [
    { idx: 0, startMs: 1000, endMs: 3000, text: 'Hello there, friends.' },
    { idx: 1, startMs: 3000, endMs: 6000, text: 'Bye.' },
  ]

  function stored(overrides: Partial<StoredWordTimings> = {}): StoredWordTimings {
    return {
      version: 1,
      slug: 'a_talk',
      lang: 'en',
      fingerprint: fingerprintCues(cues),
      cueCount: 2,
      engine: 'faster-whisper',
      model: 'small.en',
      matchedShare: 0.9,
      wordCount: 4,
      cues: toStoredMarks([
        [
          { offset: 0, startMs: 1100 },
          { offset: 6, startMs: 1400 },
          { offset: 13, startMs: 1700 },
        ],
        null,
      ]),
      createdAt: '2026-10-11T00:00:00.000Z',
      ...overrides,
    }
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'word-timings-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('applies word marks to the cues they were made for', () => {
    writeStoredWordTimings(stored(), root)
    const applied = applyStoredWordTimings('a_talk', 'en', cues, root)
    expect(applied?.[0]?.markUnit).toBe('word')
    expect(applied?.[0]?.marks).toHaveLength(3)
    expect(applied?.[1]).toBe(cues[1])
  })

  it('ignores a file made for a different transcript', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeStoredWordTimings(stored(), root)
    const edited = cues.map((cue, index) => (index === 1 ? { ...cue, text: 'Goodbye.' } : cue))
    expect(applyStoredWordTimings('a_talk', 'en', edited, root)).toBeNull()
  })

  it('ignores marks that do not fit the text', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeStoredWordTimings(stored({ cues: [[[0, 1100], [99, 1400]], null] }), root)
    expect(applyStoredWordTimings('a_talk', 'en', cues, root)).toBeNull()
  })

  it('refuses to store an alignment that matched too little', () => {
    expect(() => writeStoredWordTimings(stored({ matchedShare: 0.3 }), root)).toThrow()
  })

  it('returns null without a file', () => {
    expect(applyStoredWordTimings('a_talk', 'en', cues, root)).toBeNull()
  })
})
