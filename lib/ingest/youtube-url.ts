/**
 * YouTube link DETECTION only.
 *
 * There is deliberately no YouTube fetcher any more. YouTube serves caption
 * tracks as HTTP 200 with an empty body unless the request carries a
 * proof-of-origin token minted by their own BotGuard script, which a server
 * cannot produce. Every route was tried and measured: the watch-page baseUrl
 * (all formats), the same URL with browser Referer/Origin, the innertube
 * `player` endpoint on the ANDROID / IOS / TVHTML5 clients and on the page's
 * own API key, and `get_transcript`. None return cues.
 *
 * What this module does instead: recognise a pasted YouTube link and pull out
 * its video id, so `youtube-ted.ts` can look for the same talk on ted.com —
 * where the transcript is public — rather than shrug "unsupported link".
 */

export const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/

/** True when the input looks like a YouTube video link or bare video id. */
export function isYouTubeLink(input: string): boolean {
  const trimmed = input.trim()
  if (trimmed.length === 0) return false
  if (YOUTUBE_VIDEO_ID.test(trimmed)) return true

  let url: URL
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    return false
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
  return (
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  )
}

const ID_PATH = /^\/(?:shorts|embed|live|v)\/([\w-]{11})(?:[/?#]|$)/

/**
 * The 11-character video id from any common YouTube link shape — watch,
 * youtu.be, shorts, embed, live, mobile, nocookie — or a bare id. Null for
 * anything else, including playlist and channel links that name no video.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim()
  // A bare id must look like one: an 11-letter lowercase word typed into the
  // search box ("procrastina") is someone searching titles, not pasting an id.
  if (YOUTUBE_VIDEO_ID.test(trimmed)) return /[A-Z0-9_-]/.test(trimmed) ? trimmed : null
  if (!isYouTubeLink(trimmed)) return null

  const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')

  const candidate =
    host === 'youtu.be'
      ? url.pathname.slice(1).split('/')[0]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : ID_PATH.exec(url.pathname)?.[1]

  return candidate && YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null
}
