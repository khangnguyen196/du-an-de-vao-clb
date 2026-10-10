import { unstable_cache } from 'next/cache'
import { alignTranslation, type TimedText } from '@/lib/ingest/align'
import { AppError, ERROR_CODES } from '@/lib/errors'
import { createSemaphore, QueueFullError } from '@/lib/limits/rate-limit'
import { normalizeCues, type RawSegment } from '@/lib/ingest/normalize'
import type { TalkVideoRef } from '@/lib/ingest/transcript-store'
import type { Transcript, TranscriptOrigin, TranscriptTranslation, TranslationCredit } from '@/types/transcript'

/**
 * Per attempt, headers and body together. TED answers in anything from under
 * two seconds to past twelve for the very same page, so a single tight budget
 * failed first visits that a reload then served fine.
 */
const REQUEST_TIMEOUT_MS = 15_000
/** One retry for a slow or dropped response; a refusal (403/404/429) is final. */
const REQUEST_ATTEMPTS = 2

/**
 * Requests to TED in flight at once from one server instance. A burst of new
 * talks waits its turn here instead of reaching TED all together — the thing
 * most likely to get the deployment's addresses blocked for everyone.
 */
const TED_CONCURRENCY = 4
/** Waiting requests beyond this are refused at once rather than piling up. */
const TED_MAX_QUEUE = 40
const tedSlots = createSemaphore({ concurrency: TED_CONCURRENCY, maxQueue: TED_MAX_QUEUE })

/**
 * A talk page is fetched from TED at most once a day for all visitors: the
 * parsed payload goes into Next's data cache, which on Vercel is shared by every
 * instance and survives deploys. Transcripts and translations change rarely; a
 * day-old copy is fine. Failures throw and are therefore never cached.
 */
const PAGE_CACHE_SECONDS = 24 * 60 * 60
const SLUG = /^[a-z0-9_]+$/i
const TED_ORIGIN = 'https://www.ted.com'

/** Every talk is shown with a Vietnamese line under each English one. */
export const DEFAULT_TRANSLATION_TARGET = 'vi'

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
} as const

/**
 * Accepts a full talk URL (with or without `/transcript`, with or without a
 * `?language=` query) or a bare slug. Returns null for anything else.
 */
export function parseTedSlug(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  if (SLUG.test(trimmed) && trimmed.includes('_')) return trimmed

  let url: URL
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  if (url.hostname.replace(/^www\./, '') !== 'ted.com') return null

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'talks') return null

  const slug = segments[1]
  return slug && SLUG.test(slug) ? slug : null
}

export function tedTalkUrl(slug: string, lang?: string): string {
  const url = new URL(`${TED_ORIGIN}/talks/${slug}`)
  if (lang) url.searchParams.set('language', lang)
  return url.toString()
}

/**
 * TED's HLS stream for a talk, with the intro bumper removed.
 *
 * The page links the stream with `intro_master_id`, which splices a 3.5 s TED
 * logo in front of the talk. Transcript times are measured from the start of
 * the talk itself (checked against speech onset in the audio: within 0.1-0.4 s
 * on four talks), so the intro would put every highlight 3.5 s early. Without
 * the parameter TED serves the talk alone.
 *
 * Only TED's own stream host is accepted — this URL ends up in a <video src>.
 */
export function tedStreamUrl(hlsUrl: string | undefined): string | null {
  if (!hlsUrl) return null
  let url: URL
  try {
    url = new URL(hlsUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'hls.ted.com' || !url.pathname.endsWith('.m3u8')) return null
  url.searchParams.delete('intro_master_id')
  return url.toString()
}

/** TED serves its own player from this origin; it is the official embed. */
export function tedEmbedUrl(slug: string): string {
  return `https://embed.ted.com/talks/${slug}`
}

// --- Page payload -----------------------------------------------------------

interface TedCue {
  time: number
  text: string
}

interface TedLanguage {
  internalLanguageCode?: string
  englishName?: string
  endonym?: string
}

interface TedUser {
  fullName?: string | null
  uri?: string | null
}

interface TedTranslation {
  /** TED returns a language object here, not a bare code string. */
  language?: TedLanguage
  translator?: TedUser | null
  reviewer?: TedUser | null
  paragraphs?: { cues?: TedCue[] }[]
}

export interface TedPageProps {
  videoData?: {
    hlsUrl?: string
    title?: string
    presenterDisplayName?: string
    duration?: number
    canonicalUrl?: string
    internalLanguageCode?: string
    videoPlayerData?: { thumb?: string; id?: string }
  }
  transcriptData?: {
    translation?: TedTranslation | null
  }
}

const NEXT_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/

function extractPageProps(html: string): TedPageProps | null {
  const raw = NEXT_DATA.exec(html)?.[1]
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { props?: { pageProps?: TedPageProps } }
    return parsed.props?.pageProps ?? null
  } catch {
    return null
  }
}

