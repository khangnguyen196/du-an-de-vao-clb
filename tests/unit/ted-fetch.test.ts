import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { fetchTedTranscript, tedStreamUrl } from '@/lib/ingest/ted'

/*
 * TED stand-in. These pages are invented — they prove the retry and error
 * mapping, not that the real ted.com still looks like this.
 */
function page(lang: 'en' | 'vi'): string {
  const props = {
    videoData: {
      title: 'Invented talk',
      duration: 60,
      internalLanguageCode: 'en',
      hlsUrl: 'https://hls.ted.com/project_masters/1/manifest.m3u8?intro_master_id=9294',
    },
    transcriptData: {
      translation: {
        language: { internalLanguageCode: lang, endonym: lang === 'vi' ? 'Tiếng Việt' : 'English' },
        paragraphs: [
          {
            cues: [
              { time: 0, text: lang === 'vi' ? 'Một câu bịa ra.' : 'An invented sentence.' },
              { time: 4000, text: lang === 'vi' ? 'Thêm một câu nữa.' : 'And one more.' },
            ],
          },
        ],
      },
    },
  }
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: props } })}</script></html>`
}

const timeout = () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
const ok = (html: string) => Promise.resolve(new Response(html, { status: 200 }))

/** A response whose body dies halfway through, as a timeout during `text()` does. */
function stalledBody(): Promise<Response> {
  const response = new Response('partial')
  vi.spyOn(response, 'text').mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
  return Promise.resolve(response)
}

function stubFetch(byLang: Record<'en' | 'vi', (() => Promise<Response>)[]>) {
  const calls = { en: 0, vi: 0 }
  const fetchMock = vi.fn((url: string) => {
    const lang = new URL(url).searchParams.get('language') === 'vi' ? 'vi' : 'en'
    const queue = byLang[lang]
    const next = queue[Math.min(calls[lang], queue.length - 1)]!
    calls[lang] += 1
    return next()
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchTedTranscript against a slow TED', () => {
  it('retries once after a timeout and returns the transcript', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls = stubFetch({ en: [timeout, () => ok(page('en'))], vi: [() => ok(page('vi'))] })

    const transcript = await fetchTedTranscript('invented_talk')

    expect(calls.en).toBe(2)
    expect(transcript.cues.length).toBeGreaterThan(0)
    expect(transcript.translationFetchFailed).toBeUndefined()
  })

  it('reports a body that stalls as unreachable, not as an unexpected error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch({ en: [stalledBody], vi: [() => ok(page('vi'))] })

    const error = await fetchTedTranscript('invented_talk').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe(ERROR_CODES.UPSTREAM_FAILED)
  })

  it('does not retry a refusal', async () => {
    const calls = stubFetch({ en: [() => Promise.resolve(new Response('', { status: 404 }))], vi: [() => ok(page('vi'))] })

    await expect(fetchTedTranscript('invented_talk')).rejects.toMatchObject({ code: ERROR_CODES.VIDEO_UNAVAILABLE })
    expect(calls.en).toBe(1)
  })

  it('keeps the transcript and flags the translation as failed, not absent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch({ en: [() => ok(page('en'))], vi: [timeout, timeout] })

    const transcript = await fetchTedTranscript('invented_talk')

    expect(transcript.cues.length).toBeGreaterThan(0)
    expect(transcript.translation).toBeUndefined()
    expect(transcript.translationFetchFailed).toBe(true)
  })

  it('does not flag a talk that simply has no translation', async () => {
    // TED answers a missing language with the English page.
    stubFetch({ en: [() => ok(page('en'))], vi: [() => ok(page('en'))] })

    const transcript = await fetchTedTranscript('invented_talk')
    expect(transcript.translation).toBeUndefined()
    expect(transcript.translationFetchFailed).toBeUndefined()
  })
})

describe('tedStreamUrl', () => {
  /** Transcript times start at the talk, so the 3.5 s intro would put every highlight early. */
  it('drops the intro from the stream', () => {
    expect(tedStreamUrl('https://hls.ted.com/project_masters/9629/manifest.m3u8?intro_master_id=9294')).toBe(
      'https://hls.ted.com/project_masters/9629/manifest.m3u8',
    )
  })

  it('accepts only TED’s own HLS host over https', () => {
    expect(tedStreamUrl('https://evil.example/manifest.m3u8')).toBeNull()
    expect(tedStreamUrl('http://hls.ted.com/project_masters/1/manifest.m3u8')).toBeNull()
    expect(tedStreamUrl('https://hls.ted.com/project_masters/1/video.mp4')).toBeNull()
    expect(tedStreamUrl('not a url')).toBeNull()
    expect(tedStreamUrl(undefined)).toBeNull()
  })

  it('reaches the transcript source', async () => {
    stubFetch({ en: [() => ok(page('en'))], vi: [() => ok(page('vi'))] })
    const transcript = await fetchTedTranscript('invented_talk')
    expect(transcript.source.streamUrl).toBe('https://hls.ted.com/project_masters/1/manifest.m3u8')
  })
})
