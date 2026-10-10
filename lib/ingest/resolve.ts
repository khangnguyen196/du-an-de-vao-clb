import { parseTedSlug } from '@/lib/ingest/ted'
import { isYouTubeLink, parseYouTubeVideoId } from '@/lib/ingest/youtube-url'

export type ResolveResult =
  | { status: 'ok'; kind: 'ted'; id: string; href: string }
  /**
   * A YouTube video. Its captions stay unreadable to a server, so the href is a
   * lookup page that sends the reader on to the same talk on ted.com when there
   * is one — see `lib/ingest/youtube-ted.ts`.
   */
  | { status: 'ok'; kind: 'youtube'; id: string; href: string }
  /** A YouTube link that names no single video (a channel, a playlist). */
  | { status: 'youtube-blocked' }
  | { status: 'unknown' }

/**
 * Single place that decides what a pasted string is. The form and the API route
 * both go through here so they can never disagree about what is supported.
 *
 * A YouTube link that is not a video gets its own status rather than falling
 * into `unknown`: telling someone their link is invalid when it is perfectly
 * valid — just not a video — would send them off checking the wrong thing.
 */
export function resolveSource(input: string): ResolveResult {
  const tedSlug = parseTedSlug(input)
  if (tedSlug) return { status: 'ok', kind: 'ted', id: tedSlug, href: `/watch/ted/${tedSlug}` }

  const videoId = parseYouTubeVideoId(input)
  if (videoId) return { status: 'ok', kind: 'youtube', id: videoId, href: `/watch/youtube/${videoId}` }

  if (isYouTubeLink(input)) return { status: 'youtube-blocked' }

  return { status: 'unknown' }
}
