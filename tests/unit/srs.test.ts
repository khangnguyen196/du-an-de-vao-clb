import { Rating, State } from 'ts-fsrs'
import { describe, expect, it } from 'vitest'
import {
  buildQueue,
  createScheduler,
  enroll,
  fromFsrsCard,
  grade,
  intervalParts,
  previewDue,
  toFsrsCard,
  type EnrollInput,
} from '@/lib/study/srs'
import { ReviewRecordSchema, type ReviewRecord } from '@/lib/study/srs-store'

const NOW = new Date('2026-09-13T08:00:00.000Z')
const DAY_START = new Date('2026-09-13T00:00:00.000Z')
const scheduler = createScheduler({ enableFuzz: false })

const minutes = (m: number) => m * 60_000
const days = (d: number) => d * 86_400_000
const at = (ms: number) => new Date(NOW.getTime() + ms)

function input(term: string, startMs = 0, meaningVi = ''): EnrollInput {
  return {
    id: `ted:some_talk:${term}`,
    deckId: 'ted:some_talk',
    term,
    snapshot: {
      display: term,
      ipa: '',
      partOfSpeech: 'noun',
      meaningVi,
      context: `an invented line with ${term}`,
      startMs,
      cueIdx: 0,
      sourceTitle: 'Some Talk',
      sourcePath: '/watch/ted/some_talk/vocab',
    },
  }
}

function freshRecord(term = 'resilience'): ReviewRecord {
  const [record] = enroll([], [input(term)], NOW)
  return record!
}

describe('serialisation', () => {
  it('round-trips a card through the stored shape without losing anything', () => {
    const graded = grade(freshRecord(), Rating.Good, NOW, scheduler)
    expect(fromFsrsCard(toFsrsCard(graded.scheduling))).toEqual(graded.scheduling)
  })

  it('produces records the store accepts, before and after grading', () => {
    const record = freshRecord()
    expect(ReviewRecordSchema.safeParse(record).success).toBe(true)
    expect(ReviewRecordSchema.safeParse(grade(record, Rating.Again, NOW, scheduler)).success).toBe(true)
  })
})

describe('enroll', () => {
  it('adds unseen cards as New, due now, never reviewed', () => {
    const [record] = enroll([], [input('resilience')], NOW)

    expect(record?.scheduling.state).toBe(State.New)
    expect(record?.scheduling.due).toBe(NOW.toISOString())
    expect(record?.firstReviewedAt).toBeNull()
  })

  it('returns nothing when a learner simply reopens an unchanged deck', () => {
    const existing = enroll([], [input('a'), input('b')], NOW)
    expect(enroll(existing, [input('a'), input('b')], at(days(3)))).toEqual([])
  })

  /** Reopening a deck must never wipe weeks of progress. */
  it('refreshes content but keeps scheduling when a card comes back improved', () => {
    const studied = grade(freshRecord('resilience'), Rating.Good, NOW, scheduler)
    const [updated] = enroll([studied], [input('resilience', 0, 'khả năng phục hồi')], at(days(1)))

    expect(updated?.snapshot.meaningVi).toBe('khả năng phục hồi')
    expect(updated?.scheduling).toEqual(studied.scheduling)
    expect(updated?.firstReviewedAt).toBe(studied.firstReviewedAt)
  })
})

describe('grade', () => {
  it('moves a new card out of New and stamps when it was first studied', () => {
    const graded = grade(freshRecord(), Rating.Good, NOW, scheduler)

    expect(graded.scheduling.state).not.toBe(State.New)
    expect(graded.scheduling.reps).toBe(1)
    expect(graded.firstReviewedAt).toBe(NOW.toISOString())
    expect(Date.parse(graded.scheduling.due)).toBeGreaterThan(NOW.getTime())
  })

  it('keeps the original first-study time on later reviews', () => {
    const once = grade(freshRecord(), Rating.Good, NOW, scheduler)
    const twice = grade(once, Rating.Good, new Date(once.scheduling.due), scheduler)
    expect(twice.firstReviewedAt).toBe(NOW.toISOString())
  })

  it('orders the buttons: Again sooner than Hard, Hard no later than Good, Good sooner than Easy', () => {
    const due = previewDue(freshRecord(), NOW, scheduler)

    expect(due[Rating.Again].getTime()).toBeLessThan(due[Rating.Hard].getTime())
    expect(due[Rating.Hard].getTime()).toBeLessThanOrEqual(due[Rating.Good].getTime())
    expect(due[Rating.Good].getTime()).toBeLessThan(due[Rating.Easy].getTime())
  })

  it('stretches the interval each time a card is recalled on its due date', () => {
    let record = freshRecord()
    let when = NOW
    const intervals: number[] = []

    for (let i = 0; i < 6; i += 1) {
      record = grade(record, Rating.Good, when, scheduler)
      const next = new Date(record.scheduling.due)
      intervals.push(next.getTime() - when.getTime())
      when = next
    }

    expect(record.scheduling.state).toBe(State.Review)
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]!).toBeGreaterThanOrEqual(intervals[i - 1]!)
    }
    // After six successful reviews the gap is measured in days, not minutes.
    expect(intervals.at(-1)!).toBeGreaterThan(days(1))
  })

  it('counts a lapse when a review card is forgotten', () => {
    let record = freshRecord()
    let when = NOW
    for (let i = 0; i < 4; i += 1) {
      record = grade(record, Rating.Good, when, scheduler)
      when = new Date(record.scheduling.due)
    }
    expect(record.scheduling.state).toBe(State.Review)

    const forgotten = grade(record, Rating.Again, when, scheduler)
    expect(forgotten.scheduling.lapses).toBe(record.scheduling.lapses + 1)
    expect(forgotten.scheduling.state).toBe(State.Relearning)
  })
})

