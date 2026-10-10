/**
 * Reading TED's HLS playlists to reach a talk's audio, for local Whisper
 * transcription (`scripts/transcribe.ts`). Parsing only — no network here, so
 * every rule below is unit-tested against playlist text.
 *
 * TED's master playlist lists the video renditions and, for most talks, a
 * separate audio-only group. The mono "low" audio of a 16-minute talk is about
 * 7 MB, so that is what gets fetched — never the video.
 */

/** Hosts TED serves playlists and segments from. Anything else is refused. */
export function isTedMediaUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return url.hostname === 'hls.ted.com' || url.hostname === 'tedcdn.com' || url.hostname.endsWith('.tedcdn.com')
}

/** `KEY=value,KEY="quoted, value"` → map. Values keep their case; keys are upper-cased. */
function parseAttributes(list: string): Map<string, string> {
  const attributes = new Map<string, string>()
  const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi
  for (const match of list.matchAll(pattern)) {
    const [, key, raw] = match
    if (!key || raw === undefined) continue
    attributes.set(key.toUpperCase(), raw.startsWith('"') ? raw.slice(1, -1) : raw)
  }
  return attributes
}

function resolveUri(uri: string, base: string): string {
  return new URL(uri, base).toString()
}

/**
 * The playlist to transcribe from: the audio-only rendition with the fewest
 * channels (mono is all speech recognition needs), else the lowest-bandwidth
 * variant — older talks mux audio into the video segments, and the decoder
 * reads the audio track out of those just as well.
 */
export function pickAudioPlaylist(master: string, masterUrl: string): string {
  const lines = master.split(/\r?\n/).map((line) => line.trim())
  if (lines[0] !== '#EXTM3U') throw new Error('not an HLS playlist')

  const audio: { uri: string; channels: number }[] = []
  const variants: { uri: string; bandwidth: number }[] = []

  lines.forEach((line, index) => {
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const attributes = parseAttributes(line.slice('#EXT-X-MEDIA:'.length))
      const uri = attributes.get('URI')
      if (attributes.get('TYPE') === 'AUDIO' && uri) {
        audio.push({ uri, channels: Number.parseInt(attributes.get('CHANNELS') ?? '2', 10) || 2 })
      }
    } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attributes = parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length))
      const uri = lines.slice(index + 1).find((next) => next.length > 0 && !next.startsWith('#'))
      if (uri) variants.push({ uri, bandwidth: Number.parseInt(attributes.get('BANDWIDTH') ?? '', 10) || Infinity })
    }
  })

  const chosen =
    audio.sort((a, b) => a.channels - b.channels)[0]?.uri ?? variants.sort((a, b) => a.bandwidth - b.bandwidth)[0]?.uri
  if (!chosen) throw new Error('the playlist lists no audio or video rendition')

  const url = resolveUri(chosen, masterUrl)
  if (!isTedMediaUrl(url)) throw new Error(`refusing a rendition outside TED's hosts: ${url}`)
  return url
}

export interface MediaPlaylist {
  segmentUrls: string[]
  /** Sum of the segment durations, for a sanity check against the talk's length. */
  durationMs: number
}

/**
 * Segment URLs in play order. An encrypted stream is refused rather than
 * fetched: the bytes would be useless, and decrypting is not something this
 * app does.
 */
export function parseMediaPlaylist(playlist: string, playlistUrl: string): MediaPlaylist {
  const lines = playlist.split(/\r?\n/).map((line) => line.trim())
  if (lines[0] !== '#EXTM3U') throw new Error('not an HLS playlist')
  if (lines.some((line) => line.startsWith('#EXT-X-STREAM-INF:'))) {
    throw new Error('expected a media playlist, got a master playlist')
  }

  const segmentUrls: string[] = []
  let durationMs = 0

  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY:')) {
      const method = parseAttributes(line.slice('#EXT-X-KEY:'.length)).get('METHOD')
      if (method && method !== 'NONE') throw new Error(`the stream is encrypted (${method})`)
    } else if (line.startsWith('#EXTINF:')) {
      const seconds = Number.parseFloat(line.slice('#EXTINF:'.length))
      // HLS states durations in seconds; converted here, at the boundary.
      if (Number.isFinite(seconds)) durationMs += Math.round(seconds * 1000)
    } else if (line.length > 0 && !line.startsWith('#')) {
      const url = resolveUri(line, playlistUrl)
      if (!isTedMediaUrl(url)) throw new Error(`refusing a segment outside TED's hosts: ${url}`)
      segmentUrls.push(url)
    }
  }

  if (segmentUrls.length === 0) throw new Error('the playlist has no segments')
  return { segmentUrls, durationMs }
}
