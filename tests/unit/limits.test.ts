import { describe, expect, it } from 'vitest'
import { clientAddress, createDistinctLimiter, createSemaphore, QueueFullError } from '@/lib/limits/rate-limit'
import { trimPageProps, type TedPageProps } from '@/lib/ingest/ted'

const MIN = 60_000
const at = (ms: number) => new Date(1_000_000 + ms)

describe('createDistinctLimiter', () => {
  it('allows up to the limit of different items, then refuses', () => {
    const limiter = createDistinctLimiter({ limit: 3, windowMs: 10 * MIN })
    expect(['a', 'b', 'c'].map((talk) => limiter.check('ip', talk, at(0)).ok)).toEqual([true, true, true])
    expect(limiter.check('ip', 'd', at(MIN)).ok).toBe(false)
  })

  it('never counts the same item twice — rereading a talk is free', () => {
    const limiter = createDistinctLimiter({ limit: 2, windowMs: 10 * MIN })
    for (let i = 0; i < 50; i += 1) expect(limiter.check('ip', 'same-talk', at(i * 1000)).ok).toBe(true)
    expect(limiter.check('ip', 'other', at(60_000)).ok).toBe(true)
  })

  it('still allows an item already counted while the client is at the limit', () => {
    const limiter = createDistinctLimiter({ limit: 2, windowMs: 10 * MIN })
    limiter.check('ip', 'a', at(0))
    limiter.check('ip', 'b', at(0))
    expect(limiter.check('ip', 'c', at(MIN)).ok).toBe(false)
    expect(limiter.check('ip', 'a', at(MIN)).ok).toBe(true)
  })

  it('says how long until the oldest item frees a slot, and frees it then', () => {
    const limiter = createDistinctLimiter({ limit: 2, windowMs: 10 * MIN })
    limiter.check('ip', 'a', at(0))
    limiter.check('ip', 'b', at(4 * MIN))
    const refused = limiter.check('ip', 'c', at(6 * MIN))
    expect(refused).toEqual({ ok: false, retryAfterMs: 4 * MIN })
    expect(limiter.check('ip', 'c', at(10 * MIN)).ok).toBe(true)
  })

  it('does not let refused attempts extend the block', () => {
    const limiter = createDistinctLimiter({ limit: 1, windowMs: 10 * MIN })
    limiter.check('ip', 'a', at(0))
    for (let i = 1; i < 9; i += 1) limiter.check('ip', `x${String(i)}`, at(i * MIN))
    expect(limiter.check('ip', 'z', at(10 * MIN)).ok).toBe(true)
  })

  it('keeps clients apart', () => {
    const limiter = createDistinctLimiter({ limit: 1, windowMs: 10 * MIN })
    expect(limiter.check('one', 'a', at(0)).ok).toBe(true)
    expect(limiter.check('two', 'b', at(0)).ok).toBe(true)
    expect(limiter.check('one', 'b', at(0)).ok).toBe(false)
  })

  it('forgets the least recently seen clients beyond its cap', () => {
    const limiter = createDistinctLimiter({ limit: 1, windowMs: 10 * MIN, maxClients: 2 })
    limiter.check('a', 't', at(0))
    limiter.check('b', 't', at(0))
    limiter.check('c', 't', at(0))
    expect(limiter.size()).toBe(2)
  })
})

describe('createSemaphore', () => {
  it('runs at most `concurrency` tasks and hands slots on in order', async () => {
    const slots = createSemaphore({ concurrency: 2, maxQueue: 10 })
    const releases = await Promise.all([slots.acquire(), slots.acquire()])
    const order: number[] = []
    const third = slots.acquire().then((release) => {
      order.push(3)
      return release
    })
    expect(slots.stats()).toEqual({ running: 2, waiting: 1 })

    releases[0]!()
    const release3 = await third
    expect(order).toEqual([3])
    expect(slots.stats()).toEqual({ running: 2, waiting: 0 })

    release3()
    releases[1]!()
    expect(slots.stats()).toEqual({ running: 0, waiting: 0 })
  })

  it('refuses at once when the queue is full', async () => {
    const slots = createSemaphore({ concurrency: 1, maxQueue: 1 })
    await slots.acquire()
    void slots.acquire()
    await expect(slots.acquire()).rejects.toBeInstanceOf(QueueFullError)
  })

  it('ignores a second release of the same slot', async () => {
    const slots = createSemaphore({ concurrency: 1, maxQueue: 1 })
    const release = await slots.acquire()
    release()
    release()
    expect(slots.stats()).toEqual({ running: 0, waiting: 0 })
  })
})

describe('clientAddress', () => {
  const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null })

  it('prefers the address the platform reports', () => {
    expect(clientAddress(headers({ 'x-vercel-forwarded-for': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4')
  })

  it('trusts only the first forwarded entry', () => {
    expect(clientAddress(headers({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8')
  })

  it('falls back to one shared key locally', () => {
    expect(clientAddress(headers({}))).toBe('local')
  })
})

describe('trimPageProps', () => {
  it('keeps only what the app reads', () => {
    const full = {
      videoData: {
        title: 'T',
        duration: 60,
        hlsUrl: 'https://hls.ted.com/project_masters/1/manifest.m3u8',
        videoPlayerData: { thumb: 'https://pi.tedcdn.com/x.jpg', id: '1' },
        relatedVideos: new Array(50).fill({ title: 'other talk' }),
      },
      transcriptData: { translation: { paragraphs: [{ cues: [{ time: 0, text: 'Hi.' }] }] } },
      comments: { a: 1 },
    } as unknown as TedPageProps

    const trimmed = trimPageProps(full)
    expect(trimmed).toEqual({
      videoData: {
        title: 'T',
        duration: 60,
        hlsUrl: 'https://hls.ted.com/project_masters/1/manifest.m3u8',
        videoPlayerData: { thumb: 'https://pi.tedcdn.com/x.jpg' },
      },
      transcriptData: { translation: { paragraphs: [{ cues: [{ time: 0, text: 'Hi.' }] }] } },
    })
  })
})
