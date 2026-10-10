import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ERROR_CODES } from '@/lib/errors'
import { isTedMediaUrl, parseMediaPlaylist, pickAudioPlaylist } from '@/lib/ingest/hls-audio'
import { fetchTedTranscript } from '@/lib/ingest/ted'
import {
  readStoredTranscript,
  storedTranscriptPath,
  writeStoredTranscript,
  type StoredTranscript,
} from '@/lib/ingest/transcript-store'
import { measureAgainstReference, percentile, wordsToSegments, type WhisperWord } from '@/lib/ingest/whisper'
import type { Cue } from '@/types/transcript'

/*
 * Playlists below copy the shape of TED's real ones (checked 2026-10-10 on a
 * talk released the day before): a master listing video variants plus an
 * audio-only group, segments on pu.tedcdn.com.
 */
const MASTER_URL = 'https://hls.ted.com/project_masters/12017/manifest.m3u8'
const MASTER = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1255880,RESOLUTION=854x480,CODECS="avc1.64001f,mp4a.40.2",AUDIO="audio0"
index-f9-v1.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=168533,RESOLUTION=320x180,CODECS="avc1.4d400d,mp4a.40.2",AUDIO="audio0"
index-f1-v1.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="medium",LANGUAGE="en",AUTOSELECT=YES,DEFAULT=YES,CHANNELS="2",URI="index-f8-a1.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="low",LANGUAGE="en",AUTOSELECT=NO,DEFAULT=NO,CHANNELS="1",URI="index-f5-a1.m3u8"
`

describe('pickAudioPlaylist', () => {
  it('takes the mono audio-only rendition, not a video one', () => {
    expect(pickAudioPlaylist(MASTER, MASTER_URL)).toBe('https://hls.ted.com/project_masters/12017/index-f5-a1.m3u8')
  })

  it('falls back to the lowest-bandwidth variant when audio is muxed into the video', () => {
    const muxed = MASTER.split('\n').filter((line) => !line.startsWith('#EXT-X-MEDIA')).join('\n')
    expect(pickAudioPlaylist(muxed, MASTER_URL)).toBe('https://hls.ted.com/project_masters/12017/index-f1-v1.m3u8')
  })

  it('refuses a rendition hosted outside TED', () => {
    const foreign = MASTER.replace('URI="index-f5-a1.m3u8"', 'URI="https://evil.example/a.m3u8"')
    expect(() => pickAudioPlaylist(foreign, MASTER_URL)).toThrow(/outside TED/)
  })

  it('refuses something that is not a playlist', () => {
    expect(() => pickAudioPlaylist('<html></html>', MASTER_URL)).toThrow(/not an HLS playlist/)
  })
})

describe('parseMediaPlaylist', () => {
  const url = 'https://hls.ted.com/project_masters/12017/index-f5-a1.m3u8'
  const playlist = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:6.0140,
https://pu.tedcdn.com/consus/videos/12017/segment-1-f5-a1.ts
#EXTINF:5.9910,
https://pu.tedcdn.com/consus/videos/12017/segment-2-f5-a1.ts
#EXTINF:2.5,
segment-3-f5-a1.ts
#EXT-X-ENDLIST
`

  it('lists segments in order, resolving relative ones, and sums their length in ms', () => {
    const parsed = parseMediaPlaylist(playlist, url)
    expect(parsed.segmentUrls).toEqual([
      'https://pu.tedcdn.com/consus/videos/12017/segment-1-f5-a1.ts',
      'https://pu.tedcdn.com/consus/videos/12017/segment-2-f5-a1.ts',
      'https://hls.ted.com/project_masters/12017/segment-3-f5-a1.ts',
    ])
    expect(parsed.durationMs).toBe(6014 + 5991 + 2500)
  })

  it('refuses an encrypted stream', () => {
    const encrypted = playlist.replace('#EXT-X-PLAYLIST-TYPE:VOD', '#EXT-X-KEY:METHOD=AES-128,URI="https://hls.ted.com/k"')
    expect(() => parseMediaPlaylist(encrypted, url)).toThrow(/encrypted/)
  })

  it('refuses a master playlist handed in by mistake', () => {
    expect(() => parseMediaPlaylist(MASTER, MASTER_URL)).toThrow(/master playlist/)
  })

  it('refuses segments outside TED', () => {
    expect(() => parseMediaPlaylist(playlist.replace('pu.tedcdn.com', 'evil.example'), url)).toThrow(/outside TED/)
  })
})

