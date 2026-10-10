import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ERROR_CODES, toAppError } from '@/lib/errors'
import { resolveSource } from '@/lib/ingest/resolve'
import { getTranslatedTranscript } from '@/lib/ingest/transcript-cache'
import { findTedTalkForYouTube } from '@/lib/ingest/youtube-ted'
import { assertCanOpenTalk, RateLimitedError } from '@/lib/limits/guard'

const BodySchema = z.object({
  url: z.string().trim().min(1).max(2048),
  lang: z.string().trim().min(2).max(16).optional(),
})

/**
 * Synchronous on purpose while only caption ingest exists — a caption fetch is
 * a couple of network hops.
 *
 * When Whisper lands (M5) this must become the job endpoint described in
 * CLAUDE.md section 8: respond immediately with
 * `{ transcriptId, status: 'pending' }` and let the client subscribe.
 *
 * The app itself does not call this — pages read the transcript in a Server
 * Component. It exists for scripts and for the future upload flow.
 *
 * Off in production unless ENABLE_TRANSCRIPT_API=1: no page needs it, and an
 * open JSON endpoint is the easiest way to script the server into fetching
 * TED in bulk. When enabled it passes the same per-client limit as the pages.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TRANSCRIPT_API !== '1') {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: ERROR_CODES.INVALID_URL } }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.INVALID_URL, issues: parsed.error.issues } },
      { status: 400 },
    )
  }

  const source = resolveSource(parsed.data.url)

  if (source.status === 'youtube-blocked') {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.YOUTUBE_BLOCKED,
          message: 'This YouTube link names no single video',
        },
      },
      { status: 422 },
    )
  }

  if (source.status !== 'ok') {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNSUPPORTED_SOURCE, message: 'Only TED links are supported' } },
      { status: 400 },
    )
  }

  try {
    await assertCanOpenTalk(source.kind === 'youtube' ? `youtube:${source.id}` : source.id)

    let slug = source.id
    if (source.kind === 'youtube') {
      // YouTube captions stay out of reach; the same talk on ted.com does not.
      const match = await findTedTalkForYouTube(source.id)
      if (match.status !== 'found') {
        return NextResponse.json(
          { error: { code: ERROR_CODES.YOUTUBE_BLOCKED, message: 'No TED talk was found for this YouTube video' } },
          { status: 422 },
        )
      }
      slug = match.slug
      await assertCanOpenTalk(slug)
    }

    // One JSON document, one chance to be complete: unlike a page, this caller
    // cannot be sent the translation afterwards, so it waits for it.
    const transcript = await getTranslatedTranscript(slug, parsed.data.lang)
    return NextResponse.json({ status: 'ready', transcript })
  } catch (error) {
    const appError = toAppError(error)
    return NextResponse.json(
      { error: { code: appError.code, message: appError.message } },
      {
        status: appError.status,
        ...(error instanceof RateLimitedError
          ? { headers: { 'Retry-After': String(Math.ceil(error.retryAfterMs / 1000)) } }
          : {}),
      },
    )
  }
}
