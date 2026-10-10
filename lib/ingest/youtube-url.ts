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
 * This module survives so a pasted YouTube link gets an honest explanation
 * instead of a generic "unsupported link" shrug.
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
