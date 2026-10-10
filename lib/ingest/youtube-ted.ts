import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { fetchTedYouTubeCode } from '@/lib/ingest/ted'
import { YOUTUBE_VIDEO_ID } from '@/lib/ingest/youtube-url'

/**
 * Finds the ted.com talk behind a YouTube video, so a YouTube link opens the
 * talk's public TED transcript.
 *
 * Nothing is read from YouTube except the video's title and channel, through
 * oEmbed — YouTube's public endpoint for exactly that. No captions, no media,
 * no watch page. (Captions stay out of reach on purpose: see youtube-url.ts.)
 *
 * The match is proven, not guessed. The title only suggests a few candidate
 * slugs; a candidate counts only if TED's own page for it lists this exact
 * YouTube video id. A wrong guess therefore costs a request, never a wrong talk.
 */

const OEMBED_URL = 'https://www.youtube.com/oembed'
const OEMBED_TIMEOUT_MS = 8_000
const OEMBED_CACHE_SECONDS = 24 * 60 * 60

/**
 * Each guess is a TED request. Four covers the title shapes seen in practice;
 * past that a link is far more likely to be a talk whose YouTube title was
 * rewritten than one a fifth spelling would find.
 */
export const MAX_SLUG_CANDIDATES = 4

export type YouTubeChannelKind = 'ted' | 'tedx' | 'other'

export interface YouTubeVideoInfo {
  title: string
  channel: string
}

export type YouTubeTedMatch =
  | { status: 'found'; slug: string }
  /** The video is public, but no TED talk was proven to be it. */
  | { status: 'not-found'; title: string; channel: string; kind: YouTubeChannelKind }
  /** YouTube shows nothing to the public: private, removed, or not a real id. */
  | { status: 'unavailable' }

const OEmbedSchema = z.object({ title: z.string(), author_name: z.string() })

/** "TEDx Talks" mostly carries talks that exist only on YouTube; the rest of the TED family is worth a lookup. */
export function channelKind(channel: string): YouTubeChannelKind {
  const name = channel.trim()
  if (/^tedx/i.test(name)) return 'tedx'
  if (/^ted\b/i.test(name)) return 'ted'
  return 'other'
}

/**
 * The way TED turns a speaker and title into a slug: accents dropped, every
 * run of anything else — spaces, apostrophes, dashes — becomes one underscore
 * ("World's" → "world_s", "Brené" → "brene").
 */
