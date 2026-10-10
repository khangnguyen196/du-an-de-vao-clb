import { Rating } from 'ts-fsrs'
import { describe, expect, it } from 'vitest'
import { createScheduler, enroll, grade, GRADES, previewDue } from '@/lib/study/srs'
import type { ReviewRecord } from '@/lib/study/srs-store'

/**
 * Production runs with fuzz on. A rating button shows when the card will come
 * back; that promise must equal what grading actually stores. This holds only
 * if the preview and the grade use the same review time — the components
 * capture one timestamp when the card is flipped and use it for both.
 */
describe('preview matches the stored outcome with fuzz enabled', () => {
  const scheduler = createScheduler({ enableFuzz: true })
  const start = new Date('2026-09-13T08:00:00.000Z')

  function reviewCard(): { record: ReviewRecord; at: Date } {
    let [record] = enroll(
      [],
      [
        {
          id: 'ted:t:resilience',
          deckId: 'ted:t',
          term: 'resilience',
          snapshot: {
            display: 'resilience',
            ipa: '',
            partOfSpeech: 'noun',
            meaningVi: '',
            context: 'an invented line',
            startMs: 0,
            cueIdx: 0,
            sourceTitle: 'T',
            sourcePath: '/watch/ted/t/vocab',
          },
        },
      ],
      start,
    )
    let at = start
    // Walk it into Review state, where intervals are long enough for fuzz to bite.
    for (let i = 0; i < 5; i += 1) {
      record = grade(record!, Rating.Good, at, scheduler)
      at = new Date(record.scheduling.due)
    }
    return { record: record!, at }
  }

  it('gives every button the exact due time grading then stores', () => {
    const { record, at } = reviewCard()
    const preview = previewDue(record, at, scheduler)

    for (const rating of GRADES) {
      const stored = grade(record, rating, at, scheduler)
      expect(stored.scheduling.due, `rating ${rating}`).toBe(preview[rating].toISOString())
    }
  })

  it('is stable when the preview is recomputed at the same moment', () => {
    const { record, at } = reviewCard()
    expect(previewDue(record, at, scheduler)[Rating.Easy].toISOString()).toBe(
      previewDue(record, at, scheduler)[Rating.Easy].toISOString(),
    )
  })
})
