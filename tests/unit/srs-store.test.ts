import { describe, expect, it, vi } from 'vitest'
import {
  LocalReviewStore,
  REVIEW_STORAGE_KEY,
  type KeyValueStorage,
  type ReviewRecord,
} from '@/lib/study/srs-store'

function memoryStorage(initial?: Record<string, string>): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial ?? {}))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

function record(id: string, overrides?: Partial<ReviewRecord>): ReviewRecord {
  return {
    id,
    deckId: 'ted:some_talk',
    term: id.split(':').at(-1) ?? id,
    snapshot: {
      display: 'resilience',
      ipa: '',
      partOfSpeech: 'noun',
      meaningVi: '',
      context: 'an invented line',
      startMs: 1000,
      cueIdx: 0,
      sourceTitle: 'Some Talk',
      sourcePath: '/watch/ted/some_talk/vocab',
    },
    scheduling: {
      due: '2026-09-13T00:00:00.000Z',
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    },
    addedAt: '2026-09-13T00:00:00.000Z',
    firstReviewedAt: null,
    ...overrides,
  }
}

describe('LocalReviewStore', () => {
  it('round-trips records', async () => {
    const store = new LocalReviewStore(memoryStorage())
    await store.putMany([record('ted:some_talk:resilience')])

    expect(await store.get('ted:some_talk:resilience')).toEqual(record('ted:some_talk:resilience'))
    expect(await store.list()).toHaveLength(1)
  })

  it('replaces a record with the same id instead of duplicating it', async () => {
    const store = new LocalReviewStore(memoryStorage())
    await store.putMany([record('a:b:c')])
    await store.putMany([record('a:b:c', { firstReviewedAt: '2026-09-14T00:00:00.000Z' })])

    const all = await store.list()
    expect(all).toHaveLength(1)
    expect(all[0]?.firstReviewedAt).toBe('2026-09-14T00:00:00.000Z')
  })

  it('drops a single corrupt record and keeps the rest', async () => {
    const onCorrupt = vi.fn()
    const storage = memoryStorage({
      [REVIEW_STORAGE_KEY]: JSON.stringify({
        version: 1,
        records: [record('good:one:a'), { id: 'bad', scheduling: { due: 'not a date' } }, record('good:two:b')],
      }),
    })

    const store = new LocalReviewStore(storage, { onCorrupt })
    expect((await store.list()).map((r) => r.id)).toEqual(['good:one:a', 'good:two:b'])
    expect(onCorrupt).toHaveBeenCalledWith(1)
  })

  it('treats an unreadable file as empty rather than crashing', async () => {
    const onCorrupt = vi.fn()
    const store = new LocalReviewStore(memoryStorage({ [REVIEW_STORAGE_KEY]: '{not json' }), { onCorrupt })

    expect(await store.list()).toEqual([])
    expect(onCorrupt).toHaveBeenCalledWith(1)
  })

  it('works as an empty store when storage throws on every call', async () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const store = new LocalReviewStore(throwing)

    await expect(store.putMany([record('x:y:z')])).resolves.toBeUndefined()
    expect(await store.list()).toEqual([])
  })

  it('works with no storage at all', async () => {
    const store = new LocalReviewStore(null)
    await store.putMany([record('x:y:z')])
    expect(await store.list()).toEqual([])
  })

  it('refuses to write an invalid record', async () => {
    const store = new LocalReviewStore(memoryStorage())
    const broken = record('x:y:z', { scheduling: { ...record('x:y:z').scheduling, state: 9 } })
    await expect(store.putMany([broken])).rejects.toThrow()
  })
})