/** Worth asking again: the network or TED's servers, not TED saying no. */
class TransientTedError extends AppError {}

async function withTedSlot<T>(work: () => Promise<T>): Promise<T> {
  let release: () => void
  try {
    release = await tedSlots.acquire()
  } catch (error) {
    if (error instanceof QueueFullError) {
      throw new AppError(ERROR_CODES.RATE_LIMITED, 'Too many TED requests already waiting')
    }
    throw error
  }
  try {
    return await work()
  } finally {
    release()
  }
}

async function fetchTedHtmlOnce(slug: string, lang?: string): Promise<string> {
  // The timeout covers reading the body too. A page that stalls halfway through
  // arriving is as unreachable as one that never answered, and must say so
  // rather than surface as an unexpected error.
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(tedTalkUrl(slug, lang), { headers: BROWSER_HEADERS, signal, cache: 'no-store' })
  } catch (cause) {
    throw new TransientTedError(ERROR_CODES.UPSTREAM_FAILED, 'Could not reach TED', { cause })
  }

  if (response.status === 404) {
    throw new AppError(ERROR_CODES.VIDEO_UNAVAILABLE, `TED talk "${slug}" does not exist`)
  }
  if (response.status === 429 || response.status === 403) {
    throw new AppError(ERROR_CODES.UPSTREAM_BLOCKED, `TED refused the request (${response.status})`)
  }
  if (!response.ok) {
    const error = response.status >= 500 ? TransientTedError : AppError
    throw new error(ERROR_CODES.UPSTREAM_FAILED, `TED returned ${response.status}`)
  }

  try {
    return await response.text()
  } catch (cause) {
    throw new TransientTedError(ERROR_CODES.UPSTREAM_FAILED, 'TED stopped sending the page', { cause })
  }
}

async function fetchTedPagePropsLive(slug: string, lang?: string): Promise<TedPageProps> {
  let html: string | null = null
  for (let attempt = 1; html === null; attempt += 1) {
    try {
      html = await withTedSlot(() => fetchTedHtmlOnce(slug, lang))
    } catch (error) {
      if (!(error instanceof TransientTedError) || attempt >= REQUEST_ATTEMPTS) throw error
      console.warn(`[ted] ${slug}${lang ? ` (${lang})` : ''}: attempt ${String(attempt)} failed, retrying:`, error.message)
    }
  }

  const props = extractPageProps(html)
  if (!props) {
    throw new AppError(ERROR_CODES.UPSTREAM_BLOCKED, 'TED page carried no data payload')
  }
  return trimPageProps(props)
}

/**
 * Only what this app reads. The full payload carries related talks, comments
 * settings and more — caching all of it would multiply the cache size for
 * nothing.
 */
export function trimPageProps(props: TedPageProps): TedPageProps {
  const video = props.videoData
  const thumb = video?.videoPlayerData?.thumb
  return {
    ...(video
      ? {
          videoData: {
            ...(video.hlsUrl ? { hlsUrl: video.hlsUrl } : {}),
            ...(video.title ? { title: video.title } : {}),
            ...(video.presenterDisplayName ? { presenterDisplayName: video.presenterDisplayName } : {}),
            ...(video.duration ? { duration: video.duration } : {}),
            ...(video.canonicalUrl ? { canonicalUrl: video.canonicalUrl } : {}),
            ...(video.internalLanguageCode ? { internalLanguageCode: video.internalLanguageCode } : {}),
            ...(typeof thumb === 'string' ? { videoPlayerData: { thumb } } : {}),
          },
        }
      : {}),
    transcriptData: { translation: props.transcriptData?.translation ?? null },
  }
}

/**
 * The data cache only exists inside a running Next.js server. Scripts (the
 * translator agent) and unit tests call TED directly.
 */
