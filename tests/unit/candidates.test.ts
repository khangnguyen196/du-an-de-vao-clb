import { describe, expect, it } from 'vitest'
import { extractCandidates } from '@/lib/study/candidates'
import { normalizeCues } from '@/lib/ingest/normalize'
import type { Cue } from '@/types/transcript'

/** Written here rather than quoted from a talk, so the fixture is ours. */
const SAMPLE_LINES = [
  'The researchers had to account for a surprising discrepancy in the measurements.',
  'It turns out that resilience is not a fixed trait at all.',
  'We kept running into the same obstacle over and over again.',
  'Vulnerability, she argued, is the birthplace of innovation and creativity.',
  'The team in Copenhagen showed that a city can cut down emissions without slowing growth.',
  'At the end of the day, the correlation was weaker than anyone expected.',
  'They had to figure out how to scale the intervention across the board.',
  'The methodology was sound, but the interpretation of the data was contested.',
]

const cues: Cue[] = SAMPLE_LINES.map((text, idx) => ({
  idx,
  startMs: idx * 5000,
  endMs: idx * 5000 + 5000,
  text,
}))

describe('extractCandidates', () => {
  const candidates = extractCandidates(cues)

  it('finds something worth studying', () => {
    expect(candidates.length).toBeGreaterThan(5)
  })

  /**
   * The most important guarantee in the whole feature: a card can never quote
   * something the speaker did not say. Contexts are sliced out of real cues, so
   * this holds structurally — this test is what keeps it that way.
   */
  it('quotes only text that really appears in its own cue', () => {
    for (const candidate of candidates) {
      const cue = cues[candidate.cueIdx]
      expect(cue, `cueIdx ${candidate.cueIdx} must exist`).toBeDefined()

      const quoted = candidate.context.replace(/…/g, '').trim()
      expect(cue!.text.includes(quoted), `"${quoted}" must appear in "${cue!.text}"`).toBe(true)
    }
  })

  /** A quiz blanks out exactly this slice, so it must be the term as said — never a guess. */
  it('points contextMatch at the term inside its own context', () => {
    for (const candidate of candidates) {
      const { start, length } = candidate.contextMatch
      const said = candidate.context.slice(start, start + length).toLowerCase()

      if (candidate.kind === 'word') expect(said).toBe(candidate.term)
      else expect(said.length).toBeGreaterThan(0)
      expect(candidate.context.slice(0, start)).not.toMatch(/\S$/u)
    }
  })

  it('keeps the inflected form a phrasal verb was said in', () => {
    const runInto = candidates.find((candidate) => candidate.term === 'run into')
    expect(runInto).toBeDefined()
    const { start, length } = runInto!.contextMatch
    expect(runInto!.context.slice(start, start + length)).toBe('running into')
  })

  it('stays aligned when the context is clipped at the front', () => {
    const long: Cue[] = [
      { idx: 0, startMs: 0, endMs: 5000, text: 'One two three four five six seven eight nine ten serendipity again.' },
    ]
    const [only] = extractCandidates(long).filter((candidate) => candidate.term === 'serendipity')
    expect(only?.context.startsWith('… ')).toBe(true)
    const { start, length } = only!.contextMatch
    expect(only!.context.slice(start, start + length)).toBe('serendipity')
  })

  it('carries the timestamp of the cue it came from', () => {
    for (const candidate of candidates) {
      expect(candidate.startMs).toBe(cues[candidate.cueIdx]!.startMs)
    }
  })

  it('never returns the same term twice', () => {
    const terms = candidates.map((candidate) => candidate.term)
    expect(new Set(terms).size).toBe(terms.length)
  })

  it('picks up phrasal verbs and fixed expressions', () => {
    const phrases = candidates.filter((candidate) => candidate.kind === 'phrase').map((c) => c.term)

    expect(phrases).toContain('account for')
    // the card teaches the dictionary form, not the inflected surface form
    expect(phrases).toContain('run into')
    expect(phrases).toContain('cut down')
    expect(phrases).toContain('figure out')
    expect(phrases).toContain('at the end of the day')
    expect(phrases).toContain('across the board')
  })

  it('ranks phrases ahead of single words', () => {
    const firstWordAt = candidates.findIndex((candidate) => candidate.kind === 'word')
    const lastPhraseAt = candidates.map((c) => c.kind).lastIndexOf('phrase')

    if (firstWordAt !== -1 && lastPhraseAt !== -1) expect(lastPhraseAt).toBeLessThan(firstWordAt)
  })

  it('drops words a learner already owns', () => {
    const terms = candidates.map((candidate) => candidate.term)
    for (const known of ['that', 'they', 'were', 'have', 'city', 'same', 'again']) {
      expect(terms).not.toContain(known)
    }
  })

  it('drops proper nouns that appear mid-sentence', () => {
    expect(candidates.map((candidate) => candidate.term)).not.toContain('copenhagen')
  })

  /*
   * Documents a real limit rather than hiding it: a capital right after a full
   * stop carries no information, so a name that only ever appears there cannot
   * be told apart from an ordinary word. The prompt downstream is the backstop.
   */
  it('cannot detect a name that only ever appears sentence-initially', () => {
    const initialOnly = extractCandidates([
      { idx: 0, startMs: 0, endMs: 4000, text: 'Copenhagen changed its transport policy.' },
    ])

    expect(initialOnly.map((candidate) => candidate.term)).toContain('copenhagen')
  })

  it('keeps the academic vocabulary worth a card', () => {
    const terms = candidates.map((candidate) => candidate.term)
    expect(terms).toContain('methodology')
    expect(terms).toContain('discrepancy')
    expect(terms).toContain('resilience')
  })

  it('scores latinate morphology above plain words', () => {
    const methodology = candidates.find((candidate) => candidate.term === 'methodology')
    const obstacle = candidates.find((candidate) => candidate.term === 'obstacle')

    expect(methodology?.academicScore ?? 0).toBeGreaterThan(obstacle?.academicScore ?? 0)
  })

  it('respects the limit', () => {
    expect(extractCandidates(cues, { limit: 4 })).toHaveLength(4)
  })

  it('returns nothing for an empty transcript', () => {
    expect(extractCandidates([])).toEqual([])
  })

  it('survives cues that normalizeCues produced', () => {
    const normalized = normalizeCues([
      { startMs: 0, endMs: 3000, text: '[Applause] The methodology was' },
      { startMs: 3000, endMs: 6000, text: 'contested from the start.' },
    ])

    const result = extractCandidates(normalized)
    expect(result.map((candidate) => candidate.term)).toContain('methodology')
  })
})