export function toSlugPart(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Trailing "| TED", "| TEDxHouston", "| TED-Ed" — the channel, not part of the talk. */
const BRAND = /^ted/i

/**
 * Candidate slugs from a YouTube title, best first, at most `MAX_SLUG_CANDIDATES`.
 *
 * Shapes seen on TED's channel:
 *   "The Power of Vulnerability | Brené Brown | TED"   (current)
 *   "Try something new for 30 days | Matt Cutts"      (older)
 *   "Simon Sinek: How great leaders inspire action"   (oldest)
 * Joint talks list speakers in either order ("Esther Perel and Sal Khan" for
 * slug `sal_khan_and_esther_perel_…`), so both orders are tried.
 */
export function slugCandidates(youtubeTitle: string): string[] {
  const parts = youtubeTitle.split('|').map((part) => part.trim()).filter(Boolean)
  while (parts.length > 1 && BRAND.test(parts[parts.length - 1]!)) parts.pop()

  const pairs: { speaker: string; title: string }[] = []
  if (parts.length >= 2) {
    pairs.push({ title: parts[0]!, speaker: parts[1]! })
  } else if (parts.length === 1) {
    const colon = parts[0]!.indexOf(':')
    if (colon > 0) pairs.push({ speaker: parts[0]!.slice(0, colon), title: parts[0]!.slice(colon + 1) })
  }

  const candidates: string[] = []
  for (const { speaker, title } of pairs) {
    const speakers = [speaker]
    const joint = speaker.split(/\s+(?:and|&)\s+/i)
    if (joint.length === 2) speakers.push(`${joint[1]!} and ${joint[0]!}`)

    for (const name of speakers) {
      const slug = [toSlugPart(name), toSlugPart(title)].filter(Boolean).join('_')
      if (slug.includes('_') && !candidates.includes(slug)) candidates.push(slug)
    }
  }
  return candidates.slice(0, MAX_SLUG_CANDIDATES)
}

/** Thrown inside the cache so a "not public" answer is never cached — the video may go public tomorrow. */
class NotPublicError extends Error {}

async function fetchOEmbedLive(videoId: string): Promise<YouTubeVideoInfo> {
  const url = new URL(OEMBED_URL)
  url.searchParams.set('format', 'json')
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`)

  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS), cache: 'no-store' })
  } catch (cause) {
    throw new AppError(ERROR_CODES.UPSTREAM_FAILED, 'Could not reach YouTube oEmbed', { cause })
  }

  // 401/403: private or embedding disabled. 400/404: removed or not a video.
  if ([400, 401, 403, 404].includes(response.status)) throw new NotPublicError()
  if (!response.ok) throw new AppError(ERROR_CODES.UPSTREAM_FAILED, `YouTube oEmbed returned ${response.status}`)

  const parsed = OEmbedSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new AppError(ERROR_CODES.UPSTREAM_FAILED, 'YouTube oEmbed sent an unexpected payload')
  return { title: parsed.data.title, channel: parsed.data.author_name }
}

/** Title and channel of a public video, or null when YouTube shows it to no one. */
export async function fetchYouTubeVideoInfo(videoId: string): Promise<YouTubeVideoInfo | null> {
  if (!YOUTUBE_VIDEO_ID.test(videoId)) return null
  try {
    // Same split as TED fetches: Next's shared data cache when running in Next,
    // a direct call in scripts and tests.
    if (!process.env.NEXT_RUNTIME) return await fetchOEmbedLive(videoId)
    return await unstable_cache(() => fetchOEmbedLive(videoId), ['youtube-oembed', videoId], {
      revalidate: OEMBED_CACHE_SECONDS,
    })()
  } catch (error) {
    if (error instanceof NotPublicError) return null
    throw error
  }
}

export interface MatchDeps {
  videoInfo?: (videoId: string) => Promise<YouTubeVideoInfo | null>
  tedYouTubeCode?: (slug: string) => Promise<string | null>
}

/**
 * The TED talk that is this YouTube video, proven by TED's page listing the
 * same video id.
 *
 * A candidate slug that does not exist on TED is just a miss. Any other TED
 * failure — blocked, rate limited, unreachable — is thrown: reporting "no such
 * talk" when TED simply did not answer would be a false negative.
 */
export async function findTedTalkForYouTube(videoId: string, deps: MatchDeps = {}): Promise<YouTubeTedMatch> {
  const videoInfo = deps.videoInfo ?? fetchYouTubeVideoInfo
  const tedYouTubeCode = deps.tedYouTubeCode ?? fetchTedYouTubeCode

  const info = await videoInfo(videoId)
  if (!info) return { status: 'unavailable' }

  const kind = channelKind(info.channel)
  const notFound: YouTubeTedMatch = { status: 'not-found', title: info.title, channel: info.channel, kind }
  // Not a TED upload: no ted.com page will list it, so do not spend TED requests finding out.
  if (kind === 'other') return notFound

  for (const slug of slugCandidates(info.title)) {
    let code: string | null
    try {
      code = await tedYouTubeCode(slug)
    } catch (error) {
      if (error instanceof AppError && error.code === ERROR_CODES.VIDEO_UNAVAILABLE) continue
      throw error
    }
    if (code === videoId) return { status: 'found', slug }
  }

  return notFound
}

/** What to type into TED's own search for this video: its title and speaker, without the channel suffix. */
export function tedSearchQuery(youtubeTitle: string): string {
  const parts = youtubeTitle.split('|').map((part) => part.trim()).filter(Boolean)
  while (parts.length > 1 && BRAND.test(parts[parts.length - 1]!)) parts.pop()
  return parts.slice(0, 2).join(' ')
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}
