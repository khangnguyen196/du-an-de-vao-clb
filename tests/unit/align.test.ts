import { describe, expect, it } from 'vitest'
import { alignTranslation, type TimedText } from '@/lib/ingest/align'
import type { Cue } from '@/types/transcript'

/** Invented lines, not quoted from any talk. */
const cues: Cue[] = [
  { idx: 0, startMs: 0, endMs: 4000, text: 'The first sentence is about the weather.' },
  { idx: 1, startMs: 4000, endMs: 9000, text: 'The second one talks about the river and the bridge.' },
  { idx: 2, startMs: 9000, endMs: 12_000, text: 'The third is short.' },
]

const frag = (startMs: number, endMs: number, text: string): TimedText => ({ startMs, endMs, text })

describe('alignTranslation', () => {
  it('puts each fragment under the sentence that contains its midpoint', () => {
    const { texts } = alignTranslation(cues, [
      frag(0, 4000, 'Câu một nói về thời tiết.'),
      frag(4000, 6500, 'Câu hai nói về dòng sông'),
      frag(6500, 9000, 'và cây cầu.'),
      frag(9000, 12_000, 'Câu ba ngắn.'),
    ])

    expect(texts).toEqual(['Câu một nói về thời tiết.', 'Câu hai nói về dòng sông và cây cầu.', 'Câu ba ngắn.'])
  })

  it('tolerates the timing drift measured on real TED tracks', () => {
    // Every fragment starts up to ~1.5s away from the English cue boundaries.
    const { texts } = alignTranslation(cues, [
      frag(700, 3200, 'Một.'),
      frag(5400, 7200, 'Hai a'),
      frag(7200, 8600, 'hai b.'),
      frag(9900, 11_800, 'Ba.'),
    ])

    expect(texts).toEqual(['Một.', 'Hai a hai b.', 'Ba.'])
  })

  it('handles fragments arriving out of order', () => {
    const { texts } = alignTranslation(cues, [frag(6500, 9000, 'sau'), frag(4000, 6500, 'trước')])
    expect(texts[1]).toBe('trước sau')
  })

  it('leaves a cue null — not an empty string — when nothing lands on it', () => {
    const { texts, coverage } = alignTranslation(cues, [frag(0, 4000, 'Chỉ câu đầu.')])

    expect(texts).toEqual(['Chỉ câu đầu.', null, null])
    expect(coverage).toBeCloseTo(1 / 3)
  })

  it('strips Vietnamese stage directions the way TED writes them', () => {
    const { texts } = alignTranslation(cues, [
      frag(0, 1000, '(Tiếng cười)'),
      frag(1000, 2000, '(Cười lớn)'),
      frag(2000, 4000, 'Câu một. (Vỗ tay)'),
    ])

    expect(texts[0]).toBe('Câu một.')
  })

  it('collapses the line breaks inside a subtitle fragment', () => {
    const { texts } = alignTranslation(cues, [frag(9000, 12_000, 'Câu ba\nngắn.')])
    expect(texts[2]).toBe('Câu ba ngắn.')
  })

  it('assigns a fragment in a silence to the nearer cue', () => {
    const gapped: Cue[] = [
      { idx: 0, startMs: 0, endMs: 3000, text: 'Before the pause.' },
      { idx: 1, startMs: 10_000, endMs: 13_000, text: 'After the pause.' },
    ]

    const { texts } = alignTranslation(gapped, [frag(3500, 4500, 'gần câu trước'), frag(8500, 9500, 'gần câu sau')])
    expect(texts).toEqual(['gần câu trước', 'gần câu sau'])
  })

  it('does not let an unbounded last fragment drift past the end', () => {
    // No next start, so the platform-derived end is far away.
    const { texts } = alignTranslation(cues, [frag(9500, 600_000, 'Câu cuối.')])
    expect(texts[2]).toBe('Câu cuối.')
  })

  it('never rewrites the translator wording, only joins whole fragments', () => {
    const fragments = [frag(4000, 6500, 'Nửa đầu,'), frag(6500, 9000, 'nửa sau.')]
    const { texts } = alignTranslation(cues, fragments)
    expect(texts[1]).toBe('Nửa đầu, nửa sau.')
  })

  it('returns nothing for an empty transcript', () => {
    expect(alignTranslation([], [frag(0, 1000, 'x')])).toEqual({ texts: [], coverage: 0 })
  })

  it('reports full coverage when every cue got text', () => {
    const { coverage } = alignTranslation(cues, [frag(0, 4000, 'a'), frag(4000, 9000, 'b'), frag(9000, 12_000, 'c')])
    expect(coverage).toBe(1)
  })
})
