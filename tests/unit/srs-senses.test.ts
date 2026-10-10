import { describe, expect, it } from 'vitest'
import { enroll, type EnrollInput } from '@/lib/study/srs'
import { ReviewRecordSchema } from '@/lib/study/srs-store'

const NOW = new Date('2026-09-13T08:00:00.000Z')

/** Built in the key order a component happens to use. */
function input(withSenses: boolean): EnrollInput {
  return {
    id: 'ted:t:shift',
    deckId: 'ted:t',
    term: 'shift',
    snapshot: {
      sourcePath: '/watch/ted/t/vocab',
      sourceTitle: 'T',
      display: 'shift',
      ipa: '/ʃɪft/',
      partOfSpeech: 'noun',
      meaningVi: 'sự chuyển dịch',
      context: 'an invented line',
      startMs: 0,
      cueIdx: 0,
      ...(withSenses
        ? {
            senses: [
              {
                inTranscript: true,
                isCommon: false,
                partOfSpeech: 'noun',
                meaningVi: 'sự chuyển dịch',
                example: { vi: 'Một ví dụ.', en: 'An example.' },
              },
            ],
            singleCommonSense: false,
          }
        : {}),
    },
  }
}

describe('enroll with senses', () => {
  /**
   * The write-loop guard. Saving refreshes records, which re-runs enrolment. If
   * a stored copy — parsed back with a different key order — compared unequal,
   * every render would write again.
   */
  it('writes nothing when the same card comes back after a storage round-trip', () => {
    const [created] = enroll([], [input(true)], NOW)
    const roundTripped = ReviewRecordSchema.parse(JSON.parse(JSON.stringify(created)))

    expect(enroll([roundTripped], [input(true)], NOW)).toEqual([])
  })

  it('upgrades a record saved before senses existed exactly once', () => {
    const [legacy] = enroll([], [input(false)], NOW)
    const stored = ReviewRecordSchema.parse(JSON.parse(JSON.stringify(legacy)))

    const [upgraded] = enroll([stored], [input(true)], NOW)
    expect(upgraded?.snapshot.senses).toHaveLength(1)
    expect(upgraded?.scheduling).toEqual(stored.scheduling)

    const reparsed = ReviewRecordSchema.parse(JSON.parse(JSON.stringify(upgraded)))
    expect(enroll([reparsed], [input(true)], NOW)).toEqual([])
  })

  it('still loads a stored record that has no senses at all', () => {
    const [legacy] = enroll([], [input(false)], NOW)
    expect(ReviewRecordSchema.safeParse(JSON.parse(JSON.stringify(legacy))).success).toBe(true)
  })
})
