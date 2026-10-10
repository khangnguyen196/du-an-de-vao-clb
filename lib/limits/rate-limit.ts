/**
 * Abuse limits, in memory.
 *
 * Best effort by design: on Vercel each server instance keeps its own counts
 * and instances come and go, so a determined scraper spread across instances
 * gets more than the limit. It still stops the common case — one client
 * hammering in a loop — without a database or a paid store. A durable limit
 * belongs with M2 (Supabase) or a shared store such as Redis.
 *
 * Every function takes `now` so the rules are testable with a fixed clock.
 */

export interface LimitDecision {
  ok: boolean
  /** How long until the oldest counted item falls out of the window; 0 when ok. */
  retryAfterMs: number
}

export interface DistinctLimiterOptions {
  /** Distinct items allowed per client inside the window. */
  limit: number
  windowMs: number
  /** Clients tracked at once; the least recently seen are dropped first. */
  maxClients?: number
}

/**
 * Counts DISTINCT items per client in a sliding window — "different talks
 * opened in the last 10 minutes". Repeating an item already counted is free,
 * so rereading or reloading a talk never uses up the allowance.
 *
 * A refused item is not recorded, so retrying while blocked does not extend
 * the block.
 */
export function createDistinctLimiter({ limit, windowMs, maxClients = 10_000 }: DistinctLimiterOptions) {
  // client -> (item -> last time it was counted). Map order doubles as LRU order.
  const clients = new Map<string, Map<string, number>>()

  function prune(items: Map<string, number>, nowMs: number) {
    for (const [item, at] of items) if (nowMs - at >= windowMs) items.delete(item)
  }

  function touchClient(client: string): Map<string, number> {
    const existing = clients.get(client)
    if (existing) {
      clients.delete(client)
      clients.set(client, existing)
      return existing
    }
    const created = new Map<string, number>()
    clients.set(client, created)
    while (clients.size > maxClients) {
      const oldest = clients.keys().next().value
      if (oldest === undefined) break
      clients.delete(oldest)
    }
    return created
  }

  return {
    check(client: string, item: string, now: Date): LimitDecision {
      const nowMs = now.getTime()
      const items = touchClient(client)
      prune(items, nowMs)

      if (items.has(item)) {
        items.set(item, nowMs)
        return { ok: true, retryAfterMs: 0 }
      }
      if (items.size < limit) {
        items.set(item, nowMs)
        return { ok: true, retryAfterMs: 0 }
      }

      const oldest = Math.min(...items.values())
      return { ok: false, retryAfterMs: Math.max(0, oldest + windowMs - nowMs) }
    },
    /** For tests and diagnostics. */
    size(): number {
      return clients.size
    },
  }
}

export type DistinctLimiter = ReturnType<typeof createDistinctLimiter>

export interface SemaphoreOptions {
  /** Tasks allowed to run at once. */
  concurrency: number
  /** Tasks allowed to wait; beyond this, new work is refused at once. */
  maxQueue: number
}

/**
 * Caps how many requests go to the platform at the same time from one
 * instance, so a burst of new talks queues up here instead of arriving at TED
 * all at once. A full queue refuses rather than waits forever.
 */
export function createSemaphore({ concurrency, maxQueue }: SemaphoreOptions) {
  let running = 0
  const waiting: (() => void)[] = []

  function release() {
    const next = waiting.shift()
    if (next) next()
    else running -= 1
  }

  return {
    /** Resolves to a release function, or rejects with `QueueFullError` when the queue is full. */
    acquire(): Promise<() => void> {
      if (running < concurrency) {
        running += 1
        return Promise.resolve(once(release))
      }
      if (waiting.length >= maxQueue) return Promise.reject(new QueueFullError())
      return new Promise((resolve) => waiting.push(() => resolve(once(release))))
    },
    stats(): { running: number; waiting: number } {
      return { running, waiting: waiting.length }
    },
  }
}

export class QueueFullError extends Error {
  constructor() {
    super('Too many requests are already waiting')
    this.name = 'QueueFullError'
  }
}

function once(fn: () => void): () => void {
  let done = false
  return () => {
    if (done) return
    done = true
    fn()
  }
}

/**
 * The client address as the hosting platform reports it. Vercel sets
 * `x-vercel-forwarded-for` and `x-real-ip` itself; `x-forwarded-for` can be
 * extended by the client, so only its first entry is trusted, and only when
 * the platform headers are absent. Local development has none of them.
 */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const fromPlatform = headers.get('x-vercel-forwarded-for') ?? headers.get('x-real-ip')
  const first = (fromPlatform ?? headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
  return first || 'local'
}