function fetchTedPageProps(slug: string, lang?: string): Promise<TedPageProps> {
  if (!process.env.NEXT_RUNTIME) return fetchTedPagePropsLive(slug, lang)
  return unstable_cache(() => fetchTedPagePropsLive(slug, lang), ['ted-page-props', slug, lang ?? ''], {
    revalidate: PAGE_CACHE_SECONDS,
    tags: [`ted:${slug}`],
  })()
}

/** TED gives each cue a start but no end; the next cue's start is the end. */
function toTimedText(translation: TedTranslation | null | undefined, durationMs?: number): TimedText[] {
  const ordered = (translation?.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.cues ?? [])
    .sort((a, b) => a.time - b.time)

  return ordered.map((cue, index) => {
    const next = ordered[index + 1]
    return {
      startMs: cue.time,
      endMs: next ? next.time : Math.max(durationMs ?? cue.time + 5000, cue.time + 1000),
      text: cue.text,
    }
  })
}

function toCredit(role: TranslationCredit['role'], user: TedUser | null | undefined): TranslationCredit | null {
  if (!user?.uri) return null
  return {
    role,
    name: user.fullName?.trim() || null,
    url: new URL(user.uri, TED_ORIGIN).toString(),
  }
}

export interface ExtractedTranslation {
  fragments: TimedText[]
  label: string
  credits: TranslationCredit[]
}

/**
 * Pulls a translation out of a TED page, or returns null when the page does not
 * actually hold one in the requested language.
 *
 * The language check is the whole point of this function. Asked for a language
 * a talk lacks, TED does not error: an unknown code redirects to the English
 * page, and a known-but-missing one returns the page with no translation. A
 * naive reader would therefore take the English transcript and display it under
 * the English transcript, labelled as a Vietnamese translation.
 */
export function extractTranslation(props: TedPageProps, target: string): ExtractedTranslation | null {
  const translation = props.transcriptData?.translation
  const returned = translation?.language?.internalLanguageCode?.toLowerCase()
  if (returned !== target.toLowerCase()) return null

  const durationMs = props.videoData?.duration ? props.videoData.duration * 1000 : undefined
  const fragments = toTimedText(translation, durationMs)
  if (fragments.length === 0) return null

  return {
    fragments,
    label: translation?.language?.endonym ?? translation?.language?.englishName ?? target,
    credits: [toCredit('translator', translation?.translator), toCredit('reviewer', translation?.reviewer)].filter(
      (credit): credit is TranslationCredit => credit !== null,
    ),
  }
}

// --- Public API -------------------------------------------------------------

export interface FetchTedOptions {
  /** Transcript language, e.g. "en". TED serves translations off the same page. */
  lang?: string
  /**
   * Language to show under each line. Defaults to Vietnamese; `null` skips the
   * extra request entirely.
   */
  translateTo?: string | null
  /**
   * Where to look when TED's page has no transcript — in practice
   * `readStoredTranscript`, the Whisper files. Passed in rather than imported
   * because that store reads the disk, and this module is also bundled for the
   * browser (`tedEmbedUrl`).
   */
  storedTranscript?: (video: TalkVideoRef) => { segments: RawSegment[] } | null
}

/**
 * A missing translation must never cost the reader the transcript itself, so
 * every failure on this side collapses to "no translation" — but reports that
 * it was a failure, not an answer, so a cache does not keep it for long.
 */
async function fetchTranslation(
  slug: string,
  target: string,
): Promise<{ translation: ExtractedTranslation | null; failed: boolean }> {
  try {
    return { translation: extractTranslation(await fetchTedPageProps(slug, target), target), failed: false }
  } catch (error) {
    console.warn(`[ted] ${slug}: translation "${target}" unavailable:`, (error as Error).message)
    return { translation: null, failed: true }
  }
}

/**
 * TED ships the transcript inside the talk page itself, so one request gets
 * both metadata and cues. Cue times are already milliseconds — no unit
 * conversion, which is exactly how the rest of the app wants them.
 *
 * The translation is a second page request made in parallel, then aligned onto
 * the English sentences by time (see `alignTranslation`).
 */