describe('isTedMediaUrl', () => {
  it('accepts TED stream and CDN hosts over https only', () => {
    expect(isTedMediaUrl('https://hls.ted.com/x.m3u8')).toBe(true)
    expect(isTedMediaUrl('https://pu.tedcdn.com/x.ts')).toBe(true)
    expect(isTedMediaUrl('http://pu.tedcdn.com/x.ts')).toBe(false)
    expect(isTedMediaUrl('https://tedcdn.com.evil.example/x.ts')).toBe(false)
    expect(isTedMediaUrl('https://nottedcdn.com/x.ts')).toBe(false)
    expect(isTedMediaUrl('not a url')).toBe(false)
  })
})

// --- Words to lines -----------------------------------------------------------

function words(spec: readonly [number, number, string][]): WhisperWord[] {
  return spec.map(([startMs, endMs, text]) => ({ startMs, endMs, text }))
}

describe('wordsToSegments', () => {
  it('cuts after each sentence and starts a line on its first word', () => {
    const segments = wordsToSegments(
      words([
        [1200, 1500, ' Hello'],
        [1500, 1900, ' there.'],
        [2300, 2600, ' This'],
        [2600, 2800, ' is'],
        [2800, 3300, ' new.'],
      ]),
    )
    expect(segments).toEqual([
      { startMs: 1200, endMs: 1900, text: 'Hello there.' },
      { startMs: 2300, endMs: 3300, text: 'This is new.' },
    ])
  })

  it('cuts at a long pause even without punctuation', () => {
    const segments = wordsToSegments(
      words([
        [0, 400, ' and'],
        [400, 900, ' then'],
        [2500, 2900, ' later'],
      ]),
    )
    expect(segments.map((segment) => segment.text)).toEqual(['and then', 'later'])
    expect(segments[1]?.startMs).toBe(2500)
  })

  it('keeps Whisper’s own spacing, so contractions and punctuation stay attached', () => {
    const segments = wordsToSegments(
      words([
        [0, 300, ' I'],
        [300, 600, "'m"],
        [600, 900, ' sure,'],
        [900, 1200, ' "really."'],
      ]),
    )
    expect(segments[0]?.text).toBe('I\'m sure, "really."')
  })

  it('caps a run-on without punctuation', () => {
    const many = Array.from({ length: 95 }, (_, index): [number, number, string] => [index * 100, index * 100 + 90, ' word'])
    const segments = wordsToSegments(words(many))
    expect(segments.map((segment) => segment.text.split(' ').length)).toEqual([40, 40, 15])
  })

  it('drops empty words', () => {
    expect(wordsToSegments(words([[0, 100, '  ']]))).toEqual([])
  })
})

// --- Measuring against TED ----------------------------------------------------

function cue(idx: number, startMs: number, text: string): Cue {
  return { idx, startMs, endMs: startMs + 1000, text }
}

describe('measureAgainstReference', () => {
  const reference = [cue(0, 1000, 'Hello there, friends.'), cue(1, 5000, "It's a new day.")]

  it('scores an exact transcript as 0% error and measures each line start', () => {
    const accuracy = measureAgainstReference(
      reference,
      words([
        [1200, 1500, ' Hello'],
        [1500, 1700, ' there,'],
        [1700, 2000, ' friends.'],
        [4900, 5100, " It's"],
        [5100, 5200, ' a'],
        [5200, 5400, ' new'],
        [5400, 5600, ' day.'],
      ]),
    )
    expect(accuracy.wordErrorRate).toBe(0)
    expect(accuracy.referenceWords).toBe(7)
    expect(accuracy.startOffsetsMs).toEqual([200, -100])
    expect(accuracy.measuredCues).toBe(2)
  })

  it('counts a wrong word and skips a line whose first word was misheard', () => {
    const accuracy = measureAgainstReference(
      reference,
      words([
        [1200, 1500, ' Hello'],
        [1500, 1700, ' there,'],
        [1700, 2000, ' friends.'],
        [4900, 5100, ' Its'],
        [5100, 5200, ' a'],
        [5200, 5400, ' new'],
        [5400, 5600, ' day.'],
      ]),
    )
    expect(accuracy.wordErrorRate).toBeCloseTo(1 / 7)
    expect(accuracy.startOffsetsMs).toEqual([200])
  })
})

describe('percentile', () => {
  it('uses nearest rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3)
    expect(percentile([5, 1, 3, 2, 4], 1)).toBe(5)
    expect(percentile([], 0.5)).toBe(0)
  })
})

// --- Stored transcripts -------------------------------------------------------

