import { describe, expect, it } from 'vitest'
import { FEATURED_TALKS, PREVIEW_EXCERPT } from '@/lib/featured-talks'

describe('PREVIEW_EXCERPT', () => {
  /** The landing preview shows this talk's photo; the quoted lines must be from the same talk. */
  it('belongs to a sample talk that is still listed', () => {
    expect(PREVIEW_EXCERPT.talk).toBeDefined()
    expect(FEATURED_TALKS).toContain(PREVIEW_EXCERPT.talk)
    expect(PREVIEW_EXCERPT.talk.slug).toBe('matt_cutts_try_something_new_for_30_days')
  })

  it('keeps its lines in playback order, inside the talk, with a valid resting line', () => {
    const times = PREVIEW_EXCERPT.lines.map((line) => line.startMs)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(times.every((ms) => ms >= 0 && ms < PREVIEW_EXCERPT.talk.durationMs)).toBe(true)
    expect(PREVIEW_EXCERPT.lines[PREVIEW_EXCERPT.restingIndex]).toBeDefined()
  })

  it('has both the English line and its translation for every line', () => {
    for (const line of PREVIEW_EXCERPT.lines) {
      expect(line.en.trim()).not.toBe('')
      expect(line.vi.trim()).not.toBe('')
    }
  })
})
