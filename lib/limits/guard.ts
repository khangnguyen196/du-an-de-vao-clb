import { headers } from 'next/headers'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { clientAddress, createDistinctLimiter } from '@/lib/limits/rate-limit'

/**
 * Different talks one client may open per window. Rereading a talk is free;
 * a whole class on one school Wi-Fi shares an address, hence the headroom.
 */
export const TALK_LIMIT = { limit: 35, windowMs: 10 * 60 * 1000 }

/**
 * Talks per client that may trigger paid model work (machine translation,
 * vocabulary meanings) per window. Checked before the model is called, never
 * after (limits.md). Unused while the public deployment runs without a key.
 */
export const MODEL_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 }

const talks = createDistinctLimiter(TALK_LIMIT)
const modelTalks = createDistinctLimiter(MODEL_LIMIT)

export class RateLimitedError extends AppError {
  readonly retryAfterMs: number

  constructor(retryAfterMs: number) {
    super(ERROR_CODES.RATE_LIMITED, 'Too many different talks opened in a short time')
    this.retryAfterMs = retryAfterMs
  }
}

export async function currentClient(): Promise<string> {
  return clientAddress(await headers())
}

/** Throws `RateLimitedError` when this client has opened too many different talks lately. */
export async function assertCanOpenTalk(slug: string): Promise<void> {
  const client = await currentClient()
  const decision = talks.check(client, slug, new Date())
  if (!decision.ok) {
    console.warn(`[limits] ${client} hit the talk limit opening "${slug}"`)
    throw new RateLimitedError(decision.retryAfterMs)
  }
}

/** False when this client has used up its model allowance; the caller then skips the model. */
export function mayUseModel(client: string, slug: string): boolean {
  const decision = modelTalks.check(client, slug, new Date())
  if (!decision.ok) console.warn(`[limits] ${client} hit the model limit on "${slug}"`)
  return decision.ok
}

/** Whole minutes, at least one — "try again in 0 minutes" reads like a bug. */
export function retryAfterMinutes(error: unknown): number | null {
  return error instanceof RateLimitedError ? Math.max(1, Math.ceil(error.retryAfterMs / 60_000)) : null
}