export async function fetchTedTranscript(slug: string, options?: FetchTedOptions): Promise<Transcript> {
  if (!SLUG.test(slug)) {
    throw new AppError(ERROR_CODES.INVALID_URL, `"${slug}" is not a TED talk slug`)
  }

  const target = options?.translateTo === undefined ? DEFAULT_TRANSLATION_TARGET : options.translateTo

  const [props, translationResult] = await Promise.all([
    fetchTedPageProps(slug, options?.lang),
    target ? fetchTranslation(slug, target) : Promise.resolve({ translation: null, failed: false }),
  ])
  const translated = translationResult.translation

  const video = props.videoData
  const durationMs = video?.duration ? video.duration * 1000 : undefined
  const fragments = toTimedText(props.transcriptData?.translation, durationMs)
  const streamUrl = tedStreamUrl(video?.hlsUrl)
  const language = props.transcriptData?.translation?.language

  let segments: RawSegment[] = fragments
  let origin: TranscriptOrigin = 'captions'
  let lang = language?.internalLanguageCode ?? video?.internalLanguageCode ?? 'en'
  // The endonym is the language named in itself ("Tiếng Việt"), which reads
  // better to the person actually reading that transcript.
  let langLabel = language?.endonym ?? language?.englishName ?? lang

  if (fragments.length === 0) {
    // TED's own transcript always wins; a Whisper file only fills the gap
    // until TED publishes one.
    lang = options?.lang ?? video?.internalLanguageCode ?? 'en'
    const stored = options?.storedTranscript?.({ slug, lang, streamUrl, durationMs })
    if (!stored) throw new AppError(ERROR_CODES.NO_CAPTIONS, `TED talk "${slug}" has no transcript`)
    segments = stored.segments
    origin = 'whisper'
    langLabel = languageEndonym(lang)
  }

  let cues = normalizeCues(segments)
  let translation: TranscriptTranslation | undefined

  // Translating a transcript into its own language would just print it twice.
  if (translated && target && target.toLowerCase() !== lang.toLowerCase()) {
    const aligned = alignTranslation(cues, translated.fragments)
    cues = cues.map((cue, index) => {
      const text = aligned.texts[index]
      return text ? { ...cue, translation: text } : cue
    })
    translation = {
      lang: target,
      label: translated.label,
      origin: 'ted',
      credits: translated.credits,
      coverage: aligned.coverage,
    }
  }

  return {
    source: {
      kind: 'ted',
      externalId: slug,
      url: video?.canonicalUrl ?? tedTalkUrl(slug),
      title: video?.title ?? slug.replace(/_/g, ' '),
      ...(video?.presenterDisplayName ? { author: video.presenterDisplayName } : {}),
      ...(durationMs ? { durationMs } : {}),
      ...(video?.videoPlayerData?.thumb ? { thumbnailUrl: video.videoPlayerData.thumb } : {}),
      ...(streamUrl ? { streamUrl } : {}),
    },
    lang,
    langLabel,
    origin,
    isAutoGenerated: origin === 'whisper',
    cues,
    ...(translation ? { translation } : {}),
    ...(translationResult.failed ? { translationFetchFailed: true } : {}),
    availableTracks: [{ code: lang, label: langLabel, isAutoGenerated: origin === 'whisper' }],
  }
}

/** "en" → "English", in the language itself; the code when the runtime has no name for it. */
function languageEndonym(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

export interface TedTalkInfo {
  slug: string
  title: string
  author?: string
  durationMs?: number
  /** Spoken language of the talk as TED reports it. */
  lang: string
  /** TED's stream without the intro bumper; null when TED offers none. */
  streamUrl: string | null
  /** TED's page already carries a transcript. */
  hasTranscript: boolean
}

/**
 * The talk's video details without requiring a transcript — for the Whisper
 * script, which exists precisely for talks that have none.
 */
export async function fetchTedTalkInfo(slug: string): Promise<TedTalkInfo> {
  if (!SLUG.test(slug)) {
    throw new AppError(ERROR_CODES.INVALID_URL, `"${slug}" is not a TED talk slug`)
  }
  const props = await fetchTedPageProps(slug)
  const video = props.videoData
  return {
    slug,
    title: video?.title ?? slug.replace(/_/g, ' '),
    ...(video?.presenterDisplayName ? { author: video.presenterDisplayName } : {}),
    ...(video?.duration ? { durationMs: video.duration * 1000 } : {}),
    lang: props.transcriptData?.translation?.language?.internalLanguageCode ?? video?.internalLanguageCode ?? 'en',
    streamUrl: tedStreamUrl(video?.hlsUrl),
    hasTranscript: toTimedText(props.transcriptData?.translation).length > 0,
  }
}
