import { Rating } from 'ts-fsrs'
import { describe, expect, it } from 'vitest'
import {
  bookRecords,
  buildQueue,
  countLeftOutAtMigration,
  createScheduler,
  enroll,
  grade,
  isInBook,
  refreshSnapshots,
  removeFromBook,
  type EnrollInput,
} from '@/lib/study/srs'
import { ReviewRecordSchema, type ReviewRecord } from '@/lib/study/srs-store'

const NOW = new Date('2026-10-10T08:00:00.000Z')
const LATER = new Date('2026-10-12T08:00:00.000Z')
const scheduler = createScheduler({ enableFuzz: false })

function input(term: string, meaningVi = ''): EnrollInput {
  return {
    id: `ted:talk:${term}`,
    deckId: 'ted:talk',
    term,
    snapshot: {
      display: term,
      ipa: '',
      partOfSpeech: 'noun',
      meaningVi,
      context: `an invented line with ${term}`,
      startMs: 0,
      cueIdx: 0,
      sourceTitle: 'Talk',
      sourcePath: '/watch/ted/talk/vocab',
    },
  }
}

/** A record as stored before the word book existed: no `inBook` at all. */
function legacy(term: string, reviewed: boolean): ReviewRecord {
  const [created] = enroll([], [input(term)], NOW)
  const record: Partial<ReviewRecord> = reviewed ? grade(created!, Rating.Good, NOW, scheduler) : { ...created! }
  delete record.inBook
  return ReviewRecordSchema.parse(record)
}

describe('records from before the word book', () => {
  it('keeps words the learner reviewed and leaves out the rest', () => {
    expect(isInBook(legacy('kept', true))).toBe(true)
    expect(isInBook(legacy('dropped', false))).toBe(false)
  })

  it('counts what the switch left out, for the notice', () => {
    const records = [legacy('a', true), legacy('b', false), legacy('c', false)]
    expect(countLeftOutAtMigration(records)).toBe(2)
  })

  it('stops counting a word once the learner saves it', () => {
    const left = legacy('b', false)
    const [saved] = enroll([left], [input('b')], LATER)
    expect(countLeftOutAtMigration([saved!])).toBe(0)
  })

  it('reviews only words in the book', () => {
    const queue = buildQueue(bookRecords([legacy('kept', true), legacy('dropped', false)]), LATER)
    expect([...queue.due, ...queue.fresh].map((r) => r.term)).toEqual(['kept'])
  })
})

describe('saving and removing', () => {
  it('puts a new word in the book', () => {
    const [record] = enroll([], [input('resilience')], NOW)
    expect(record?.inBook).toBe(true)
    expect(ReviewRecordSchema.safeParse(record).success).toBe(true)
  })

  it('keeps progress when a word is removed and saved again', () => {
    const [created] = enroll([], [input('resilience')], NOW)
    const studied = grade(created!, Rating.Good, NOW, scheduler)

    const removed = removeFromBook(studied)
    expect(isInBook(removed)).toBe(false)
    expect(removed.scheduling).toEqual(studied.scheduling)

    const [back] = enroll([removed], [input('resilience')], LATER)
    expect(isInBook(back!)).toBe(true)
    expect(back?.scheduling).toEqual(studied.scheduling)
    expect(back?.firstReviewedAt).toBe(studied.firstReviewedAt)
  })

  it('writes nothing when a saved word is saved again unchanged', () => {
    const existing = enroll([], [input('a')], NOW)
    expect(enroll(existing, [input('a')], LATER)).toEqual([])
  })

  it('marks a reviewed legacy word explicitly when saved, without touching progress', () => {
    const old = legacy('kept', true)
    const [saved] = enroll([old], [input('kept')], LATER)
    expect(saved?.inBook).toBe(true)
    expect(saved?.scheduling).toEqual(old.scheduling)
  })
})

describe('refreshSnapshots', () => {
  it('updates content of existing records, saved or not, without saving them', () => {
    const outside = removeFromBook(enroll([], [input('a')], NOW)[0]!)
    const [updated] = refreshSnapshots([outside], [input('a', 'nghĩa mới')])

    expect(updated?.snapshot.meaningVi).toBe('nghĩa mới')
    expect(isInBook(updated!)).toBe(false)
  })

  it('never creates a record: opening a deck does not fill the book', () => {
    expect(refreshSnapshots([], [input('a'), input('b')])).toEqual([])
  })

  it('writes nothing when content is unchanged', () => {
    const existing = enroll([], [input('a', 'x')], NOW)
    expect(refreshSnapshots(existing, [input('a', 'x')])).toEqual([])
  })
})
