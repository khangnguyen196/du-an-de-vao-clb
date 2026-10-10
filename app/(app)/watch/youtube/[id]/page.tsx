import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { TranscriptError } from '@/components/watch/TranscriptError'
import { YouTubeNoMatch } from '@/components/watch/YouTubeNoMatch'
import { toAppError } from '@/lib/errors'
import { findTedTalkForYouTube, type YouTubeTedMatch } from '@/lib/ingest/youtube-ted'
import { YOUTUBE_VIDEO_ID } from '@/lib/ingest/youtube-url'
import { assertCanOpenTalk, retryAfterMinutes } from '@/lib/limits/guard'

interface YouTubePageProps {
  params: Promise<{ id: string }>
}

/** A lookup step, not content: never indexed, whatever it ends up showing. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('youtube')
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

/**
 * Where a pasted YouTube link lands. When the video is a TED talk that also
 * lives on ted.com, the reader is sent straight to that talk's page; otherwise
 * this page says why not and what to try instead.
 */
export default async function YouTubeLookupPage({ params }: YouTubePageProps) {
  const { id } = await params
  if (!YOUTUBE_VIDEO_ID.test(id)) notFound()

  let match: YouTubeTedMatch
  try {
    // A lookup can cost several TED requests, so it passes the same per-IP
    // limit as opening a talk.
    await assertCanOpenTalk(`youtube:${id}`)
    match = await findTedTalkForYouTube(id)
  } catch (error) {
    const appError = toAppError(error)
    console.error(`[watch/youtube] ${id} failed with ${appError.code}:`, appError.message)
    return <TranscriptError code={appError.code} retryAfterMinutes={retryAfterMinutes(error)} />
  }

  // Outside the try: `redirect` works by throwing.
  if (match.status === 'found') redirect(`/watch/ted/${match.slug}`)

  return <YouTubeNoMatch videoId={id} match={match} />
}