describe('buildQueue', () => {
  it('serves overdue studied cards, most overdue first, and hides ones not yet due', () => {
    const base = grade(freshRecord('a'), Rating.Good, NOW, scheduler)
    const overdueMore = { ...base, id: 'x:1', scheduling: { ...base.scheduling, due: at(-days(2)).toISOString() } }
    const overdueLess = { ...base, id: 'x:2', scheduling: { ...base.scheduling, due: at(-minutes(5)).toISOString() } }
    const later = { ...base, id: 'x:3', scheduling: { ...base.scheduling, due: at(minutes(8)).toISOString() } }

    const queue = buildQueue([later, overdueLess, overdueMore], NOW, { dayStart: DAY_START })

    expect(queue.due.map((r) => r.id)).toEqual(['x:1', 'x:2'])
    expect(queue.nextDueAt?.toISOString()).toBe(at(minutes(8)).toISOString())
  })

  it('caps new cards per day, counting ones already started today', () => {
    const unstarted = enroll(
      [],
      Array.from({ length: 10 }, (_, i) => input(`word${i}`, i * 1000)),
      NOW,
    )
    const startedToday = Array.from({ length: 3 }, (_, i) =>
      grade(freshRecord(`today${i}`), Rating.Good, at(-minutes(30)), scheduler),
    )

    const queue = buildQueue([...unstarted, ...startedToday], NOW, { newPerDay: 5, dayStart: DAY_START })

    expect(queue.counts.newIntroducedToday).toBe(3)
    expect(queue.counts.newRemainingToday).toBe(2)
    expect(queue.fresh.map((r) => r.term)).toEqual(['word0', 'word1'])
    expect(queue.counts.newTotal).toBe(10)
  })

  it('does not count cards first studied on an earlier day against today', () => {
    const yesterday = grade(freshRecord('old'), Rating.Good, at(-days(1)), scheduler)
    const queue = buildQueue([yesterday, ...enroll([], [input('new')], NOW)], NOW, {
      newPerDay: 1,
      dayStart: DAY_START,
    })

    expect(queue.counts.newIntroducedToday).toBe(0)
    expect(queue.fresh.map((r) => r.term)).toEqual(['new'])
  })

  it('offers no new cards once the cap is used up', () => {
    const queue = buildQueue(
      [grade(freshRecord('a'), Rating.Good, NOW, scheduler), ...enroll([], [input('b')], NOW)],
      NOW,
      { newPerDay: 1, dayStart: DAY_START },
    )
    expect(queue.fresh).toEqual([])
    expect(queue.counts.newRemainingToday).toBe(0)
  })

  it('is empty for an empty store', () => {
    expect(buildQueue([], NOW)).toEqual({
      due: [],
      fresh: [],
      counts: { due: 0, newTotal: 0, newIntroducedToday: 0, newRemainingToday: DEFAULT_NEW_PER_DAY_FOR_TEST },
      nextDueAt: null,
    })
  })
})

const DEFAULT_NEW_PER_DAY_FOR_TEST = 20

describe('intervalParts', () => {
  it.each([
    [minutes(0.2), { value: 1, unit: 'minute' }],
    [minutes(10), { value: 10, unit: 'minute' }],
    [minutes(90), { value: 2, unit: 'hour' }],
    [days(3), { value: 3, unit: 'day' }],
    [days(45), { value: 2, unit: 'month' }],
    [days(400), { value: 1.1, unit: 'year' }],
  ])('rounds %d ms', (ms, expected) => {
    expect(intervalParts(ms)).toEqual(expected)
  })
})