const STREAM = 'https://hls.ted.com/project_masters/12017/manifest.m3u8'

function stored(overrides: Partial<StoredTranscript> = {}): StoredTranscript {
  return {
    version: 1,
    slug: 'new_talk',
    lang: 'en',
    streamPath: '/project_masters/12017/manifest.m3u8',
    durationMs: 944_000,
    engine: 'faster-whisper',
    engineVersion: '1.1.1',
    model: 'small.en',
    segments: [
      { startMs: 1200, endMs: 1900, text: 'Hello there.' },
      { startMs: 2300, endMs: 3300, text: 'This is a sentence long enough to stand alone as its own line.' },
    ],
    createdAt: '2026-10-10T00:00:00.000Z',
    ...overrides,
  }
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'transcript-store-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('transcript store', () => {
  const video = { slug: 'new_talk', lang: 'en', streamUrl: STREAM, durationMs: 944_000 }

  it('reads back what it wrote for the same video', () => {
    writeStoredTranscript(stored(), root)
    expect(readStoredTranscript(video, root)?.segments).toHaveLength(2)
  })

  it('accepts TED’s whole-second rounding of the length', () => {
    writeStoredTranscript(stored({ durationMs: 944_600 }), root)
    expect(readStoredTranscript(video, root)).not.toBeNull()
  })

  it('ignores a file made from a different video', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeStoredTranscript(stored(), root)
    expect(readStoredTranscript({ ...video, streamUrl: 'https://hls.ted.com/project_masters/99/manifest.m3u8' }, root)).toBeNull()
    expect(readStoredTranscript({ ...video, durationMs: 960_000 }, root)).toBeNull()
    expect(readStoredTranscript({ ...video, streamUrl: null }, root)).toBeNull()
  })

  it('ignores a malformed file instead of throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const path = storedTranscriptPath('new_talk', 'en', root)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '{"version":1}', 'utf8')
    expect(readStoredTranscript(video, root)).toBeNull()
  })

  it('returns null when there is no file', () => {
    expect(readStoredTranscript(video, root)).toBeNull()
  })

  it('refuses to write seconds-looking or empty data', () => {
    expect(() => writeStoredTranscript(stored({ segments: [] }), root)).toThrow()
    expect(() => writeStoredTranscript(stored({ streamPath: 'project_masters/1' }), root)).toThrow()
  })
})

// --- The app's transcript, when TED has none ----------------------------------

function tedPage(withTranscript: boolean): string {
  const props = {
    videoData: {
      title: 'Invented new talk',
      duration: 944,
      internalLanguageCode: 'en',
      hlsUrl: `${STREAM}?intro_master_id=9294`,
    },
    transcriptData: {
      translation: withTranscript
        ? { language: { internalLanguageCode: 'en', endonym: 'English' }, paragraphs: [{ cues: [{ time: 0, text: 'From TED.' }] }] }
        : null,
    },
  }
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: props } })}</script></html>`
}

function stubTed(withTranscript: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(tedPage(withTranscript), { status: 200 }))),
  )
}

describe('fetchTedTranscript with a Whisper file', () => {
  it('uses the stored transcript when TED has none, marked as Whisper', async () => {
    stubTed(false)
    writeStoredTranscript(stored(), root)
    const lookup = vi.fn((video: Parameters<typeof readStoredTranscript>[0]) => readStoredTranscript(video, root))

    const transcript = await fetchTedTranscript('new_talk', { storedTranscript: lookup })

    expect(lookup).toHaveBeenCalledWith({ slug: 'new_talk', lang: 'en', streamUrl: STREAM, durationMs: 944_000 })
    expect(transcript.origin).toBe('whisper')
    expect(transcript.isAutoGenerated).toBe(true)
    expect(transcript.langLabel).toBe('English')
    expect(transcript.cues[0]).toMatchObject({ startMs: 1200, text: expect.stringContaining('Hello there.') })
  })

  it('still reports no transcript when there is no file', async () => {
    stubTed(false)
    await expect(
      fetchTedTranscript('new_talk', { storedTranscript: (video) => readStoredTranscript(video, root) }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NO_CAPTIONS })
  })

  it('prefers TED’s own transcript and never reads the file then', async () => {
    stubTed(true)
    const lookup = vi.fn(() => null)
    const transcript = await fetchTedTranscript('new_talk', { storedTranscript: lookup })
    expect(lookup).not.toHaveBeenCalled()
    expect(transcript.origin).toBe('captions')
    expect(transcript.isAutoGenerated).toBe(false)
  })
})
