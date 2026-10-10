'use server'

import { z } from 'zod'
import { toAppError, type ErrorCode } from '@/lib/errors'
import { getTranscript } from '@/lib/ingest/transcript-cache'
import { assertCanOpenTalk, retryAfterMinutes } from '@/lib/limits/guard'

const CheckTalkInput = z.strictObject({ slug: z.string().regex(/^[a-z0-9_]+$/i).max(200) })

export type CheckTalkResult =
  | { ok: true; href: string; title: string; speaker: string | null }
  | { ok: false; code: ErrorCode; retryAfterMinutes: number | null }

/**
 * Makes sure a talk can actually be opened before the form navigates to it,
 * so "this talk has no transcript yet" is said right under the input instead
 * of on a dead-end page.
 *
 * Costs nothing extra: it goes through the same per-IP limit and transcript
 * cache as the watch page, so the page that follows reads the cached result.
 */
export async function checkTalk(input: unknown): Promise<CheckTalkResult> {
  const parsed = CheckTalkInput.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'INVALID_URL', retryAfterMinutes: null }
  const { slug } = parsed.data

  try {
    await assertCanOpenTalk(slug)
    const { source } = await getTranscript(slug)
    return { ok: true, href: `/watch/ted/${slug}`, title: source.title, speaker: source.author ?? null }
  } catch (error) {
    return { ok: false, code: toAppError(error).code, retryAfterMinutes: retryAfterMinutes(error) }
  }
}
