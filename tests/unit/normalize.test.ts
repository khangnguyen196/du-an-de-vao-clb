import { describe, expect, it } from 'vitest'
import { decodeEntities, normalizeCues, type RawSegment } from '@/lib/ingest/normalize'

const seg = (startMs: number, endMs: number, text: string): RawSegment => ({ startMs, endMs, text })

describe('decodeEntities', () => {
  it('decodes the named entities caption tracks actually use', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;')).toBe(`a & b <c> "d" 'e'`)
  })

  it('decodes numeric entities', () => {
    expect(decodeEntities('&#8217;')).toBe('’')
  })
})

describe('normalizeCues', () => {
  it('merges caption fragments back into a sentence', () => {
    const cues = normalizeCues([
      seg(0, 1000, 'This is the first'),
      seg(1000, 2000, 'half of a sentence'),
      seg(2000, 3000, 'that ends here.'),
    ])

    expect(cues).toHaveLength(1)
    expect(cues[0]?.text).toBe('This is the first half of a sentence that ends here.')
  })

  it('keeps the original start of the first fragment and end of the last', () => {
    const cues = normalizeCues([seg(1600, 5085, 'Part one'), seg(5085, 7158, 'and part two.')])

    expect(cues[0]?.startMs).toBe(1600)
    expect(cues[0]?.endMs).toBe(7158)
  })

  it('strips bracketed sound events', () => {
    const cues = normalizeCues([seg(0, 1000, '[Music] Hello there. [Applause]')])
    expect(cues[0]?.text).toBe('Hello there.')
  })

  it('strips parenthesised stage directions the way TED writes them', () => {
    const cues = normalizeCues([seg(0, 2000, '(Laughter) And then everything changed. (Applause)')])
    expect(cues[0]?.text).toBe('And then everything changed.')
  })

  it('leaves a genuine parenthetical aside alone', () => {
    const cues = normalizeCues([seg(0, 2000, 'The result (and this surprised us) held up.')])
    expect(cues[0]?.text).toBe('The result (and this surprised us) held up.')
  })

  it('drops fragments that are nothing but noise', () => {
    const cues = normalizeCues([seg(0, 1000, '[Applause]'), seg(1000, 2000, 'Real words here.')])

    expect(cues).toHaveLength(1)
    expect(cues[0]?.text).toBe('Real words here.')
  })

  it('collapses the line breaks TED puts inside a cue', () => {
    const cues = normalizeCues([seg(0, 2000, 'a couple\nyears ago, an event planner called.')])
    expect(cues[0]?.text).toBe('a couple years ago, an event planner called.')
  })

  it('breaks on a long silence even mid-sentence', () => {
    const cues = normalizeCues([seg(0, 1000, 'Before the pause'), seg(9000, 10_000, 'after the pause')])
    expect(cues).toHaveLength(2)
  })

  it('starts a new cue when the speaker changes', () => {
    const cues = normalizeCues([
      { ...seg(0, 1000, 'Hi there'), speaker: 'A' },
      { ...seg(1000, 2000, 'hello back'), speaker: 'B' },
    ])

    expect(cues).toHaveLength(2)
    expect(cues[0]?.speaker).toBe('A')
    expect(cues[1]?.speaker).toBe('B')
  })

  it('caps a cue that never reaches punctuation', () => {
    // 80 unpunctuated fragments run well past both the character and the
    // duration cap, so the reader still gets readable chunks.
    const long = Array.from({ length: 80 }, (_, i) => seg(i * 300, i * 300 + 300, 'word'))
    const cues = normalizeCues(long)

    expect(cues.length).toBeGreaterThan(1)
    for (const cue of cues) expect(cue.text.length).toBeLessThanOrEqual(260)
  })

  it('produces a strictly increasing, non-overlapping timeline', () => {
    const cues = normalizeCues([
      seg(0, 4000, 'Overlapping one.'),
      seg(2000, 6000, 'Overlapping two.'),
      seg(5000, 9000, 'Overlapping three.'),
    ])

    for (let i = 0; i < cues.length - 1; i += 1) {
      const current = cues[i]!
      const next = cues[i + 1]!
      expect(current.endMs).toBeLessThanOrEqual(next.startMs)
      expect(current.startMs).toBeLessThan(current.endMs)
      expect(current.idx).toBe(i)
    }
  })

  it('returns nothing for empty input', () => {
    expect(normalizeCues([])).toEqual([])
  })
})
