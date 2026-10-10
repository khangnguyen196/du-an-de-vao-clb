import { parseTedSlug } from '@/lib/ingest/ted'
import { isYouTubeLink } from '@/lib/ingest/youtube-url'

export type ResolveResult =
  | { status: 'ok'; kind: 'ted'; id: string; href: string }
  /** Recognised, but YouTube no longer serves caption payloads to servers. */
  | { status: 'youtube-blocked' }
  | { status: 'unknown' }

/**
 * Single place that decides what a pasted string is. The form and the API route
 * both go through here so they can never disagree about what is supported.
 *
 * YouTube gets its own status rather than falling into `unknown`: telling
 * someone their link is invalid when it is perfectly valid — just unreadable —
 * would send them off checking a URL that was never the problem.
 */
export function resolveSource(input: string): ResolveResult {
  const tedSlug = parseTedSlug(input)
  if (tedSlug) return { status: 'ok', kind: 'ted', id: tedSlug, href: `/watch/ted/${tedSlug}` }

  if (isYouTubeLink(input)) return { status: 'youtube-blocked' }

  return { status: 'unknown' }
}
